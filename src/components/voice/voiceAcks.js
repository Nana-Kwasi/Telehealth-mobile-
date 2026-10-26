/**
 * The short phrase said once the person's words are known, while the answer and its voice are
 * being made.
 *
 * Chosen from the final transcript and nothing else — a phrase that does not fit the question
 * is worse than silence. Rules:
 *   - Fit or stay quiet. Anything not clearly one of the kinds below gets no phrase.
 *   - Never sound like agreement to an action. A "yes" gets a neutral "Okay." — voice never
 *     confirms a booking; only the Confirm button on screen does.
 *   - Never a breezy line over distress. Anything that sounds like an emergency or someone in
 *     crisis gets no phrase at all: the safety layer answers that, and "One moment, I'll pull
 *     that up" before a crisis response would be grotesque.
 *   - Quiet when the reply is instant anyway: greetings, thanks, goodbyes, "are you there?".
 */

const SETS = {
  lookup: ['Let me check that for you.', "One moment, I'll pull that up.", 'Sure, let me have a look.'],
  upset: ['I understand. Let me look into that.', 'I hear you. Give me a moment.'],
  time: ['Noted.', 'Okay, one moment.'],
  answer: ['Okay.', 'Alright.'],
  request: ['Sure, one moment.', 'Okay, let me see.'],
  connect: ['Sure, one moment.', 'Of course. One moment.'],
};

/** Said, not shown, when nothing intelligible came back. */
export const DIDNT_CATCH = "Sorry, I didn't catch that. Could you say it again?";

/** Said when the words could not be sent at all — the network, not the person. */
export const NO_CONNECTION = "Sorry, I'm having trouble with the connection. Could you say that again in a moment?";

/**
 * Said while the answer is being worked out and nothing is being said yet — so a pause is
 * heard as "it is thinking", not "it has stopped". The first after a short wait, the second
 * if it is still working; never more than that in one turn.
 */
export const THINKING = ["Let me think this through.", "Give me a moment, I'm working it out.", "Just a second, I'm looking into it."];
export const STILL_THINKING = ["Still working on it, thanks for waiting.", "Almost there, one moment."];

export const ALL_PHRASES = [...new Set([...Object.values(SETS).flat(), ...THINKING, ...STILL_THINKING, DIDNT_CATCH, NO_CONNECTION])];

export function pickPhrase(list, last) {
  const pool = list.filter((p) => p !== last);
  return (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))];
}

const has = (t, list) => list.some((w) => t.includes(w));

// Say nothing over any of these: the safety screen and the assistant answer them.
const DISTRESS = ['suicid', 'kill myself', 'end my life', 'self harm', 'self-harm', 'hurt myself', 'want to die',
  'overdose', 'emergency', "can't breathe", 'cannot breathe', 'chest pain', 'bleeding', 'unconscious',
  'seizure', 'stroke', 'heart attack', 'abuse', 'rape', 'assault'];
const UPSET = ['complain', 'angry', 'upset', 'terrible', 'useless', 'not happy', 'frustrat', 'ridiculous',
  'worried', 'scared', 'anxious'];
const LOOKUP = ['appointment', 'schedule', 'result', 'report', 'prescription', 'medication', 'medicine',
  'order', 'orders', 'claim', 'claims', 'invoice', 'payment', 'balance', 'patient', 'patients', 'caseload',
  'queue', 'pending', 'overdue', 'today', 'this month', 'how many', 'how much', 'which', 'stock', 'turnaround',
  'referral', 'history', 'record', 'lab', 'test', 'scan'];
const QUIET = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'thanks', 'thank you',
  'bye', 'goodbye', 'cool', 'are you there', 'can you hear me', 'you there', 'hello are you there'];
const YES_NO = /^(yes|yeah|yep|no|nope|sure|okay|ok|not now|please do|go ahead)\b/;
const TIME = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|morning|afternoon|evening|next week|this week|\d{1,2}(:\d\d)?\s*(am|pm)|january|february|march|april|may|june|july|august|september|october|november|december)\b/;
const CONNECT = ['speak to', 'talk to', 'connect me', 'book', 'reschedule', 'cancel my', 'see a doctor',
  'see my doctor', 'therapist', 'nurse'];
const REQUEST = /^(can|could|would|will|please|i want|i'd like|i would like|i need|help|show|tell|send|book|let me|how|what|when|where|why|which|who)\b/;

/**
 * @param text    what the person said (final transcript)
 * @param lastAck the phrase used last time, so it is not repeated back to back
 * @returns a phrase, or null for "say nothing"
 */
export function chooseAck(text, lastAck) {
  const t = String(text || '').toLowerCase().replace(/[^a-z0-9:' -]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || QUIET.includes(t)) return null;
  if (has(t, DISTRESS)) return null;
  const n = t.split(' ').length;

  let set = null;
  if (has(t, UPSET)) set = SETS.upset;
  else if (YES_NO.test(t) && n <= 4) set = SETS.answer;
  else if (TIME.test(t) && n <= 8) set = SETS.time;
  else if (has(t, CONNECT)) set = SETS.connect;
  else if (has(t, LOOKUP)) set = SETS.lookup;
  else if (REQUEST.test(t) && n >= 4) set = SETS.request;
  if (!set) return null;

  const options = set.filter((p) => p !== lastAck);
  const pool = options.length ? options : set;
  return pool[Math.floor(Math.random() * pool.length)];
}
