// Loads data/content.json and derives review items (vocab cards expand into two directions).
import * as store from './store.js';
import { State } from './fsrs.js';
import { endOfDay } from './util.js';

let C = { subjects: [], decks: [], version: '' };
const subjectById = new Map();
const deckById = new Map();
const questionById = new Map();
let allItems = [];

export async function load() {
  const res = await fetch('data/content.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Inhalte konnten nicht geladen werden (${res.status})`);
  C = await res.json();
  subjectById.clear(); deckById.clear(); questionById.clear();
  allItems = [];
  for (const s of C.subjects) { s.decks = []; subjectById.set(s.id, s); }
  for (const d of C.decks) {
    const s = subjectById.get(d.subject);
    if (!s) continue;
    s.decks.push(d);
    deckById.set(d.id, d);
    d.items = [];
    for (const card of d.cards) {
      if (card.type === 'vocab') {
        d.items.push({ id: `${card.id}>de`, dir: 'en-de', card, deck: d, subject: s });
        d.items.push({ id: `${card.id}>en`, dir: 'de-en', card, deck: d, subject: s });
      } else {
        d.items.push({ id: card.id, dir: null, card, deck: d, subject: s });
      }
    }
    allItems.push(...d.items);
    for (const q of d.quiz) { q.deck = d; q.subject = s; questionById.set(q.id, q); }
  }
  // Subjects without content stay hidden.
  C.subjects = C.subjects.filter(s => s.decks.length);
  return C;
}

export const version = () => C.version;
export const subjects = () => C.subjects;
export const subject = id => subjectById.get(id);
export const deck = id => deckById.get(id);
export const question = id => questionById.get(id);

/** scope: { type: 'all' } | { type: 'subject', id } | { type: 'deck', id } */
export function scopeLabel(scope) {
  if (scope.type === 'subject') return subject(scope.id)?.name ?? 'Fach';
  if (scope.type === 'deck') return deck(scope.id)?.title ?? 'Thema';
  return 'Alle Fächer';
}
export function scopeColor(scope) {
  if (scope.type === 'subject') return subject(scope.id)?.color;
  if (scope.type === 'deck') return deck(scope.id)?.subject && subject(deck(scope.id).subject)?.color;
  return null;
}

export function items(scope = { type: 'all' }) {
  let list;
  if (scope.type === 'deck') list = deck(scope.id)?.items ?? [];
  else if (scope.type === 'subject') list = (subject(scope.id)?.decks ?? []).flatMap(d => d.items);
  else list = allItems;
  const dir = store.settings().vocabDir;
  return dir === 'both' ? list : list.filter(i => !i.dir || i.dir === dir);
}

export function questions(scope = { type: 'all' }) {
  if (scope.type === 'deck') return deck(scope.id)?.quiz ?? [];
  if (scope.type === 'subject') return (subject(scope.id)?.decks ?? []).flatMap(d => d.quiz);
  return C.decks.flatMap(d => d.quiz);
}

const LEARN_AHEAD = 20 * 60_000;

/** Counts for a scope: due (reviews + learning), fresh (never seen), learned, mastered (stable ≥ 21 days). */
export function stats(scope, now = Date.now()) {
  const cards = store.get().cards;
  const eod = endOfDay(now);
  let due = 0, fresh = 0, learned = 0, mastered = 0, total = 0;
  for (const it of items(scope)) {
    total++;
    const c = cards[it.id];
    if (!c || c.state === State.New) { fresh++; continue; }
    learned++;
    if (c.state === State.Review && c.s >= 21) mastered++;
    if (isDue(c, now, eod)) due++;
  }
  return { due, fresh, learned, mastered, total };
}

function isDue(c, now, eod) {
  if (c.state === State.Learning || c.state === State.Relearning) return c.due <= now + LEARN_AHEAD;
  return c.due < eod;
}

export function dueItems(scope, now = Date.now()) {
  const cards = store.get().cards;
  const eod = endOfDay(now);
  return items(scope)
    .filter(it => { const c = cards[it.id]; return c && c.state !== State.New && isDue(c, now, eod); })
    .sort((a, b) => cards[a.id].due - cards[b.id].due);
}

export function newItems(scope) {
  const cards = store.get().cards;
  const list = items(scope).filter(it => !cards[it.id] || cards[it.id].state === State.New);
  // For vocab, introduce the en→de direction first; the reverse comes later.
  const ordered = [...list.filter(i => i.dir !== 'de-en'), ...list.filter(i => i.dir === 'de-en')];
  if (scope.type !== 'all') return ordered;
  // Across all subjects: round-robin so every day brings a bit of each subject.
  const bySubject = new Map();
  for (const it of ordered) {
    if (!bySubject.has(it.subject.id)) bySubject.set(it.subject.id, []);
    bySubject.get(it.subject.id).push(it);
  }
  const lanes = [...bySubject.values()];
  const out = [];
  for (let i = 0; out.length < ordered.length; i++) {
    for (const lane of lanes) if (i < lane.length) out.push(lane[i]);
  }
  return out;
}

export function newLeftToday() {
  const s = store.settings();
  return Math.max(0, s.newPerDay - store.today().newCards);
}

/** Number of reviews due on each of the next n days (index 0 = today). */
export function forecast(n = 7, now = Date.now()) {
  const cards = store.get().cards;
  const eod = endOfDay(now);
  const out = Array(n).fill(0);
  for (const it of allItems) {
    const c = cards[it.id];
    if (!c || c.state === State.New) continue;
    const idx = c.due < eod ? 0 : Math.ceil((c.due - eod) / 86_400_000);
    if (idx < n) out[idx]++;
  }
  return out;
}

export function totals() {
  return {
    decks: C.decks.length,
    cards: C.decks.reduce((s, d) => s + d.cards.length, 0),
    questions: C.decks.reduce((s, d) => s + d.quiz.length, 0),
  };
}
