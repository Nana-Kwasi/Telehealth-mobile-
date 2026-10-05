import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';
import { startRecording, stopRecording, cancelRecording } from '../services/aiVoice';

/**
 * Turn what was said in a session into a SOAP draft, on the phone.
 *
 * The draft fills the form for the clinician to edit and sign. Nothing is
 * written to the record here — `onDraft` fills fields, it does not save.
 *
 * The Assessment section is only ever what the clinician said themselves; the
 * server leaves it empty when they said nothing assessable, because a model
 * that writes a diagnosis into a document a clinician then signs has made that
 * diagnosis with a human signature on it.
 *
 * Dictation is capped at 60 seconds by the voice service, and the copy says so
 * rather than implying this records a whole consultation: a base64 audio body
 * much longer than that exceeds the server's 2MB post limit and would fail
 * without explaining why.
 */
export default function AiNoteDraftMobile({ clientId, onDraft, accent = '#5046bd' }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy]           = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError]         = useState('');

  const beginRecording = async () => {
    setError('');
    try {
      await startRecording();
      setRecording(true);
    } catch (e) {
      setError(e?.message || 'The microphone could not be started.');
    }
  };

  const endRecording = async () => {
    setRecording(false);
    setBusy('Transcribing…');
    try {
      const res = await stopRecording();
      const text = res?.transcript || res?.text || '';
      if (text) setTranscript((t) => (t ? `${t}\n${text}` : text));
      else setError('Nothing could be transcribed from that recording.');
    } catch (e) {
      setError(e?.message || 'That recording could not be transcribed.');
    } finally {
      setBusy('');
    }
  };

  const abandonRecording = async () => {
    setRecording(false);
    try { await cancelRecording(); } catch { /* nothing held */ }
  };

  const draft = async () => {
    if (!transcript.trim()) {
      setError('Dictate or type what was said first — there is nothing to draft from.');
      return;
    }
    setBusy('Drafting…'); setError('');
    try {
      const res = await api('/api/v1/ai/clinical-note/draft', {
        method: 'POST',
        body: { subjectId: clientId || null, transcript, noteType: 'soap' },
      });
      if (!res?.ok) {
        setError(res?.message || 'The draft could not be prepared.');
        return;
      }
      onDraft?.({
        subjective: res.draft.subjective || '',
        objective:  res.draft.objective  || '',
        assessment: res.draft.assessment || '',
        plan:       res.draft.plan       || '',
        aiAuditId:  res.aiAuditId || null,
      });
    } catch (e) {
      setError(e?.message || 'The draft could not be prepared.');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: `${accent}1a` }]}>
          <Ionicons name="sparkles-outline" size={15} color={accent} />
        </View>
        {/* flex on the text only — never the row, or the icon stretches. */}
        <View style={styles.headText}>
          <Text style={styles.title}>Draft from the session</Text>
          <Text style={styles.sub}>
            Dictate a summary (up to a minute) or type what was said. The draft
            fills the fields below for you to edit — nothing is saved until you
            save it, and the assessment is only ever what you said yourself.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {!recording ? (
          <TouchableOpacity
            style={[styles.btn, !!busy && styles.btnOff]}
            onPress={beginRecording}
            disabled={!!busy}
          >
            <Ionicons name="mic-outline" size={14} color="#2c3040" />
            <Text style={styles.btnText}>Dictate</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={[styles.btn, styles.btnStop]} onPress={endRecording}>
              <Ionicons name="stop" size={13} color="#8f1d17" />
              <Text style={[styles.btnText, { color: '#8f1d17' }]}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={abandonRecording}>
              <Text style={styles.btnText}>Discard</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: accent, borderColor: accent },
                  (!!busy || !transcript.trim()) && styles.btnOff]}
          onPress={draft}
          disabled={!!busy || !transcript.trim()}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="sparkles" size={14} color="#ffffff" />
          )}
          <Text style={[styles.btnText, { color: '#ffffff' }]}>{busy || 'Draft the note'}</Text>
        </TouchableOpacity>
      </View>

      {recording ? (
        <Text style={styles.recording}>● Recording — everyone present should know.</Text>
      ) : null}

      <TextInput
        style={styles.transcript}
        value={transcript}
        onChangeText={setTranscript}
        placeholder="The transcript appears here, or type what was said."
        placeholderTextColor="#767c8c"
        multiline
        textAlignVertical="top"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1, borderColor: '#e4e7ee', borderRadius: 14,
    padding: 14, backgroundColor: '#fafbfd', marginBottom: 16,
  },
  head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  icon: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '750', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16.5, color: '#565c6e', marginTop: 2 },  /* 6.6:1 */

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 8 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9,
    borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#ffffff',
  },
  btnStop: { backgroundColor: '#fdeceb', borderColor: '#f3c7c3' },
  btnOff: { opacity: 0.5 },
  btnText: { fontSize: 12.5, fontWeight: '650', color: '#2c3040' },

  recording: { fontSize: 12, fontWeight: '700', color: '#8f1d17', marginBottom: 6 },
  transcript: {
    minHeight: 80, borderWidth: 1, borderColor: '#d8dce6', borderRadius: 9,
    paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 12.5, lineHeight: 18, color: '#2c3040', backgroundColor: '#ffffff',
  },
  error: { fontSize: 11.5, lineHeight: 16.5, color: '#8f1d17', marginTop: 8 },
});
