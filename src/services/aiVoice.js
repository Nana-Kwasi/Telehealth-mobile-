import { Audio } from 'expo-av';
import { transcribe } from '../components/voice/speechApi';

/**
 * Voice input for the assistant.
 *
 * The recording is sent to the backend to be TRANSCRIBED, not answered. The
 * transcript is screened by the safety layer there, and only then does the
 * normal assist flow run. That ordering is the whole point: the safety layer
 * matches text, so audio that went straight to the model would bypass crisis
 * detection completely.
 */

/** Roughly 60 seconds of speech. Longer recordings cost more and say less. */
const MAX_DURATION_MS = 60_000;

let recording = null;

export async function startRecording() {
  // A recorder left prepared from a previous attempt makes createAsync throw
  // "Recorder is already prepared", and the UI then sticks in the recording
  // state with no way out. Always tear down whatever exists before starting.
  await forceRelease();

  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Microphone access is needed to record a voice message.');
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  try {
    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    recording = rec;

    // Hard stop, so a forgotten recording cannot run for minutes.
    setTimeout(() => { if (recording === rec) stopRecording().catch(() => {}); }, MAX_DURATION_MS);
    return rec;
  } catch (e) {
    // Leave nothing half-prepared behind, or the next attempt fails the same way.
    await forceRelease();
    throw new Error('The microphone could not be started. Please try again.');
  }
}

/** Tear down any recorder still held, ignoring whatever state it is in. */
async function forceRelease() {
  const rec = recording;
  recording = null;
  if (rec) {
    try { await rec.stopAndUnloadAsync(); } catch { /* already stopped */ }
  }
  try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch { /* ignore */ }
}

/** @return { transcript, escalated, safetyFlag, text } */
export async function stopRecording() {
  if (!recording) return null;
  const rec = recording;
  recording = null;

  await rec.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

  const uri = rec.getURI();
  if (!uri) throw new Error('Nothing was recorded.');

  // The dedicated speech recogniser (Whisper), not a chat model given audio: a chat model
  // "transcribed" an unclear clip as a whole made-up sentence, which then became the message.
  const r = await transcribe(uri);
  if (r.escalated) return { ok: true, transcript: r.text, escalated: true, text: r.safetyText };
  if (!r.text) throw new Error('Nothing could be heard in that recording.');
  return { ok: true, transcript: r.text, escalated: false };
}

export async function cancelRecording() {
  await forceRelease();
}
