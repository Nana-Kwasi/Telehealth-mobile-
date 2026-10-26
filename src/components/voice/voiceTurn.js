/**
 * Has the person finished their thought, or only paused in it?
 *
 * A fixed silence timer answers "Um, I've been having this pain in my…" as if it were a whole
 * question. People don't: they say "mm-hmm" and wait. This reads the words heard so far at each
 * pause and decides:
 *
 *   complete    — answer it
 *   incomplete  — they stopped mid-sentence ("If I take it with food,"): say "Mm-hmm", keep listening
 *   hesitation  — only "um" / "uh" so far: "Take your time" and wait
 *   unclear     — nothing usable heard
 *
 * Ported from the Bankai care assistant; Whisper keeps the signals this needs: fillers ("Um,")
 * and a trailing comma or ellipsis where speech stopped mid-clause.
 */

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'oh', 'ha', 'hmm', 'hm', 'mm',
  'mmm', 'like', 'so', 'well', 'wait']);

// A sentence ending on one of these has more coming.
const DANGLING = new Set(['to', 'and', 'but', 'or', 'so', 'if', 'because', 'cause', 'the', 'a', 'an', 'my',
  'your', 'of', 'for', 'with', 'about', 'from', 'into', 'on', 'in', 'at', 'than', 'then', 'when', 'that',
  'which', 'who', 'i', "i'm", 'im', 'is', 'are', 'was', 'were', 'want', 'need', 'would', 'could', 'can',
  'will', 'should', 'like', 'um', 'uh', 'also', 'just', 'please', 'maybe']);

// A clause opened with one of these needs a second half.
const SUBORDINATE = /^(if|when|because|although|though|since|before|after|while|once|unless|so if|and if|but if)\b/;

const words = (t) => t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);

export const BACKCHANNEL = { incomplete: ['Mm-hmm.', 'Go on.'], hesitation: ['Take your time.', 'No rush.'] };
export const ALL_BACKCHANNELS = [...BACKCHANNEL.incomplete, ...BACKCHANNEL.hesitation];

/**
 * @param text        the transcript of everything said in this turn so far
 * @param confidence  Whisper's lowest segment log-probability, or null
 */
export function classifyTurn(text, confidence) {
  const raw = String(text || '').trim();
  const w = words(raw);
  if (!w.length) return 'unclear';
  const content = w.filter((x) => !FILLERS.has(x));
  // A garbled guess at a hesitation is not something to answer. -1.3, not -1.0: a real but
  // quiet "Hii!" scored -1.1 and was waited on as hesitation.
  if (!content.length || (typeof confidence === 'number' && confidence < -1.3 && content.length <= 4)) {
    return 'hesitation';
  }
  if (/(,|\.\.\.|…|-|—)\s*$/.test(raw)) return 'incomplete';
  if (DANGLING.has(w[w.length - 1])) return 'incomplete';
  // A question asked is a turn finished, whatever word it opened with.
  if (/\?\s*$/.test(raw)) return 'complete';
  const stripped = content.join(' ');
  if (SUBORDINATE.test(stripped) && !/[,;]/.test(raw.replace(/[,]\s*$/, '')) && content.length <= 8) {
    return 'incomplete';
  }
  return 'complete';
}

export function pickBackchannel(kind, last) {
  const pool = (BACKCHANNEL[kind] || BACKCHANNEL.incomplete).filter((p) => p !== last);
  return pool[Math.floor(Math.random() * pool.length)] || BACKCHANNEL[kind][0];
}
