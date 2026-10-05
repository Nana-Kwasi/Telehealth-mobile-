import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AiMarkdown from '../../components/AiMarkdown';
import { ZC } from '../../constants/zencare';
import { api } from '../../services/apiClient';
import { streamAssist } from '../../services/aiStream';
import { startRecording, stopRecording, cancelRecording } from '../../services/aiVoice';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

/**
 * Conversational AI assistant.
 *
 * A chat rather than a form, because that is how people actually ask health
 * questions — one thing, then a follow-up.
 *
 * Two constraints shape it:
 *
 *  1. History is capped (the server keeps the last 8 turns). Unbounded
 *     transcripts cost more every turn and do not make the model more reliable.
 *
 *  2. A crisis reply is rendered as a distinct notice, not as a chat bubble,
 *     and carries no AI label — that text was written by people. Styling it
 *     like ordinary conversation would bury the one message that must not be
 *     skimmed past.
 */

/** Which task each routed service uses, and how to describe it to the user. */
const SERVICE_TASK = {
  medical:        { task: 'MEDICAL_INTAKE',      label: 'Medical Consultation' },
  psychiatry:     { task: 'PSYCHIATRY_INTAKE',   label: 'Psychiatry' },
  psychology:     { task: 'PSYCHOLOGY_SUPPORT',  label: 'Psychology & Counseling' },
  second_opinion: { task: 'SECOND_OPINION_PREP', label: 'Second Opinion' },
};

const SUGGESTIONS = [
  'What should I ask my doctor?',
  'Help me prepare for my session',
  'Explain a medical term',
];

/** Clinicians get prompts about their own work, not patient-facing ones. */
const CLINICIAN_SUGGESTIONS = [
  "What's on my schedule?",
  'Who is on my caseload?',
  'Help me structure a consultation note',
];

export default function AiChatScreen({ clinician = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [status, setStatus]     = useState(null);
  // Which service this conversation is about. Decided from the first message,
  // then held — re-routing every turn would make the assistant change character
  // mid-conversation.
  const [service, setService]   = useState(null);
  // The structured intake, once the person asks for one. Kept so a booking
  // made later in this conversation carries it to the clinician.
  const [intake, setIntake]     = useState(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [loading, setLoading]   = useState(true);
  // Read replies aloud on the device (expo-speech: on-device TTS, nothing is
  // sent anywhere). Remembered per device.
  const [speakReplies, setSpeakReplies] = useState(false);
  const spokenRef = useRef(-1);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      try { setStatus(await api('/api/v1/ai/status')); }
      catch { setStatus({ available: false }); }
      finally { setLoading(false); }
    })();
  }, []);

  /**
   * Follow the conversation only while the reader is already at the bottom.
   *
   * This used to scroll on every content-size change, which fires on each
   * streamed token — so scrolling up to re-read something dragged you straight
   * back down. Now moving away from the bottom stops the follow until you
   * return, the way a chat should behave.
   */
  const atBottomRef = useRef(true);

  const scrollToEnd = useCallback((force = false) => {
    if (!force && !atBottomRef.current) return;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const onScroll = useCallback((e) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    atBottomRef.current = distanceFromBottom < 80;
  }, []);

  /**
   * Work out which service this is about, from the first message only.
   *
   * Routing is a small, cheap call. Doing it once and holding the result keeps
   * the assistant consistent — a conversation that silently switched from
   * psychology to medical halfway through would be disorienting, and would
   * change what the model has been told it is doing.
   */
  /**
   * Work out which service this is about — WITHOUT blocking the reply.
   *
   * This used to be awaited before streaming started, which meant two
   * round-trips before a single word appeared. On a provider whose latency
   * swings between 2 and 40 seconds that felt broken. It now runs in the
   * background and applies from the next message onwards; the first reply goes
   * out immediately on the general task.
   *
   * Skipped for very short messages: "hi" carries no intent worth a call.
   */
  const routeServiceInBackground = (message) => {
    if (clinician || service) return;
    if (message.trim().length < 15) return;
    (async () => {
    try {
      const r = await api('/api/v1/ai/assist', {
        method: 'POST',
        body: { task: 'INTENT_ROUTING', message },
      });
      const raw = (r?.text || '').replace(/^```(json)?/i, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(raw);
      const picked = SERVICE_TASK[parsed?.service] ? parsed.service : null;
      if (picked) setService(picked);
    } catch {
      // Routing is a convenience. If it fails the conversation still works,
      // it just uses the general health task.
    }
    })();
  };

  /**
   * Photograph or pick a medical document and have it read back.
   *
   * Deliberately a separate endpoint from the chat turn: that path extracts
   * what a page SAYS and is forbidden from saying what it MEANS. Attaching an
   * image to an ordinary chat turn would put it in front of a prompt that is
   * allowed to reason freely.
   */
  /** Pick a PDF from Files. The server rasterises page 1 for the model. */
  const attachPdf = async () => {
    if (busy || attaching) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    try {
      // Read via fetch + FileReader rather than expo-file-system: that package
      // is only a transitive dependency here (not in package.json) and its v19
      // release moved readAsStringAsync, so importing it would break on the
      // next install. This path needs nothing extra.
      const blob = await (await fetch(asset.uri)).blob();
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('That file could not be read.'));
        r.readAsDataURL(blob);
      });
      if (b64.length > 8000000) {
        Alert.alert('Too large', 'That file is too large. Try a smaller document.');
        return;
      }
      await sendDocument(b64, 'application/pdf', asset.name || 'Read this document.');
    } catch (e) {
      Alert.alert('Could not read', e?.message || 'That file could not be opened.');
    }
  };

  /** Shared by the photo and PDF paths — one request, one set of states. */
  const sendDocument = async (base64, mimeType, label) => {
    setMessages((m) => [...m, { role: 'user', content: label || 'Read this document.' },
                               { role: 'assistant', content: '', pending: true }]);
    setAttaching(true);
    setBusy(true);
    scrollToEnd(true);
    try {
      const res = await api('/api/v1/ai/document/analyze', {
        method: 'POST',
        body: { imageBase64: base64, mimeType },
      });
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: 'assistant',
          content: res?.text || 'That document could not be read.',
          pending: false,
          documentNote: res?.ok ? res.disclaimer : null,
        };
        return next;
      });
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: 'assistant',
          content: e?.message || 'That document could not be read. Try a clearer photo.',
          pending: false,
        };
        return next;
      });
    } finally {
      setAttaching(false);
      setBusy(false);
    }
  };

  const attachDocument = async () => {
    if (busy || attaching) return;

    // Photo or PDF — a report arrives as either.
    const choice = await new Promise((resolve) => {
      Alert.alert('Add a document', 'What would you like to send?', [
        { text: 'Photo', onPress: () => resolve('photo') },
        { text: 'PDF file', onPress: () => resolve('pdf') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    });
    if (!choice) return;
    if (choice === 'pdf') { await attachPdf(); return; }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos unavailable',
        'Allow photo access in Settings to upload a document.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,          // legible for text; keeps the upload small
      base64: true,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    if (!asset.base64) {
      Alert.alert('Could not read', 'That image could not be read. Try another.');
      return;
    }
    if (asset.base64.length > 8000000) {
      Alert.alert('Too large', 'That photo is too large. Try a smaller one.');
      return;
    }

    await sendDocument(asset.base64, asset.mimeType || 'image/jpeg', 'Read this document.');
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;

    const mine = { role: 'user', content: message };
    const history = [...messages, mine]
      .filter((m) => !m.escalated && m.ok !== false && m.content)
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-8, -1);

    setMessages((m) => [...m, mine, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setBusy(true);
    atBottomRef.current = true;   // they just sent something; follow it
    scrollToEnd(true);

    // Replace the trailing placeholder as the answer arrives.
    const patchLast = (patch) =>
      setMessages((m) => {
        const next = [...m];
        const i = next.length - 1;
        if (i >= 0 && next[i].role === 'assistant') next[i] = { ...next[i], ...patch };
        return next;
      });

    // Use whatever service we already know; never wait for routing.
    // CLINICIAN_ASSISTANT, not CLINICAL_SUMMARY: the latter is gated behind a
    // medically-tuned model, so it blocked clinicians from saying anything at all.
    const task = clinician
      ? 'CLINICIAN_ASSISTANT'
      : (SERVICE_TASK[service]?.task || 'HEALTH_QUESTION');

    routeServiceInBackground(message);

    streamAssist({
      body: { task, message, history },
      onChunk: (piece) =>
        setMessages((m) => {
          const next = [...m];
          const i = next.length - 1;
          if (i >= 0 && next[i].role === 'assistant') {
            next[i] = { ...next[i], content: (next[i].content || '') + piece };
          }
          return next;
        }),
      onEscalation: (p) => {
        patchLast({ content: p.text, escalated: true, streaming: false });
        setBusy(false);
      },
      onRefusal: (p) => {
        patchLast({ content: p.text, ok: false, streaming: false });
        setBusy(false);
      },
      // The finished answer failed output screening — discard what was shown.
      onRetract: (p) => {
        patchLast({ content: p.text, ok: false, streaming: false });
        setBusy(false);
      },
      onDone: (p) => {
        patchLast({
          disclaimer: p?.disclaimer || null,
          streaming: false,
          // A booking the assistant is suggesting. Nothing exists yet.
          proposal: p?.proposal || null,
        });
        setBusy(false);
        scrollToEnd();
      },
      onError: (e) => {
        patchLast({
          content: e?.message || 'The assistant could not be reached. Please continue with your healthcare professional.',
          ok: false, streaming: false,
        });
        setBusy(false);
      },
    });
  };

  /**
   * Create the booking the person just confirmed.
   *
   * The request carries only the time and reason: the clinician is re-derived
   * server-side from their own care team, so nothing here can book with
   * somebody else's therapist. It lands as a request the clinician approves,
   * not a confirmed slot.
   */
  const confirmBooking = async (index, proposal) => {
    setMessages((m) => {
      const next = [...m];
      if (next[index]) next[index] = { ...next[index], booking: 'sending' };
      return next;
    });
    try {
      const res = await api('/api/v1/ai/booking/confirm', {
        method: 'POST',
        // A prepared intake rides along in the booking notes, so the
        // clinician reads it before the appointment rather than re-asking.
        // proposalId: the server confirms exactly what it proposed (a booking,
        // a reschedule or a cancellation) — nothing else can be altered here.
        body: proposal.proposalId
          ? { proposalId: proposal.proposalId,
              reason: proposal.kind === 'book' ? withIntake(proposal.reason, intake) : null }
          : { whenIso: proposal.whenIso, reason: withIntake(proposal.reason, intake) },
      });
      setMessages((m) => {
        const next = [...m];
        if (next[index]) next[index] = { ...next[index], booking: 'done', bookingMessage: res.message };
        return next;
      });
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        if (next[index]) {
          next[index] = {
            ...next[index], booking: 'failed',
            bookingMessage: e?.message || 'That could not be booked. Please try again.',
          };
        }
        return next;
      });
    }
  };

  /**
   * Organise what the person has said so far into an intake for the clinician.
   * Only their own words are sent; nothing is saved — it travels to the
   * clinician only inside a booking they confirm.
   */
  const prepareIntake = async () => {
    const said = messages.filter((m) => m.role === 'user' && m.content).map((m) => m.content);
    if (said.length === 0) return;
    setIntakeBusy(true);
    try {
      const res = await api('/api/v1/ai/intake/structure', {
        method: 'POST', body: { conversation: said.join('\n') },
      });
      if (res?.ok && res.fields) {
        setIntake(res.fields);
        setMessages((m) => [...m, { role: 'assistant', intake: res.fields,
          safetyFlag: res.safetyFlag, safetyMessage: res.safetyMessage }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant',
          content: res?.message || 'Your summary could not be prepared just now.' }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant',
        content: 'Your summary could not be prepared just now.' }]);
    } finally {
      setIntakeBusy(false);
    }
  };

  const declineBooking = (index) => {
    setMessages((m) => {
      const next = [...m];
      if (next[index]) next[index] = { ...next[index], booking: 'declined' };
      return next;
    });
  };

  useEffect(() => {
    AsyncStorage.getItem('nessa.ai.speak').then((v) => setSpeakReplies(v === '1')).catch(() => {});
    return () => { Speech.stop(); };
  }, []);

  const toggleSpeak = () => {
    setSpeakReplies((on) => {
      const next = !on;
      AsyncStorage.setItem('nessa.ai.speak', next ? '1' : '0').catch(() => {});
      if (!next) Speech.stop();
      return next;
    });
  };

  // Each finished reply is read once, as plain words.
  useEffect(() => {
    if (!speakReplies) return;
    const i = messages.length - 1;
    const last = messages[i];
    if (!last || last.role !== 'assistant' || last.streaming || !last.content || spokenRef.current === i) return;
    spokenRef.current = i;
    Speech.stop();
    Speech.speak(last.content.replace(/[*_#`>|-]+/g, ' ').replace(/\s+/g, ' ').slice(0, 1200));
  }, [messages, speakReplies]);

  const toggleRecording = async () => {
    if (recording) {
      setRecording(false);
      setBusy(true);
      let said = '';
      try {
        const res = await stopRecording();
        if (!res) return;
        if (res.escalated) {
          // A spoken crisis is handled exactly like a typed one, and the
          // transcript is never sent on to the model.
          setMessages((m) => [...m,
            { role: 'user', content: res.transcript },
            { role: 'assistant', content: res.text, escalated: true }]);
          return;
        }
        // Sent as spoken, like web: "book me a therapy session tomorrow
        // afternoon" runs the whole flow. Anything that acts still needs the
        // confirmation card, so a misheard request cannot book on its own.
        said = res.transcript || '';
      } catch (e) {
        setMessages((m) => [...m, {
          role: 'assistant', ok: false,
          content: e?.message || 'That recording could not be understood.',
        }]);
      } finally {
        setBusy(false);
        scrollToEnd();
      }
      if (said) send(said);
      return;
    }

    try {
      await startRecording();
      setRecording(true);
    } catch (e) {
      // Make sure the button returns to its resting state — a stuck "stop"
      // button with no recording behind it is the worst outcome here.
      setRecording(false);
      try { await cancelRecording(); } catch { /* already released */ }
      setMessages((m) => [...m, {
        role: 'assistant', ok: false,
        content: e?.message || 'The microphone could not be started.',
      }]);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={ZC.accent} size="large" /></View>;
  }

  if (status && !status.available) {
    return (
      <View style={styles.centered}>
        <Text style={styles.unavailable}>
          AI assistance is not available right now. Please continue with your healthcare professional.
        </Text>
      </View>
    );
  }

  const empty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={64}
        onContentSizeChange={() => scrollToEnd()}
      >
        {/* Disclosure once, at the top of the conversation. */}
        <View style={styles.disclosure}>
          <Text style={styles.disclosureText}>
            AI-generated health information. This does not replace a licensed healthcare
            professional. In an emergency call{' '}
            <Text style={styles.bold}>{status?.emergencyNumber || '112'}</Text>.
          </Text>
        </View>

        {service && SERVICE_TASK[service] ? (
          <View style={styles.serviceRow}>
            <Text style={styles.serviceText}>
              Preparing for: {SERVICE_TASK[service].label}
            </Text>
            <View style={styles.serviceActions}>
              {(service === 'medical' || service === 'psychiatry')
                && messages.some((m) => m.role === 'user') ? (
                <TouchableOpacity onPress={prepareIntake} disabled={intakeBusy || busy}
                  style={styles.intakeBtn}>
                  <Text style={styles.intakeBtnText}>
                    {intakeBusy ? 'Preparing…' : intake ? 'Update summary' : 'Summary for doctor'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setService(null)}>
                <Text style={styles.serviceChange}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {empty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>How can I help?</Text>
            <Text style={styles.emptySub}>
              {clinician
                ? 'Ask about your schedule, your caseload, terminology, or help structuring your notes.'
                : 'Ask about a health topic, a medical term, or what to raise with your clinician.'}
            </Text>
            {(clinician ? CLINICIAN_SUGGESTIONS : SUGGESTIONS).map((s) => (
              <TouchableOpacity key={s} style={styles.suggestion} onPress={() => send(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <View key={i} style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{m.content}</Text>
                </View>
              </View>
            );
          }
          if (m.intake) {
            return <IntakeCard key={i} fields={m.intake}
              safetyFlag={m.safetyFlag} safetyMessage={m.safetyMessage} />;
          }
          if (m.escalated) {
            return (
              <View key={i} style={styles.urgent}>
                <View style={styles.urgentHead}>
                  <Ionicons name="alert-circle" size={18} color="#9a3412" />
                  <Text style={styles.urgentTitle}>Please read this</Text>
                </View>
                <Text style={styles.urgentText}>{m.content}</Text>
              </View>
            );
          }
          return (
            <View key={i} style={styles.aiRow}>
              {m.disclaimer ? <Text style={styles.label}>{m.disclaimer}</Text> : null}
              {(m.streaming || m.pending) && !m.content ? (
                /* `pending` is the document-reading path. It was checked
                   nowhere, so uploading an image showed no indicator for the
                   ten-odd seconds the read takes — which reads as a hang. */
                <ThinkingLine reading={m.pending} />
              ) : (
                <View>
                  <AiMarkdown text={m.content} />
                  {m.streaming ? <Text style={styles.caret}>▍</Text> : null}
                </View>
              )}

              {m.proposal && !m.booking ? (
                <View style={styles.bookingCard}>
                  <Text style={styles.bookingTitle}>
                    {m.proposal.kind === 'cancel' ? 'Cancel this appointment?'
                      : m.proposal.kind === 'reschedule' ? 'Move this appointment?'
                      : 'Confirm this appointment?'}
                  </Text>
                  <Text style={styles.bookingRow}>{clinician ? 'Patient' : 'With'}  {m.proposal.clinicianName}</Text>
                  <Text style={styles.bookingRow}>When  {m.proposal.whenLabel}</Text>
                  {m.proposal.reason ? (
                    <Text style={styles.bookingRow}>About  {m.proposal.reason}</Text>
                  ) : null}
                  <Text style={styles.bookingNote}>
                    {m.proposal.kind === 'cancel' ? 'Nothing has changed yet. It is cancelled when you confirm.'
                      : clinician ? 'Nothing is booked yet. It is booked when you confirm.'
                      : `Nothing is booked yet. ${m.proposal.clinicianName} will confirm the request.`}
                  </Text>
                  <View style={styles.bookingActions}>
                    <TouchableOpacity style={styles.bookingConfirm}
                      onPress={() => confirmBooking(i, m.proposal)}>
                      <Text style={styles.bookingConfirmText}>Confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.bookingDecline} onPress={() => declineBooking(i)}>
                      <Text style={styles.bookingDeclineText}>Not now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {m.booking === 'sending' ? (
                <Text style={styles.bookingStatus}>Sending your request…</Text>
              ) : m.booking === 'done' ? (
                <View style={styles.bookingDone}>
                  <Ionicons name="checkmark-circle" size={16} color={ZC.success} />
                  <Text style={styles.bookingDoneText}>{m.bookingMessage}</Text>
                </View>
              ) : m.booking === 'failed' ? (
                <Text style={[styles.bookingStatus, { color: ZC.danger }]}>{m.bookingMessage}</Text>
              ) : m.booking === 'declined' ? (
                <Text style={styles.bookingStatus}>No appointment was booked.</Text>
              ) : null}

              {/* An extraction can be wrong in ways that read as authoritative,
                  so the caveat travels with the answer rather than sitting in
                  a one-time notice the user has already scrolled past. */}
              {m.documentNote ? (
                <View style={styles.docNote}>
                  <Ionicons name="alert-circle-outline" size={14} color="#92400e" />
                  <Text style={styles.docNoteText}>{m.documentNote}</Text>
                </View>
              ) : null}
            </View>
          );
        })}


      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={clinician ? 'Ask anything…' : 'Ask a health question…'}
          placeholderTextColor={ZC.ink4}
          multiline
          onSubmitEditing={() => send()}
        />
        <TouchableOpacity
          style={styles.micBtn}
          onPress={attachDocument}
          disabled={busy}
          accessibilityLabel="Upload a document"
        >
          <Ionicons name="document-attach-outline" size={20}
            color={busy ? ZC.ink4 : ZC.ink2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.micBtn, speakReplies && styles.speakOn]}
          onPress={toggleSpeak}
          accessibilityLabel={speakReplies ? 'Stop reading replies aloud' : 'Read replies aloud'}
          accessibilityState={{ selected: speakReplies }}
        >
          <Ionicons name={speakReplies ? 'volume-high-outline' : 'volume-mute-outline'} size={20}
            color={speakReplies ? ZC.accent : ZC.ink2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.micBtn, recording && styles.micBtnOn]}
          onPress={toggleRecording}
          disabled={busy && !recording}
          accessibilityLabel={recording ? 'Stop recording' : 'Record a voice message'}
        >
          <Ionicons name={recording ? 'stop' : 'mic-outline'} size={20}
            color={recording ? '#ffffff' : ZC.ink2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || busy) && styles.sendBtnOff]}
          onPress={() => send()}
          disabled={!input.trim() || busy}
          accessibilityLabel="Send message"
        >
          <Ionicons name="arrow-up" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {status?.remainingRequests !== undefined ? (
        <Text style={styles.quota}>{status.remainingRequests} requests left this hour</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * A worded waiting state.
 *
 * A bare spinner says "something is happening"; words say what. The phrasing
 * rotates so a long wait does not look frozen — with this provider a reply can
 * take tens of seconds, and a static label reads as a hang.
 */
/** The booking reason, with the prepared intake appended when there is one. */
function withIntake(reason, fields) {
  if (!fields) return reason;
  const list = (label, xs) => (xs && xs.length ? `${label}: ${xs.join(', ')}` : null);
  const lines = [
    fields.chiefComplaint ? `Main concern: ${fields.chiefComplaint}` : null,
    fields.onset ? `Started: ${fields.onset}` : null,
    list('Symptoms', fields.symptoms),
    list('Medications', fields.medications),
    list('Allergies', fields.allergies),
    list('Conditions', fields.conditions),
    fields.summary || null,
  ].filter(Boolean);
  if (lines.length === 0) return reason;
  return `${reason || 'Requested through the assistant.'}\n\nIntake summary (prepared by the assistant from the patient's own words, unverified):\n${lines.join('\n')}`;
}

/** The structured intake, shown back to the person before anyone else sees it. */
function IntakeCard({ fields, safetyFlag, safetyMessage }) {
  const rows = [
    ['Main concern', fields.chiefComplaint],
    ['Started', fields.onset],
    ['How long', fields.duration],
    ['Severity', fields.severity],
    ['Symptoms', (fields.symptoms || []).join(', ')],
    ['Medications', (fields.medications || []).join(', ')],
    ['Allergies', (fields.allergies || []).join(', ')],
    ['Conditions', (fields.conditions || []).join(', ')],
  ].filter(([, v]) => v);
  const missing = fields.missingInformation || [];
  const urgent = safetyFlag === 'emergency' || safetyFlag === 'self_harm';
  return (
    <View style={styles.intakeCard}>
      <Text style={styles.label}>AI-organised from what you said — check it before it is shared</Text>
      <Text style={styles.bookingTitle}>Summary for your doctor</Text>
      {urgent && safetyMessage ? (
        <View style={[styles.urgent, { marginBottom: 8 }]}>
          <Text style={styles.urgentText}>{safetyMessage}</Text>
        </View>
      ) : null}
      {fields.summary ? <Text style={styles.bookingRow}>{fields.summary}</Text> : null}
      {rows.map(([k, v]) => (
        <View key={k} style={styles.intakeRow}>
          <Text style={styles.intakeKey}>{k}</Text>
          <Text style={styles.intakeVal}>{v}</Text>
        </View>
      ))}
      {missing.length ? (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.intakeKey}>Your doctor may also ask:</Text>
          {missing.map((q, j) => <Text key={j} style={styles.bookingRow}>· {q}</Text>)}
        </View>
      ) : null}
      <Text style={styles.bookingNote}>Nothing has been saved. It is sent only with an appointment you confirm.</Text>
    </View>
  );
}

function ThinkingLine({ reading = false }) {
  const PHRASES = reading
    ? ['Reading your document…', 'Working through the page…', 'Checking the values…', 'Almost there…']
    : ['Thinking…', 'Reading your message…', 'Putting that together…', 'Almost there…'];
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 2600);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.thinkingRow}>
      <ActivityIndicator color={ZC.accent} size="small" />
      <Text style={styles.thinkingText}>{PHRASES[i]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#ffffff' },
  unavailable: { textAlign: 'center', color: ZC.ink3, fontSize: 14, lineHeight: 21 },
  thread: { padding: 16, paddingBottom: 24, gap: 14 },

  disclosure: {
    backgroundColor: 'rgba(80,70,189,0.07)', borderRadius: 10, padding: 11,
  },
  disclosureText: { fontSize: 11.5, lineHeight: 17, color: ZC.ink3 },
  bold: { fontWeight: '800', color: ZC.ink2 },

  empty: { paddingVertical: 28, gap: 10 },
  emptyTitle: { fontSize: 21, fontWeight: '800', color: ZC.ink },
  emptySub: { fontSize: 14, color: ZC.ink3, lineHeight: 20, marginBottom: 8 },
  suggestion: {
    borderWidth: 1, borderColor: 'rgba(13,13,13,0.14)', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  suggestionText: { fontSize: 14, color: ZC.ink2 },

  userRow: { alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: ZC.accent, borderRadius: 18, borderBottomRightRadius: 5,
    paddingVertical: 10, paddingHorizontal: 14, maxWidth: '85%',
  },
  userText: { color: '#ffffff', fontSize: 15, lineHeight: 21 },

  aiRow: { alignItems: 'flex-start', paddingRight: 8 },
  aiText: { fontSize: 15, lineHeight: 23, color: ZC.ink },
  serviceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(80,70,189,0.10)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  serviceText: { fontSize: 12, fontWeight: '700', color: ZC.accent },
  serviceChange: { fontSize: 12, fontWeight: '600', color: ZC.ink3 },
  serviceActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  intakeBtn: {
    borderWidth: 1, borderColor: 'rgba(80,70,189,0.35)', backgroundColor: '#ffffff',
    borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10,
  },
  intakeBtnText: { fontSize: 11.5, fontWeight: '700', color: ZC.accent },
  intakeCard: {
    borderWidth: 1, borderColor: 'rgba(80,70,189,0.25)', backgroundColor: '#f8f7ff',
    borderRadius: 14, padding: 14, gap: 4,
  },
  intakeRow: { flexDirection: 'row', gap: 8 },
  intakeKey: { minWidth: 96, fontSize: 12.5, fontWeight: '700', color: ZC.ink3 },
  intakeVal: { flex: 1, fontSize: 13, color: ZC.ink2 },
  caret: { color: ZC.accent, fontWeight: '700' },
  bookingCard: {
    marginTop: 12, borderWidth: 1, borderColor: 'rgba(80,70,189,0.30)',
    backgroundColor: 'rgba(80,70,189,0.06)', borderRadius: 14, padding: 14, gap: 4,
  },
  bookingTitle: { fontSize: 15, fontWeight: '800', color: ZC.ink, marginBottom: 4 },
  bookingRow: { fontSize: 13.5, color: ZC.ink2 },
  bookingNote: { fontSize: 11.5, color: ZC.ink3, marginTop: 8, lineHeight: 16 },
  docNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: 10, paddingVertical: 7, paddingHorizontal: 9,
  },
  // No flex:1 on the icon; flex:1 only on the text so it wraps instead of the
  // row stretching to fill the column.
  docNoteText: { flex: 1, fontSize: 11.5, color: '#92400e', lineHeight: 16 },
  bookingActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  bookingConfirm: {
    backgroundColor: ZC.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20,
  },
  bookingConfirmText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  bookingDecline: {
    borderWidth: 1, borderColor: 'rgba(13,13,13,0.18)', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#ffffff',
  },
  bookingDeclineText: { color: ZC.ink2, fontWeight: '600', fontSize: 14 },
  bookingStatus: { fontSize: 12.5, color: ZC.ink3, marginTop: 8, fontStyle: 'italic' },
  bookingDone: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  bookingDoneText: { fontSize: 13, color: ZC.success, flex: 1, lineHeight: 18 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  thinkingText: { fontSize: 14, color: ZC.ink3, fontStyle: 'italic' },
  label: { fontSize: 10.5, fontWeight: '700', color: ZC.warning, marginBottom: 5 },

  urgent: {
    backgroundColor: '#fff7ed', borderColor: '#fdba74', borderWidth: 2,
    borderRadius: 14, padding: 14,
  },
  urgentHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  urgentTitle: { fontSize: 14.5, fontWeight: '800', color: '#9a3412' },
  urgentText: { fontSize: 14.5, lineHeight: 22, color: '#7c2d12' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(13,13,13,0.14)',
    backgroundColor: '#ffffff',
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 44,
    borderWidth: 1, borderColor: 'rgba(13,13,13,0.16)', borderRadius: 22,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    fontSize: 15, color: ZC.ink, backgroundColor: '#ffffff',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: ZC.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.35 },
  micBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(13,13,13,0.16)', backgroundColor: '#ffffff',
  },
  micBtnOn: { backgroundColor: ZC.danger, borderColor: ZC.danger },
  speakOn: { backgroundColor: ZC.accentWash, borderColor: ZC.accent },
  quota: {
    fontSize: 10.5, color: ZC.ink4, textAlign: 'center',
    paddingBottom: Platform.OS === 'ios' ? 6 : 8, backgroundColor: '#ffffff',
  },
});
