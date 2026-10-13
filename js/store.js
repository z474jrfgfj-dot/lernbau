// Persistent learning state (localStorage). One JSON blob, versioned.
import { dayKey, addDays } from './util.js';

const KEY = 'lernbau.v1';

const DEFAULT_SETTINGS = {
  dailyGoal: 50,        // XP per day
  newPerDay: 15,        // new cards per day
  sessionSize: 20,      // cards per session
  quizSize: 10,         // questions per quiz
  vocabDir: 'both',     // both | en-de | de-en
  typeVocab: true,      // type vocab answers instead of only revealing
  retention: 0.9,       // FSRS desired retention
  theme: 'auto',        // auto | light | dark
  voice: '',            // speechSynthesis voice URI
  rate: 0.95,
  autoSpeak: true,
  name: 'Max',
};

const fresh = () => ({
  v: 1,
  cards: {},                         // itemId -> FSRS card state
  days: {},                          // 'YYYY-MM-DD' -> { xp, reviews, newCards, quiz, correct, ms }
  quiz: { wrong: {}, seen: {}, history: [] },
  exams: [],                         // { id, title, subject, date: 'YYYY-MM-DD' }
  xp: 0,
  settings: { ...DEFAULT_SETTINGS },
  createdAt: Date.now(),
});

let state = fresh();
const listeners = new Set();

export function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (parsed && parsed.v === 1) {
      state = { ...fresh(), ...parsed };
      state.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      state.quiz = { ...fresh().quiz, ...parsed.quiz };
    }
  } catch (e) { console.warn('State konnte nicht geladen werden', e); }
  // Ask the browser not to evict our data (Safari honours this for home-screen apps).
  navigator.storage?.persist?.().catch(() => {});
  return state;
}

let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}
export function flush() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('Speichern fehlgeschlagen', e); }
  listeners.forEach(fn => fn());
}
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

export const get = () => state;
export const settings = () => state.settings;
export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

export function today(key = dayKey()) {
  return (state.days[key] ||= { xp: 0, reviews: 0, newCards: 0, quiz: 0, correct: 0, ms: 0 });
}

function addXp(n) {
  today().xp += n;
  state.xp += n;
}

export const XP = { review: [1, 1, 2, 2], quizRight: 5, quizWrong: 1, sessionBonus: 5 };

export function recordReview(itemId, next, rating, wasNew, ms = 0) {
  state.cards[itemId] = next;
  const d = today();
  d.reviews++;
  if (wasNew) d.newCards++;
  d.ms += Math.min(ms, 120_000);
  addXp(XP.review[rating - 1]);
  save();
}

export function recordQuiz(qid, correct) {
  const d = today();
  d.quiz++;
  if (correct) {
    d.correct++;
    delete state.quiz.wrong[qid];
  } else {
    state.quiz.wrong[qid] = (state.quiz.wrong[qid] || 0) + 1;
  }
  state.quiz.seen[qid] = Date.now();
  addXp(correct ? XP.quizRight : XP.quizWrong);
  save();
}

export function recordQuizResult(entry) {
  state.quiz.history.push({ t: Date.now(), ...entry });
  if (state.quiz.history.length > 300) state.quiz.history.splice(0, state.quiz.history.length - 300);
  save();
}

export function bonusXp(n) { addXp(n); save(); }

/** Current streak in days. Today counts once something was done; until then yesterday's streak is still alive. */
export function streak() {
  let k = dayKey();
  if (!(state.days[k]?.xp > 0)) k = addDays(k, -1);
  let n = 0;
  while (state.days[k]?.xp > 0) { n++; k = addDays(k, -1); }
  return n;
}

export function bestStreak() {
  const keys = Object.keys(state.days).filter(k => state.days[k].xp > 0).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export function addExam(exam) {
  state.exams.push({ id: Math.random().toString(36).slice(2, 9), ...exam });
  state.exams.sort((a, b) => a.date.localeCompare(b.date));
  state.examsAt = Date.now();
  save();
}
export function removeExam(id) {
  state.exams = state.exams.filter(e => e.id !== id);
  state.examsAt = Date.now();
  save();
}

export function exportJson() {
  return JSON.stringify({ app: 'lernbau', exportedAt: new Date().toISOString(), state }, null, 1);
}

/** Import a backup. mode 'replace' overwrites, 'merge' keeps the more-reviewed card state and sums days. */
export function importJson(text, mode = 'merge') {
  const data = JSON.parse(text);
  const incoming = data.state || data;
  if (!incoming || incoming.v !== 1 || typeof incoming.cards !== 'object') throw new Error('Keine gültige LernBau-Sicherung');
  if (mode === 'replace') {
    state = { ...fresh(), ...incoming, settings: { ...DEFAULT_SETTINGS, ...incoming.settings } };
  } else {
    merge(incoming);
  }
  flush();
}

/** Merge another device's state into ours: newest review per card wins, days keep the larger XP. */
export function merge(incoming) {
  // A reset on one device wins over older progress from any other device.
  const theirReset = incoming.resetAt || 0, myReset = state.resetAt || 0;
  if (theirReset < myReset) return;
  if (theirReset > myReset) {
    state = { ...fresh(), settings: state.settings, exams: state.exams, examsAt: state.examsAt, resetAt: theirReset };
  }
  for (const [id, c] of Object.entries(incoming.cards || {})) {
    const mine = state.cards[id];
    if (!mine || (c.last || 0) > (mine.last || 0)) state.cards[id] = c;
  }
  for (const [k, d] of Object.entries(incoming.days || {})) {
    const mine = state.days[k];
    if (!mine || (d.xp || 0) > (mine.xp || 0)) state.days[k] = d;
  }
  state.xp = Object.values(state.days).reduce((s, d) => s + (d.xp || 0), 0);

  // Mistakes: whichever device answered a question last decides whether it is still wrong.
  const inQ = incoming.quiz || {};
  const ids = new Set([...Object.keys(inQ.seen || {}), ...Object.keys(state.quiz.seen)]);
  for (const q of ids) {
    const theirs = inQ.seen?.[q] || 0, mine = state.quiz.seen[q] || 0;
    if (theirs > mine) {
      if (inQ.wrong?.[q]) state.quiz.wrong[q] = inQ.wrong[q];
      else delete state.quiz.wrong[q];
      state.quiz.seen[q] = theirs;
    }
  }
  const seenT = new Set(state.quiz.history.map(h => h.t));
  state.quiz.history.push(...(inQ.history || []).filter(h => !seenT.has(h.t)));
  state.quiz.history.sort((a, b) => a.t - b.t);

  // Exams: the most recently edited list wins (so deletions sync too).
  if ((incoming.examsAt || 0) > (state.examsAt || 0)) {
    state.exams = incoming.exams || [];
    state.examsAt = incoming.examsAt;
  }
}

export function reset() {
  state = { ...fresh(), settings: state.settings, exams: state.exams, examsAt: state.examsAt, resetAt: Date.now() };
  flush();
}
