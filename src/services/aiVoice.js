import { Audio } from 'expo-av';
import { api } from './apiClient';

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

  // fetch + FileReader rather than expo-file-system: that package is not
  // installed here, and both of these are built into React Native, so voice
  // does not cost the project a new dependency.
  const base64 = await fileToBase64(uri);

  const res = await api('/api/v1/ai/transcribe', {
    method: 'POST',
    body: { audioBase64: base64, mimeType: 'm4a' },
  });

  if (!res?.ok) throw new Error(res?.text || 'That recording could not be understood.');
  return res;
}

export async function cancelRecording() {
  await forceRelease();
}

/** Read a local file URI as base64, without expo-file-system. */
function fileToBase64(uri) {
  return new Promise((resolve, reject) => {
    fetch(uri)
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The recording could not be read.'));
        reader.onloadend = () => {
          const result = String(reader.result || '');
          // Strip the "data:audio/...;base64," prefix the reader adds.
          const comma = result.indexOf(',');
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => reject(new Error('The recording could not be read.')));
  });
}
