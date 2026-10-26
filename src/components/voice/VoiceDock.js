import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import VoiceIo from '../../../modules/voice-io';
import VoiceOrb from './VoiceOrb';
import { pickOrbTheme } from './orbThemes';
import { speak, transcribe } from './speechApi';
import { ALL_PHRASES, DIDNT_CATCH, NO_CONNECTION, THINKING, STILL_THINKING, chooseAck, pickPhrase } from './voiceAcks';
import { ALL_BACKCHANNELS, classifyTurn, pickBackchannel } from './voiceTurn';
import { ZC } from '../../constants/zencare';

/**
 * Hands-free conversation with the assistant — ported from the Bankai care app's VoiceDock.
 *
 * Voice is a transport around the chat, never a second assistant: what the person says is
 * transcribed and screened on the server, then handed to the screen (`onUtterance`), which
 * sends it exactly as if it had been typed. The screen forwards that reply's stream back here
 * (onTurnStart / onDelta / onDone / onError) and it is spoken sentence by sentence while the
 * rest is still being written. Nothing is agreed to by voice: a booking still needs Confirm.
 *
 * Two audio paths:
 *   - native (the VoiceIo module, iOS dev and release builds): one echo-cancelled engine for
 *     microphone and speaker, so the person can talk over the reply to interrupt it, and the
 *     words said so far are transcribed during short pauses so the answer starts sooner
 *   - expo-av (Expo Go, Android): the microphone is closed while the assistant speaks;
 *     interrupting is a tap on the orb
 */

const NATIVE = !!VoiceIo;

// iOS 17+: while the assistant speaks the microphone is muted and the voice processor listens
// for the person instead — under playback the echo canceller turns a normal voice down to
// almost nothing, so a level threshold only ever caught a raised one.
const MUTED_BARGE = (() => {
  if (!NATIVE) return false;
  try {
    return !!VoiceIo.supportsMutedSpeechDetection?.();
  } catch {
    return false;
  }
})();

const METER_MS = 100;
const SPEECH_MIN_DB = -35;
const SPEECH_OVER_FLOOR_DB = 15;
const SPEECH_START_MS = 300;
const END_SILENCE_MS = 700;
const MAX_TURN_MS = 30000;
// expo-av path: restart the recorder after this long with no speech, so a long silent wait
// does not build one huge file.
const IDLE_RESTART_MS = 15000;
const BARGE_MIN_DB = -42;
const BARGE_OVER_FLOOR_DB = 12;
const BARGE_START_MS = 300;
const PRE_ROLL_MS = 1500;
const BARGE_PRE_ROLL_MS = 1500;
const SPEC_PAUSE_MS = 250;
const LIVE_CAPTION_MS = 2000;
const SPEC_MIN_SPEECH_MS = 800;
const HOLD_SILENCE_MS = 2500;
const MAX_HOLDS = 2;
const HESITATION_GIVE_UP_MS = 9000;
const CHARS_PER_SECOND = 15;
const FIRST_CHUNK_MIN = 1;
const CHUNK_MIN = 80;
const SPOKEN_LIMIT = 650;
const REST_ON_SCREEN = "I've put the rest on your screen.";
const SENTENCE_END = /[.!?](?=\s|$)|\n/g;

const dbToLevel = (db) => Math.max(0, Math.min(1, (db + 55) / 45));

// The room's level is carried between turns rather than re-learnt from the first reading of
// each one: when listening resumed while the person was already talking, their voice became
// "the room" and the start of the sentence was clipped.
const QUIET_ROOM_DB = -60;
const roomFloor = { db: null };
const freshVad = () => ({
  floor: roomFloor.db ?? QUIET_ROOM_DB,
  speechMs: 0, heard: false, heardAt: 0, lastSpeechAt: 0, startedAt: Date.now(),
});

const dlog = (msg) => {
  if (!NATIVE) return;
  try { VoiceIo.log?.(msg); } catch { /* diagnostics only */ }
};
const removeFile = (uri) => {
  if (!NATIVE || !uri) return;
  try { VoiceIo.deleteFile(uri); } catch { /* temp file, the OS clears it anyway */ }
};

const RECORDING_OPTIONS = { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true };

const VoiceDock = forwardRef(function VoiceDock({ onUtterance, onEscalation, onClose, onVoiceText }, ref) {
  const [phase, setPhase] = useState('warming');
  const [caption, setCaption] = useState('Getting ready…');
  const [heard, setHeard] = useState('');
  // A different orb design for each conversation.
  const [orbVariant] = useState(pickOrbTheme);
  const phaseRef = useRef('warming');
  const gotLevel = useRef(false);
  const levelRef = useRef(0);

  const recorder = useRef(null);     // expo-av Recording (fallback path)
  const sound = useRef(null);        // expo-av Sound (fallback path)

  const vad = useRef(freshVad());
  const barge = useRef({ floor: null, speechMs: 0 });

  const replyBuf = useRef('');
  const spokenChars = useRef(0);
  const capped = useRef(false);
  const replyDone = useRef(false);
  const ignoreReply = useRef(false);
  const clips = useRef([]);          // [{ text, audio: Promise<{uri, marks}|null>, reply, keep }]
  const playing = useRef(false);
  const nativeEnd = useRef(null);
  const spec = useRef(null);         // { takenAt, promise, turn }
  const lastSnapAt = useRef(0);
  const heardSoFar = useRef('');
  const turnSeq = useRef(0);
  const ackAudio = useRef({});
  const lastAck = useRef(null);
  const alive = useRef(true);
  const deciding = useRef(false);
  const lastBackchannel = useRef(null);

  // Spoken waiting: while the answer is being worked out and nothing is being said, say so —
  // a silent pause sounds like it has stopped. At most two phrases a turn (see voiceAcks).
  const WAIT_FIRST_MS = 2500;
  const WAIT_AGAIN_MS = 7000;
  const waitSaid = useRef(0);
  const waitTimer = useRef(null);
  const lastWait = useRef(null);
  const waitCheckRef = useRef(() => {});

  const go = (p) => {
    clearTimeout(waitTimer.current);
    if (p === 'thinking' && waitSaid.current < 2) {
      waitTimer.current = setTimeout(() => waitCheckRef.current(),
        waitSaid.current === 0 ? WAIT_FIRST_MS : WAIT_AGAIN_MS);
    }
    const prev = phaseRef.current;
    if (NATIVE && prev !== p) {
      try {
        VoiceIo.log?.(`phase ${prev} -> ${p}`);
        if (MUTED_BARGE && p === 'speaking') VoiceIo.setInputMuted(true);
        else if (MUTED_BARGE && prev === 'speaking') VoiceIo.setInputMuted(false);
      } catch { /* diagnostics only */ }
    }
    phaseRef.current = p;
    setPhase(p);
  };

  // ── expo-av recorder (fallback path) ──────────────────────────────────────────────────

  const startRecorder = async () => {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(
      RECORDING_OPTIONS,
      (s) => { if (recorder.current === recording && typeof s.metering === 'number') onMeterRef.current(s.metering); },
      METER_MS,
    );
    recorder.current = recording;
  };

  const stopRecorder = async () => {
    const rec = recorder.current;
    recorder.current = null;
    if (!rec) return null;
    try { await rec.stopAndUnloadAsync(); } catch { /* already stopped */ }
    return rec.getURI();
  };

  // ── Listening ─────────────────────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (!alive.current) return;
    try {
      if (!NATIVE) {
        await stopRecorder();
        await startRecorder();
        // expo-av reports levels as soon as it records.
        gotLevel.current = true;
      }
      vad.current = freshVad();
      spec.current = null;
      heardSoFar.current = '';
      setHeard('');
      turnSeq.current += 1;
      levelRef.current = 0;
      if (gotLevel.current) {
        setCaption('Listening…');
        go('listening');
      } else {
        setCaption('Getting ready…');
        go('warming');
      }
    } catch {
      setCaption("Couldn't start the microphone.");
      go('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = async () => {
    levelRef.current = 0;
    if (NATIVE) {
      try { return await VoiceIo.endCapture(); } catch { return null; }
    }
    return stopRecorder();
  };

  // The recording so far, sent to the recogniser without stopping it (native only).
  const snapshot = async (now) => {
    lastSnapAt.current = now;
    const turn = turnSeq.current;
    let uri = null;
    try { uri = await VoiceIo.snapshotCapture(); } catch { return; }
    if (!uri) return;
    const promise = transcribe(uri, { snapshot: true })
      // A failed request is not "nothing was said": marked so the turn retries, and if the
      // network really is down, says so rather than "I didn't catch that".
      .catch((e) => ({ failed: true, text: '', confidence: null, status: e?.status }))
      .then((result) => {
        removeFile(uri);
        if (!result?.failed && result?.text && turn === turnSeq.current && spec.current?.promise === promise) {
          heardSoFar.current = result.text;
          if (phaseRef.current === 'listening') setHeard(result.text);
        }
        return result;
      });
    spec.current = { takenAt: now, promise, turn };
  };

  const speakPhrase = (phrase) => {
    const audio = ackAudio.current[phrase];
    if (!audio) {
      setCaption(phrase);
      return false;
    }
    clips.current.unshift({ text: phrase, audio, keep: true });
    playNext();
    return true;
  };

  const resetReply = () => {
    waitSaid.current = 0;
    replyBuf.current = '';
    spokenChars.current = 0;
    capped.current = false;
    replyDone.current = false;
    ignoreReply.current = false;
    clips.current = [];
  };

  const finishTurn = useCallback(async (decided) => {
    if (phaseRef.current !== 'listening') return;
    go('transcribing');
    const v = vad.current;
    const ready = decided && !decided.retry
      ? { promise: Promise.resolve(decided) }
      : !decided && NATIVE && spec.current && spec.current.takenAt >= v.lastSpeechAt ? spec.current : null;
    const uri = await stopRecording();
    if (!v.heard || !uri) {
      removeFile(uri);
      startListening();
      return;
    }
    resetReply();
    setHeard(heardSoFar.current || '…');

    let result = null;
    try {
      // A transcription taken after the last moment of speech already covers the whole turn
      // (and was screened like any other); only without one is the turn uploaded again.
      const early = ready ? await ready.promise : null;
      result = early && !early.failed ? early : await transcribe(uri);
    } catch (e) {
      if (e?.status === 401) {
        setCaption('Your session has ended. Sign in again to keep talking.');
        go('error');
        return;
      }
      if (e?.status === 429) {
        setCaption(e.message);
        go('error');
        return;
      }
      replyDone.current = true;
      if (!speakPhrase(NO_CONNECTION)) setTimeout(startListening, 1500);
      return;
    } finally {
      removeFile(uri);
    }
    if (!alive.current) return;

    if (result.escalated && result.safetyText) {
      // A spoken crisis: the safety response is shown and said, and the words go no further.
      setHeard('');
      onEscalation?.(result.safetyText);
      replyDone.current = true;
      clips.current.push({ text: result.safetyText, audio: fetchClip(result.safetyText) });
      playNext();
      return;
    }

    const text = (result.text || '').trim();
    if (!text) {
      replyDone.current = true;
      if (!speakPhrase(DIDNT_CATCH)) setTimeout(startListening, 1500);
      return;
    }
    setHeard(text);
    const ack = chooseAck(text, lastAck.current);
    if (ack) {
      lastAck.current = ack;
      waitSaid.current = 1;   // the acknowledgement already says it is working on it
      speakPhrase(ack);
    }
    if (phaseRef.current === 'transcribing') go('thinking');
    onUtterance?.(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUtterance, onEscalation, startListening]);

  // "Mm-hmm." while still listening (native only — the microphone stays open under the echo
  // canceller).
  const playAside = async (phrase) => {
    const uri = (await ackAudio.current[phrase])?.uri;
    if (!uri || !alive.current || phaseRef.current !== 'listening') return;
    try {
      nativeEnd.current = null;
      const seconds = await VoiceIo.play(uri);
      vad.current.muteUntil = Date.now() + (seconds || 0.8) * 1000;
    } catch { /* a missed "mm-hmm" costs nothing */ }
  };

  const decideTurn = async () => {
    if (deciding.current) return;
    deciding.current = true;
    const v = vad.current;
    try {
      if (!spec.current || spec.current.takenAt < v.lastSpeechAt) await snapshot(Date.now());
      const s = spec.current;
      if (!s) { finishTurn(); return; }
      const result = await s.promise;
      if (phaseRef.current !== 'listening' || s.turn !== turnSeq.current) return;
      if (v.lastSpeechAt > s.takenAt) return; // they carried on talking
      if (!result || result.failed) { finishTurn({ retry: true }); return; }

      const kind = classifyTurn(result.text, result.confidence);
      const now = Date.now();
      if (kind === 'complete' || kind === 'unclear' || now - v.heardAt >= MAX_TURN_MS) {
        finishTurn(result);
        return;
      }
      if (kind === 'hesitation') {
        if (now - v.lastSpeechAt >= HESITATION_GIVE_UP_MS) {
          try { VoiceIo.cancelCapture(); } catch { /* nothing open */ }
          startListening();
          return;
        }
        if (!v.holds) {
          const phrase = pickBackchannel('hesitation', lastBackchannel.current);
          lastBackchannel.current = phrase;
          playAside(phrase);
        }
        v.holds = (v.holds || 0) + 1;
        v.endSilence = HOLD_SILENCE_MS;
        return;
      }
      if ((v.holds || 0) >= MAX_HOLDS) { finishTurn(result); return; }
      if (!v.holds) {
        const phrase = pickBackchannel('incomplete', lastBackchannel.current);
        lastBackchannel.current = phrase;
        playAside(phrase);
      }
      v.holds = (v.holds || 0) + 1;
      v.endSilence = HOLD_SILENCE_MS;
    } finally {
      deciding.current = false;
    }
  };

  const onMeter = (db) => {
    if (typeof db !== 'number') return;
    if (!gotLevel.current) {
      gotLevel.current = true;
      if (phaseRef.current === 'warming') {
        setCaption('Listening…');
        go('listening');
      }
    }
    if (phaseRef.current === 'speaking' || (phaseRef.current === 'thinking' && playing.current)) {
      levelRef.current = dbToLevel(db);
      if (NATIVE) detectBargeIn(db);
      return;
    }
    if (phaseRef.current !== 'listening') return;
    const v = vad.current;
    const now = Date.now();
    levelRef.current = dbToLevel(db);
    if (db < SPEECH_MIN_DB) {
      v.floor = db < v.floor ? db : v.floor + (db - v.floor) * 0.02;
      roomFloor.db = v.floor;
    }
    const isSpeech = db > SPEECH_MIN_DB && db > v.floor + SPEECH_OVER_FLOOR_DB && !(v.muteUntil > now);
    if (isSpeech) {
      v.speechMs += METER_MS;
      v.lastSpeechAt = now;
      v.endSilence = END_SILENCE_MS;
      if (v.speechMs >= SPEECH_START_MS && !v.heard) {
        v.heard = true;
        v.heardAt = now;
        if (NATIVE) VoiceIo.beginCapture(PRE_ROLL_MS);
      }
    } else if (!v.heard) {
      v.speechMs = Math.max(0, v.speechMs - METER_MS / 2);
    }
    if (!v.heard) {
      if (!NATIVE && now - v.startedAt >= IDLE_RESTART_MS) {
        phaseRef.current = 'restarting';
        stopRecording().then(startListening);
      }
      return;
    }
    const quietFor = now - v.lastSpeechAt;
    if (quietFor >= (v.endSilence || END_SILENCE_MS) || now - v.heardAt >= MAX_TURN_MS) {
      if (NATIVE) decideTurn();
      else finishTurn();
      return;
    }
    if (NATIVE && now - v.heardAt >= SPEC_MIN_SPEECH_MS) {
      const paused = now - v.lastSpeechAt >= SPEC_PAUSE_MS;
      const uncovered = !spec.current || spec.current.takenAt < v.lastSpeechAt;
      const captionDue = now - Math.max(lastSnapAt.current, v.heardAt) >= LIVE_CAPTION_MS;
      if ((paused && uncovered) || captionDue) snapshot(now);
    }
  };

  const detectBargeIn = (db) => {
    const b = barge.current;
    if (b.floor === null) b.floor = roomFloor.db ?? QUIET_ROOM_DB;
    if (db < BARGE_MIN_DB) b.floor = db < b.floor ? db : b.floor + (db - b.floor) * 0.02;
    if (db > BARGE_MIN_DB && db > b.floor + BARGE_OVER_FLOOR_DB) {
      b.speechMs += METER_MS;
      if (b.speechMs >= BARGE_START_MS) interrupt({ byVoice: true });
    } else {
      b.speechMs = Math.max(0, b.speechMs - METER_MS / 2);
    }
  };

  // Still thinking, nothing playing and no part of the answer queued yet: say a waiting phrase.
  waitCheckRef.current = () => {
    if (!alive.current || phaseRef.current !== 'thinking' || playing.current) return;
    if (clips.current.length || spokenChars.current > 0 || replyDone.current || ignoreReply.current) return;
    const phrase = pickPhrase(waitSaid.current === 0 ? THINKING : STILL_THINKING, lastWait.current);
    waitSaid.current += 1;
    lastWait.current = phrase;
    if (!speakPhrase(phrase)) go('thinking'); // not synthesised: keep the next check scheduled
  };

  const onMeterRef = useRef(onMeter);
  onMeterRef.current = onMeter;

  // ── Speaking ──────────────────────────────────────────────────────────────────────────

  // Resolves to { uri, marks } — marks being [char offset, seconds] — or null if it failed.
  const fetchClip = (text) => {
    const started = Date.now();
    return speak(text)
      .then(async ({ audioBase64, marks }) => {
        const uri = NATIVE ? await VoiceIo.writeClip(audioBase64) : `data:audio/mpeg;base64,${audioBase64}`;
        dlog(`speak ${Date.now() - started}ms for ${text.length} chars`);
        return { uri, marks };
      })
      .catch((e) => {
        dlog(`speak FAILED after ${Date.now() - started}ms: ${e?.message}`);
        return null;
      });
  };

  const stopPlayer = () => {
    if (NATIVE) {
      nativeEnd.current = null;
      try { VoiceIo.stopPlayback(); } catch { /* not playing */ }
      return;
    }
    const s = sound.current;
    sound.current = null;
    if (s) s.unloadAsync().catch(() => {});
  };

  // Resolves when the clip finishes; never, if stopped first — whoever stopped it has already
  // moved the turn on. `onStart(ms)` is called when sound begins, with the clip's length.
  const playClip = (uri, onStart) => new Promise((resolve) => {
    if (NATIVE) {
      nativeEnd.current = resolve;
      VoiceIo.play(uri)
        .then((seconds) => onStart?.(seconds ? seconds * 1000 : null))
        .catch(() => {
          nativeEnd.current = null;
          onStart?.(0);
          resolve();
        });
      return;
    }
    Audio.Sound.createAsync({ uri }, { shouldPlay: true }, (s) => {
      if (s.didJustFinish) {
        stopPlayer();
        resolve();
      }
    }).then(({ sound: s, status }) => {
      sound.current = s;
      onStart?.(status?.durationMillis || null);
    }).catch(() => {
      onStart?.(0);
      resolve();
    });
  });

  const afterSpeaking = () => {
    if (!alive.current || ignoreReply.current) return;
    if (replyDone.current && clips.current.length === 0) {
      onVoiceText?.({ type: 'all' });
      setTimeout(startListening, NATIVE ? 0 : 250);
    } else if (!replyDone.current && phaseRef.current === 'speaking') {
      go('thinking');
    }
  };

  const playNext = async () => {
    if (playing.current || !alive.current) return;
    const next = clips.current.shift();
    if (!next) { afterSpeaking(); return; }
    playing.current = true;
    // Waiting for this clip's audio is not speaking: stay thinking, microphone open, until
    // there is sound — or the first syllable of a cut-in is lost to the mute.
    if (phaseRef.current === 'speaking') go('thinking');
    const clip = await next.audio;
    const uri = clip?.uri;
    if (!alive.current || ignoreReply.current) { playing.current = false; return; }
    if (!uri) {
      if (next.reply) onVoiceText?.({ type: 'chunk', text: next.text, ms: 0 });
      playing.current = false;
      playNext();
      return;
    }
    if (phaseRef.current !== 'speaking') {
      if (!NATIVE) {
        // Loudspeaker, not the earpiece: iOS routes to the earpiece while recording is allowed.
        await stopRecorder();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      }
      barge.current = { floor: null, speechMs: 0 };
      go('speaking');
    }
    await playClip(uri, (ms) => {
      if (next.reply) {
        const lead = next.text.length - next.text.trimStart().length;
        onVoiceText?.({
          type: 'chunk',
          text: next.text,
          ms: ms ?? (next.text.length / CHARS_PER_SECOND) * 1000,
          marks: (clip.marks || []).map(([off, sec]) => [off + lead, sec * 1000]),
        });
      }
    });
    if (!next.keep) removeFile(uri);
    if (ignoreReply.current) return;
    playing.current = false;
    playNext();
  };

  const enqueue = (text, { reply = false } = {}) => {
    if (!text.trim()) return;
    clips.current.push({ text: reply ? text : text.trim(), audio: fetchClip(text.trim()), reply });
    playNext();
  };

  const drain = (final) => {
    if (capped.current) return;
    const buf = replyBuf.current;
    let cut = -1;
    SENTENCE_END.lastIndex = 0;
    let m;
    const min = spokenChars.current === 0 ? FIRST_CHUNK_MIN : CHUNK_MIN;
    while ((m = SENTENCE_END.exec(buf))) {
      cut = m.index + 1;
      if (cut >= min) break;
    }
    if (final) cut = buf.length;
    if (cut <= 0 || (!final && cut < min)) return;
    const chunk = buf.slice(0, cut);
    replyBuf.current = buf.slice(cut);
    if (spokenChars.current + chunk.length > SPOKEN_LIMIT && spokenChars.current > 0) {
      capped.current = true;
      enqueue(REST_ON_SCREEN);
      return;
    }
    spokenChars.current += chunk.length;
    enqueue(chunk, { reply: true });
    if (!final && replyBuf.current) drain(false);
  };

  const interrupt = ({ byVoice = false } = {}) => {
    onVoiceText?.({ type: 'stop' });
    ignoreReply.current = true;
    clips.current = [];
    playing.current = false;
    stopPlayer();
    if (byVoice && NATIVE) {
      // Already talking: their turn starts now, from just before they began.
      VoiceIo.beginCapture(BARGE_PRE_ROLL_MS);
      const now = Date.now();
      turnSeq.current += 1;
      spec.current = null;
      heardSoFar.current = '';
      setHeard('');
      vad.current = { ...freshVad(), heard: true, heardAt: now, lastSpeechAt: now, speechMs: SPEECH_START_MS };
      setCaption('Listening…');
      go('listening');
      return;
    }
    startListening();
  };

  const interruptRef = useRef(interrupt);
  interruptRef.current = interrupt;

  useImperativeHandle(ref, () => ({
    // A turn the microphone did not start (a suggestion tapped, a message typed): speak it too.
    onTurnStart() {
      if (!['listening', 'warming', 'muted', 'error'].includes(phaseRef.current)) return;
      if (NATIVE) { try { VoiceIo.cancelCapture(); } catch { /* nothing open */ } }
      else stopRecorder();
      resetReply();
      turnSeq.current += 1;
      setHeard('');
      go('thinking');
    },
    onDelta(chunk) {
      if (ignoreReply.current || phaseRef.current === 'listening') return;
      replyBuf.current += chunk;
      drain(false);
    },
    onDone() {
      if (ignoreReply.current) return;
      replyDone.current = true;
      drain(true);
      if (!playing.current && clips.current.length === 0) afterSpeaking();
    },
    onError(message) {
      if (ignoreReply.current) return;
      replyDone.current = true;
      clips.current = [];
      onVoiceText?.({ type: 'all' });
      setCaption(message || 'Something went wrong. Say that again?');
      setTimeout(startListening, 1500);
    },
  }));

  // Native events. The module keeps no state about listeners.
  useEffect(() => {
    if (!NATIVE) return undefined;
    const lv = VoiceIo.addListener('onLevel', (e) => onMeterRef.current(e.db));
    const end = VoiceIo.addListener('onPlaybackEnd', () => {
      const done = nativeEnd.current;
      nativeEnd.current = null;
      done?.();
    });
    const cutIn = VoiceIo.addListener('onSpeechWhileMuted', () => {
      if (phaseRef.current === 'speaking') interruptRef.current({ byVoice: true });
    });
    return () => { lv.remove(); end.remove(); cutIn.remove(); };
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    alive.current = true;
    (async () => {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setCaption('Allow microphone access in Settings to talk to the assistant.');
        go('error');
        return;
      }
      if (NATIVE) {
        try {
          await VoiceIo.start();
        } catch {
          setCaption("Couldn't start the microphone.");
          go('error');
          return;
        }
      }
      // Every acknowledgement synthesised up front: they must be instant when needed.
      for (const phrase of [...ALL_PHRASES, ...ALL_BACKCHANNELS]) {
        ackAudio.current[phrase] = fetchClip(phrase);
      }
      startListening();
    })();
    return () => {
      onVoiceText?.({ type: 'all' });
      alive.current = false;
      clearTimeout(waitTimer.current);
      ignoreReply.current = true;
      clips.current = [];
      stopPlayer();
      if (NATIVE) {
        try {
          VoiceIo.cancelCapture();
          if (MUTED_BARGE) VoiceIo.setInputMuted(false);
        } catch { /* nothing open */ }
        Object.values(ackAudio.current).forEach((p) => p.then((c) => removeFile(c?.uri)).catch(() => {}));
        VoiceIo.stop().catch(() => {});
      } else {
        stopRecorder().catch(() => {});
        Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOrb = () => {
    if (phaseRef.current === 'speaking') interrupt();
    else if (phaseRef.current === 'listening') { if (vad.current.heard) finishTurn(); }
    else if (phaseRef.current === 'error' || phaseRef.current === 'muted') startListening();
  };

  const toggleMute = async () => {
    if (phaseRef.current === 'muted') { startListening(); return; }
    if (phaseRef.current === 'listening') {
      if (NATIVE) { try { VoiceIo.cancelCapture(); } catch { /* nothing open */ } }
      else await stopRecording();
      setCaption('Muted');
      go('muted');
    }
  };

  const orbState = phase === 'speaking' ? 'speaking'
    : phase === 'thinking' || phase === 'transcribing' || phase === 'warming' ? 'thinking'
      : phase === 'muted' || phase === 'error' ? 'muted'
        : 'listening';

  const statusLine = phase === 'warming' ? 'Getting ready…'
    : phase === 'listening' ? (heard || 'Listening…')
      : phase === 'transcribing' || phase === 'thinking' ? (heard ? `“${heard}”` : 'Thinking…')
        : phase === 'speaking' ? ''
          : phase === 'muted' ? 'Muted'
            : caption;

  const hint = phase === 'speaking' ? (NATIVE ? 'Just start talking to interrupt' : 'Tap to interrupt')
    : phase === 'listening' ? "Speak naturally — I'll answer when you pause"
      : phase === 'muted' ? 'Tap the orb to talk'
        : '';

  return (
    <View style={styles.dock}>
      <VoiceOrb state={orbState} levelRef={levelRef} onPress={onOrb} variant={orbVariant} />
      <Text style={styles.caption} numberOfLines={2}>{statusLine}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrl, phase === 'muted' && styles.ctrlActive]} onPress={toggleMute}
          accessibilityLabel={phase === 'muted' ? 'Unmute' : 'Mute'}>
          <Text style={[styles.ctrlText, phase === 'muted' && styles.ctrlTextActive]}>
            {phase === 'muted' ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrl, styles.end]} onPress={onClose} accessibilityLabel="End voice conversation">
          <Text style={[styles.ctrlText, styles.endText]}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// Memoised: the chat screen re-renders on every streamed token, and none of that concerns the dock.
export default memo(VoiceDock);

/**
 * In voice mode the reply's text follows the voice: what is on screen is what has been said.
 * `visible(text)` cuts the reply being spoken to the part already heard.
 */
export function useVoiceReveal(active) {
  const sched = useRef({ base: 0, len: 0, ms: 0, start: 0, marks: null, all: true, stopped: false, at: 0 });
  const [, setTick] = useState(0);
  const timer = useRef(null);

  const allowed = useCallback(() => {
    const v = sched.current;
    if (v.all) return Infinity;
    if (v.stopped) return v.base;
    // Safety net, only once the voice has begun: if it then goes quiet for a long time after the
    // sentence it was saying (synthesis stuck), stop holding the words back. It used to count
    // from the question, so any answer the model took more than 8 s to start was shown as text
    // before a word of it was spoken. Before the first sentence nothing is shown: a sentence
    // that fails to synthesise is reported at once, and done or error releases everything.
    if (v.len > 0 && Date.now() - (v.start + v.ms) > 12000) return Infinity;
    const elapsed = Date.now() - v.start;
    const marks = v.marks;
    if (marks && marks.length > 1) {
      let shown = 0;
      for (let i = 0; i < marks.length; i += 1) {
        const [off, at] = marks[i];
        if (elapsed >= at) { shown = off; continue; }
        const [prevOff, prevAt] = i > 0 ? marks[i - 1] : [0, 0];
        const span = Math.max(1, at - prevAt);
        shown = prevOff + Math.floor((off - prevOff) * Math.max(0, (elapsed - prevAt) / span));
        break;
      }
      if (elapsed >= marks[marks.length - 1][1]) shown = v.len;
      return v.base + Math.min(v.len, shown);
    }
    const frac = v.ms > 0 ? Math.min(1, elapsed / v.ms) : 1;
    return v.base + Math.floor(v.len * frac);
  }, []);

  const ensureTimer = () => {
    if (timer.current) return;
    // 10 a second: each tick re-renders the chat, and the JS thread also runs the stream.
    timer.current = setInterval(() => {
      setTick((n) => n + 1);
      const v = sched.current;
      if (v.all || v.stopped || Date.now() - v.start > v.ms + 500) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }, 100);
  };

  const beginReply = useCallback(() => {
    sched.current = { base: 0, len: 0, ms: 0, start: Date.now(), marks: null, all: !active, stopped: false, at: Date.now() };
  }, [active]);

  const onVoiceText = useCallback((e) => {
    const v = sched.current;
    if (e.type === 'chunk') {
      sched.current = { ...v, base: v.base + v.len, len: e.text.length, ms: e.ms || 0,
        marks: e.marks && e.marks.length ? e.marks : null, start: Date.now(), at: Date.now() };
      ensureTimer();
    } else if (e.type === 'all') {
      sched.current = { ...v, all: true };
      setTick((n) => n + 1);
    } else if (e.type === 'stop') {
      const shown = allowed();
      sched.current = { ...v, stopped: true, all: false, base: Number.isFinite(shown) ? shown : v.base + v.len, len: 0 };
      setTick((n) => n + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => { if (!active) sched.current = { ...sched.current, all: true }; }, [active]);

  const visible = useCallback((text) => {
    const n = allowed();
    return Number.isFinite(n) ? String(text || '').slice(0, n) : text;
  }, [allowed]);

  const stoppedAt = () => (sched.current.stopped ? sched.current.base : null);

  return { onVoiceText, visible, beginReply, stoppedAt };
}

const styles = StyleSheet.create({
  dock: { alignItems: 'center', paddingTop: 4, paddingBottom: 10, paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)', backgroundColor: ZC.surface },
  caption: { marginTop: 2, minHeight: 40, fontSize: 16, lineHeight: 21, color: ZC.ink || '#14121f', textAlign: 'center' },
  hint: { fontSize: 12, color: '#5b6170', marginTop: 2, minHeight: 16 },
  controls: { flexDirection: 'row', marginTop: 10 },
  ctrl: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 22, marginHorizontal: 6,
    backgroundColor: ZC.accentWash, minHeight: 44, justifyContent: 'center' },
  ctrlActive: { backgroundColor: ZC.accent },
  ctrlText: { color: ZC.accentDeep, fontWeight: '600', fontSize: 15 },
  ctrlTextActive: { color: '#fff' },
  end: { backgroundColor: '#dc2626' },
  endText: { color: '#fff' },
});
