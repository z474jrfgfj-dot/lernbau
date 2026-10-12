// FSRS-4.5 scheduler (Free Spaced Repetition Scheduler) with Anki-style learning steps.
// Card state: { state, s (stability, days), d (difficulty 1-10), due (ms), last (ms), step, reps, lapses }

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367,
  1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
// short-term stability factors (from FSRS-5) for same-day reviews
const W17 = 0.5034, W18 = 0.6567;
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MIN = 60_000;
const DAY = 86_400_000;
const LEARN_STEPS = [1, 10];   // minutes
const RELEARN_STEPS = [10];    // minutes

export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };
export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

const clampD = d => Math.min(10, Math.max(1, d));
const initS = g => W[g - 1];
const initD = g => clampD(W[4] - (g - 3) * W[5]);
const nextD = (d, g) => clampD(W[7] * initD(3) + (1 - W[7]) * (d - W[6] * (g - 3)));
const shortTermS = (s, g) => Math.max(0.1, s * Math.exp(W17 * (g - 3 + W18)));

export const retrievability = (elapsedDays, s) => Math.pow(1 + FACTOR * elapsedDays / s, DECAY);

const recallS = (d, s, r, g) => s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
  (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));

const forgetS = (d, s, r) => Math.min(s,
  W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));

function ivlDays(s, retention, maxIvl) {
  const i = s / FACTOR * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(maxIvl, Math.max(1, Math.round(i)));
}

export function newCard() {
  return { state: State.New, s: 0, d: 0, due: 0, last: 0, step: 0, reps: 0, lapses: 0 };
}

/** Returns the four possible next states [Again, Hard, Good, Easy] for a card. */
export function preview(card, now = Date.now(), { retention = 0.9, maxIvl = 365 } = {}) {
  const c = card ? { ...card } : newCard();
  const out = [1, 2, 3, 4].map(g => ({ ...c, reps: c.reps + 1, last: now }));

  const graduate = (o, extraDays = 0) => {
    o.state = State.Review;
    o.step = 0;
    o.ivl = ivlDays(o.s, retention, maxIvl) + extraDays;
    o.due = now + o.ivl * DAY;
  };
  const stepTo = (o, minutes) => { o.ivl = 0; o.due = now + minutes * MIN; };

  if (c.state === State.New || c.state === State.Learning) {
    out.forEach((o, i) => {
      const g = i + 1;
      if (c.state === State.New) { o.s = initS(g); o.d = initD(g); o.step = 0; }
      else { o.s = shortTermS(c.s, g); o.d = nextD(c.d, g); }
      o.state = State.Learning;
    });
    const step = c.state === State.New ? 0 : c.step;
    // Again
    out[0].step = 0; stepTo(out[0], LEARN_STEPS[0]);
    // Hard: repeat current step (first step: average of first two)
    out[1].step = Math.max(0, step);
    stepTo(out[1], step <= 0 ? Math.round((LEARN_STEPS[0] + LEARN_STEPS[1]) / 2) : LEARN_STEPS[step]);
    // Good: next step or graduate
    if (step + 1 < LEARN_STEPS.length) { out[2].step = step + 1; stepTo(out[2], LEARN_STEPS[step + 1]); }
    else graduate(out[2]);
    // Easy: graduate immediately
    graduate(out[3]);
    if (out[2].state === State.Review) out[3].ivl = Math.max(out[3].ivl, out[2].ivl + 1);
    out[3].due = now + out[3].ivl * DAY;
  } else if (c.state === State.Relearning) {
    out.forEach((o, i) => { const g = i + 1; o.s = shortTermS(c.s, g); o.d = nextD(c.d, g); o.state = State.Relearning; });
    out[0].step = 0; stepTo(out[0], RELEARN_STEPS[0]);
    out[1].step = 0; stepTo(out[1], Math.round(RELEARN_STEPS[0] * 1.5));
    graduate(out[2]);
    graduate(out[3]);
    out[3].ivl = Math.max(out[3].ivl, out[2].ivl + 1);
    out[3].due = now + out[3].ivl * DAY;
  } else {
    const elapsed = Math.max(0, (now - c.last) / DAY);
    const r = retrievability(elapsed, c.s);
    out.forEach((o, i) => { o.d = nextD(c.d, i + 1); });
    // Again → relearning
    out[0].s = forgetS(c.d, c.s, r);
    out[0].lapses = c.lapses + 1;
    out[0].state = State.Relearning;
    out[0].step = 0;
    stepTo(out[0], RELEARN_STEPS[0]);
    for (let g = 2; g <= 4; g++) {
      const o = out[g - 1];
      o.s = recallS(c.d, c.s, r, g);
      o.state = State.Review;
      o.ivl = ivlDays(o.s, retention, maxIvl);
    }
    // keep Hard ≤ Good < Easy
    out[1].ivl = Math.min(out[1].ivl, out[2].ivl);
    out[2].ivl = Math.max(out[2].ivl, out[1].ivl + 1);
    out[3].ivl = Math.max(out[3].ivl, out[2].ivl + 1);
    for (let g = 2; g <= 4; g++) out[g - 1].due = now + out[g - 1].ivl * DAY;
  }
  return out;
}

export function schedule(card, rating, now = Date.now(), opts) {
  const next = preview(card, now, opts)[rating - 1];
  delete next.ivl;
  return next;
}

/** Human readable interval for rating buttons. */
export function intervalLabel(next, now = Date.now()) {
  const ms = next.due - now;
  const min = Math.round(ms / MIN);
  if (min < 60) return `${Math.max(1, min)} Min`;
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `${h} Std`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d} T`;
  const m = d / 30;
  if (m < 12) return `${m.toFixed(m < 3 ? 1 : 0).replace('.', ',')} Mon`;
  return `${(d / 365).toFixed(1).replace('.', ',')} J`;
}
