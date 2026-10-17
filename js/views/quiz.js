// Quiz: practice (instant feedback), exam (timer + grade), mistakes.
import * as store from '../store.js';
import * as content from '../content.js';
import { html, md, $, $$, shuffle, confetti, ring, plural, toast } from '../util.js';
import { icon, scopeFrom, backLink } from '../ui.js';
import * as speech from '../speech.js';

const MODES = {
  vokabeln: { title: 'Vokabeltrainer', emoji: '🔤', desc: 'Übersetzung eintippen – Deutsch ↔ Englisch, wird automatisch geprüft' },
  uebung: { title: 'Üben', emoji: '🎯', desc: 'Sofort Feedback mit Erklärung' },
  uebungen: { title: 'Übungsblatt', emoji: '✍️', desc: 'Situationen selbst analysieren wie auf dem Arbeitsblatt – mit Musterlösung' },
  pruefung: { title: 'Probeprüfung', emoji: '📝', desc: 'Mit Zeitlimit, Auswertung und Note am Ende' },
  fehler: { title: 'Fehler üben', emoji: '🔁', desc: 'Nur Fragen, die du falsch hattest' },
};
const isEx = q => q.type === 'exercise';
const isVocab = q => q.type === 'vocab';
const isOk = r => r === 'right' || r === 'typo';

/** Vocabulary cards of a scope as typed translation questions (direction follows the vocab setting). */
function vocabQuestions(scope) {
  return content.items(scope).filter(it => it.dir).map(it => {
    const c = it.card;
    const toDe = it.dir === 'en-de';
    return {
      id: `v:${it.id}`, type: 'vocab', dir: it.dir, deck: it.deck, subject: it.subject, card: c,
      question: toDe ? `Was heißt **${c.en}** auf Deutsch?` : `Wie heißt **${c.de}** auf Englisch?${/\s[–—-]\s/.test(c.en) ? ' *(alle Verbformen)*' : ''}`,
      answer: toDe ? c.de : c.en,
      explanation: [c.example && `*${c.example}*${c.exampleDe ? ` – ${c.exampleDe}` : ''}`, c.note].filter(Boolean).join('\n'),
    };
  });
}

// ---------- vocabulary answer checking ----------
const ARTICLE = /^(der|die|das|den|dem|des|ein|eine|einen|to|the|a|an)\s+/;
const vclean = s => norm(s).replace(ARTICLE, '').replace(/[.!?"]/g, '')
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').trim();   // "geruest" = "Gerüst"
const close = (a, b) => a === b ? 'right' : (b.length >= 5 && lev(a, b) <= 1 ? 'typo' : null);

function vocabAlternatives(target) {
  const t = String(target);
  const parens = [...t.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
  return [...t.replace(/\([^)]*\)/g, ' ').split(/\s*[\/;,]\s*/), ...parens.flatMap(p => p.split(/\s*[\/;,]\s*/))]
    .map(vclean).filter(Boolean);
}

/** 'right' | 'typo' | 'partial' | 'wrong' – articles optional, any listed meaning counts, verbs need all forms. */
export function checkVocab(target, value) {
  const v = vclean(value);
  if (!v) return 'wrong';
  if (/\s[–—-]\s/.test(target)) {
    const slots = String(target).split(/\s[–—-]\s/).map(s => s.split('/').map(vclean));
    const typed = v.split(/\s*[–—,;/-]\s*|\s+/).filter(Boolean);
    if (typed.length === slots.length) {
      const res = slots.map((alts, i) => alts.map(a => close(typed[i], a)).find(Boolean) || null);
      if (res.every(r => r === 'right')) return 'right';
      if (res.every(Boolean)) return 'typo';
    }
    if (typed.length === 1 && slots[0].some(a => close(v, a))) return 'partial';
    return 'wrong';
  }
  let best = 'wrong';
  for (const a of vocabAlternatives(target)) {
    const r = close(v, a);
    if (r === 'right') return 'right';
    if (r === 'typo') best = 'typo';
  }
  return best;
}
const SEC_PER_Q = 90;

// ---------- answer checking ----------

const norm = s => String(s ?? '').toLowerCase().normalize('NFC')
  .replace(/[’‘`´]/g, "'").replace(/[„“”]/g, '"')
  .replace(/[.!?;:,]+$/, '').replace(/\s+/g, ' ').trim();

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function parseNum(s) {
  let t = String(s ?? '').replace(/\s/g, '').replace(/−/g, '-').replace(/[^\d.,\-+eE]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** returns 'right' | 'typo' | 'wrong' */
export function check(q, value) {
  if (isVocab(q)) return checkVocab(q.answer, value);
  if (q.type === 'mc') return value === q.answer ? 'right' : 'wrong';
  if (q.type === 'numeric') {
    const n = parseNum(value);
    if (n == null) return 'wrong';
    const tol = q.tolerance ?? 0.02;
    return Math.abs(n - q.answer) <= Math.max(Math.abs(q.answer) * tol, 1e-9) ? 'right' : 'wrong';
  }
  const v = norm(value);
  if (!v) return 'wrong';
  const accepted = [q.answer, ...(q.accept || [])].map(norm);
  if (accepted.includes(v)) return 'right';
  if (v.length >= 5 && accepted.some(a => a.length >= 5 && lev(a, v) <= 1)) return 'typo';
  return 'wrong';
}

const fmtNum = n => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 4 });

export function solution(q) {
  if (isEx(q)) return q.fields.map(f => `**${f.label}:** ${f.solution}`).join('\n');
  if (q.type === 'mc') return q.options[q.answer];
  if (q.type === 'numeric') return `${fmtNum(q.answer)}${q.unit ? ' ' + q.unit : ''}`;
  return q.answer;
}

// ---------- spelling & grammar (LanguageTool public API, free, needs internet) ----------

const LT_URL = 'https://api.languagetool.org/v2/check';
const LT_SKIP = new Set(['style', 'locale-violation']);

/** Returns per text an array of matches {offset,length,replacement,message}, or null if offline/failed. */
async function proofread(texts) {
  const SEP = '\n\n';
  const joined = texts.join(SEP);
  if (!joined.trim() || !navigator.onLine) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(LT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: joined, language: 'de-DE' }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    // map global offsets back to the individual fields
    const starts = [];
    let pos = 0;
    for (const t of texts) { starts.push(pos); pos += t.length + SEP.length; }
    const out = texts.map(() => []);
    for (const m of data.matches || []) {
      if (LT_SKIP.has(m.rule?.issueType) || /WHITESPACE|DOUBLE_PUNCTUATION/.test(m.rule?.id || '')) continue;
      const i = starts.findLastIndex(s => s <= m.offset);
      if (i < 0 || m.offset + m.length > starts[i] + texts[i].length) continue;
      const orig = joined.slice(m.offset, m.offset + m.length);
      out[i].push({ offset: m.offset - starts[i], length: m.length, replacement: bestReplacement(orig, m.replacements || []), message: m.shortMessage || m.message || '' });
    }
    return out.map(list => list.sort((a, b) => a.offset - b.offset)
      .filter((m, k, arr) => k === 0 || m.offset >= arr[k - 1].offset + arr[k - 1].length));
  } catch {
    return null;
  }
}

// LanguageTool's first suggestion is not always the closest ("eillig" → "billig"); prefer the most similar word.
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
function bestReplacement(orig, reps) {
  const cands = reps.slice(0, 6).map((r, k) => r.value).filter(v => v != null);
  if (!cands.length) return '';
  const o = orig.toLowerCase();
  const score = (v, k) => editDistance(o, v.toLowerCase()) + (v[0]?.toLowerCase() === o[0] ? 0 : 0.6) + k * 0.05;
  return cands.map((v, k) => [score(v, k), v]).sort((x, y) => x[0] - y[0])[0][1];
}

function proofHtml(text, matches) {
  if (!text.trim()) return html`<div class="ex-proof empty">Keine Antwort eingegeben.</div>`;
  if (matches === null || matches === undefined) return html`<div class="ex-proof off">Rechtschreibprüfung gerade nicht erreichbar (offline?).</div>`;
  if (!matches.length) return html`<div class="ex-proof clean">✓ Rechtschreibung & Grammatik: keine Fehler gefunden</div>`;
  const parts = [];
  let pos = 0;
  for (const m of matches) {
    parts.push(text.slice(pos, m.offset));
    parts.push(html`<del>${text.slice(m.offset, m.offset + m.length)}</del>${m.replacement ? html`<ins title="${m.message}">${m.replacement}</ins>` : ''}`);
    pos = m.offset + m.length;
  }
  parts.push(text.slice(pos));
  const notes = [...new Set(matches.map(m => m.message).filter(Boolean))].slice(0, 4);
  return html`<div class="ex-proof"><span>Verbessert · ${plural(matches.length, 'Korrektur', 'Korrekturen')}</span>
    <div class="ex-proof-text">${parts}</div>
    ${notes.length ? html`<ul>${notes.map(n => html`<li>${n}</li>`)}</ul>` : ''}</div>`;
}

function grade(pct) {
  if (pct >= 92) return [1, '#30D158'];
  if (pct >= 81) return [2, '#34C759'];
  if (pct >= 67) return [3, '#FFCC00'];
  if (pct >= 50) return [4, '#FF9500'];
  if (pct >= 30) return [5, '#FF6B00'];
  return [6, '#FF3B30'];
}

function pick(scope, mode, size) {
  const st = store.get().quiz;
  let pool = mode === 'vokabeln' ? vocabQuestions(scope) : content.questions(scope);
  if (mode === 'vokabeln') { /* all vocab questions */ }
  else if (mode === 'fehler') pool = pool.filter(q => st.wrong[q.id]);
  else if (mode === 'uebungen') pool = pool.filter(isEx);
  else pool = pool.filter(q => !isEx(q));   // written exercises need self-checking, not timed/auto-graded
  // Mistakes first, then never seen, then least recently seen; random within ties.
  const rank = q => (st.wrong[q.id] ? 0 : 1e13) + (st.seen[q.id] || 0) + Math.random() * 3.6e6 * 24;
  const chosen = pool.map(q => [rank(q), q]).sort((a, b) => a[0] - b[0]).slice(0, size).map(x => x[1]);
  return shuffle(chosen);
}

// ---------- view ----------

export default function quiz(el, route) {
  const scope = scopeFrom(route.args);
  const label = content.scopeLabel(scope);
  const backHref = scope.type === 'all' ? '#/heute' : scope.type === 'subject' ? `#/fach/${scope.id}` : `#/deck/${scope.id}`;
  let mode = MODES[route.query.mode] ? route.query.mode : null;
  let size = store.settings().quizSize;
  let qs = [], idx = 0, answers = [], locked = false, timer = null, deadline = 0, xp0 = 0, optOrder = [];

  const exit = () => { location.hash = backHref; };

  function startScreen() {
    const all = content.questions(scope).length;
    const wrong = content.questions(scope).filter(q => store.get().quiz.wrong[q.id]).length;
    const exN = content.questions(scope).filter(isEx).length;
    const vocN = content.items(scope).filter(it => it.dir === 'en-de').length;
    const off = k => (k === 'fehler' && !wrong) || (k === 'uebungen' && !exN);
    const note = k => k === 'fehler' ? `${wrong} offen · ` : k === 'uebungen' ? `${plural(exN, 'Übung', 'Übungen')} · `
      : k === 'vokabeln' ? `${plural(vocN, 'Vokabel', 'Vokabeln')} · ` : '';
    const dir = store.settings().vocabDir;
    el.innerHTML = String(html`
      ${backLink(backHref)}
      <h1 class="large-title">Quiz</h1>
      <p class="subtitle">${label} · ${plural(all, 'Frage', 'Fragen')}</p>
      ${all ? html`
      <h2 class="section-title">Modus</h2>
      <div class="list">
        ${Object.entries(MODES).filter(([k]) => (k !== 'uebungen' || exN) && (k !== 'vokabeln' || vocN)).map(([k, m]) => html`<button class="row has-icon" data-mode="${k}" ${off(k) ? 'disabled style="opacity:.45"' : ''}>
          <span class="icon-tile" style="--tile:var(--fill2)">${m.emoji}</span>
          <div class="grow"><div class="title">${m.title}</div><div class="sub">${note(k)}${m.desc}</div></div>
          ${icon.chev}</button>`)}
      </div>
      ${vocN ? html`<h2 class="section-title">Vokabel-Richtung</h2>
      <div class="segmented" data-dirseg>
        ${[['both', 'Beide'], ['de-en', 'Deutsch → Englisch'], ['en-de', 'Englisch → Deutsch']].map(([v, l]) => html`<button class="${dir === v ? 'on' : ''}" data-dir="${v}">${l}</button>`)}
      </div>` : ''}
      <h2 class="section-title">Anzahl Fragen</h2>
      <div class="segmented" data-size>
        ${[5, 10, 20, 40].map(n => html`<button class="${n === size ? 'on' : ''}" data-n="${n}">${n}</button>`)}
      </div>
      <p class="footnote">Probeprüfung: 1,5 Minuten pro Frage, Note nach IHK-Notenschlüssel.</p>
      ` : html`<div class="empty"><div class="e">🤷</div><h3>Keine Quizfragen</h3><p>Für diesen Bereich gibt es noch keine Fragen.</p></div>`}
    `);
  }

  function start(m) {
    mode = m;
    qs = pick(scope, mode, size);
    if (!qs.length) { mode = null; return startScreen(); }
    idx = 0; answers = []; xp0 = store.get().xp;
    if (mode === 'pruefung') {
      deadline = Date.now() + qs.length * SEC_PER_Q * 1000;
      timer = setInterval(tick, 1000);
    }
    show();
  }

  function tick() {
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    const t = $('.timer', el);
    if (t) {
      t.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      t.classList.toggle('low', left < 60);
    }
    if (left <= 0) {
      clearInterval(timer);
      while (answers.length < qs.length) answers.push({ value: null, result: 'wrong' });
      finish();
    }
  }

  function show() {
    locked = false;
    const q = qs[idx];
    optOrder = q.type === 'mc' ? shuffle(q.options.map((_, i) => i)) : [];
    const long = q.question.length > 140;
    el.innerHTML = String(html`
      <div class="session-top">
        <button class="icon-btn" data-close aria-label="Beenden">${icon.close}</button>
        <div class="progress"><i style="width:${(idx / qs.length) * 100}%"></i></div>
        ${mode === 'pruefung' ? html`<span class="timer">–:––</span>` : html`<span class="count">${idx + 1}/${qs.length}</span>`}
      </div>
      <p class="caption" style="margin-top:8px">${q.subject.icon} ${q.deck.title}${mode === 'pruefung' ? ` · Frage ${idx + 1} von ${qs.length}` : ''}</p>
      <div class="qtext ${long ? 'long' : ''}">${md(q.question)}${isVocab(q) && q.dir === 'en-de' ? html` <button type="button" class="icon-btn speak" data-speak="${q.card.en}" aria-label="Vorlesen">${icon.speaker}</button>` : ''}</div>
      ${q.type === 'mc' ? html`<div class="options" role="radiogroup">
          ${optOrder.map((oi, k) => html`<button class="opt" role="radio" aria-checked="false" data-opt="${oi}"><span class="k">${k + 1}</span><span>${md(q.options[oi])}</span></button>`)}
        </div>`
        : isEx(q) ? html`<form class="exercise" data-exform autocomplete="off">
          ${q.fields.map((f, i) => html`<div class="ex-field">
            <label for="ex${i}">${f.label}</label>
            <textarea id="ex${i}" name="f${i}" rows="2" placeholder="${f.hint || 'Deine Antwort …'}" autocapitalize="sentences" spellcheck="true" lang="de"></textarea>
            <div class="ex-sol" data-sol="${i}" hidden></div>
          </div>`)}
        </form>`
        : html`<form class="answer-field" data-form autocomplete="off">
          <input name="a" ${q.type === 'numeric' ? 'inputmode="decimal"' : ''} placeholder="${q.type === 'numeric' ? 'Ergebnis' : isVocab(q) ? (q.dir === 'en-de' ? 'Auf Deutsch …' : 'In English …') : 'Antwort'}"
            autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Antwort">
          ${q.unit ? html`<span class="unit">${q.unit}</span>` : ''}
        </form>`}
      <div class="dock">${isEx(q) ? html`<button class="btn block" data-exreveal>Lösung zeigen</button>` : html`<button class="btn block" data-submit ${q.type === 'mc' ? 'disabled' : ''}>${mode === 'pruefung' ? (idx + 1 < qs.length ? 'Weiter' : 'Abgeben') : 'Prüfen'}</button>`}</div>
      <div style="height:200px"></div>
    `);
    if (mode === 'pruefung') tick();
    const inp = $('input[name="a"]', el);
    if (inp && matchMedia('(pointer: fine)').matches) inp.focus();
  }

  function selected() {
    const q = qs[idx];
    if (q.type === 'mc') { const s = $('.opt.sel', el); return s ? +s.dataset.opt : null; }
    return $('input[name="a"]', el)?.value ?? '';
  }

  function submit() {
    if (locked) return;
    const q = qs[idx];
    const value = selected();
    if (value === null || value === '') return;
    const result = check(q, value);
    answers.push({ value, result });
    if (mode === 'pruefung') { idx++; return idx < qs.length ? show() : finish(); }
    locked = true;
    const ok = isOk(result);
    store.recordQuiz(q.id, ok);
    if (q.type === 'mc') {
      $('.options', el).classList.add('locked');
      $$('.opt', el).forEach(b => {
        const oi = +b.dataset.opt;
        if (oi === q.answer) b.classList.add('right');
        else if (oi === value) b.classList.add('wrong');
      });
    } else {
      const f = $('.answer-field', el);
      f.classList.add(ok ? 'right' : 'wrong');
      $('input', f).readOnly = true;
    }
    $('.dock', el).innerHTML = '';
    const fb = document.createElement('div');
    fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
    fb.innerHTML = String(html`<div>
      <h3>${ok ? (result === 'typo' ? '✓ Fast richtig – Tippfehler' : '✓ Richtig!') : result === 'partial' ? '◐ Teilweise – alle Formen nötig' : '✗ Leider falsch'}
        <span class="xp-pop">+${ok ? store.XP.quizRight : store.XP.quizWrong} XP</span></h3>
      ${!ok || result === 'typo' ? html`<p class="sol">Lösung: ${md(solution(q))}</p>` : ''}
      ${q.explanation ? html`<div class="expl">${md(q.explanation)}</div>` : ''}
      <button class="btn block ${ok ? 'green' : 'red'}" data-next>${idx + 1 < qs.length ? 'Weiter' : 'Ergebnis'}</button>
    </div>`);
    el.appendChild(fb);
    $('[data-next]', fb).focus({ preventScroll: true });
  }

  // ----- written exercises (spell-checked, then self-checked against a model solution) -----
  let marks = [];

  async function revealExercise() {
    if (locked) return;
    const q = qs[idx];
    locked = true;
    marks = q.fields.map(() => null);
    const texts = $$('[data-exform] textarea', el).map(t => { t.readOnly = true; return t.value; });
    const btn = $('[data-exreveal]', el);
    if (btn && !q.noSpell) { btn.disabled = true; btn.textContent = 'Rechtschreibung wird geprüft …'; }
    const checked = q.noSpell ? null : await proofread(texts);   // noSpell: formulas, shortcuts …
    if (qs[idx] !== q) return;   // user left meanwhile
    q.fields.forEach((f, i) => {
      const box = $(`[data-sol="${i}"]`, el);
      box.innerHTML = String(html`${q.noSpell ? '' : proofHtml(texts[i], checked && checked[i])}
        <div class="ex-model"><span>Musterlösung</span>${md(f.solution)}</div>
        <div class="ex-mark" role="group" aria-label="Selbstkontrolle ${f.label}">
          <button type="button" data-mark="${i}" data-val="1">✓ Hatte ich</button>
          <button type="button" data-mark="${i}" data-val="0">✗ Nicht / falsch</button>
        </div>`);
      box.hidden = false;
    });
    $('.dock', el).innerHTML = String(html`
      ${q.explanation ? html`<div class="card expl-card">${md(q.explanation)}</div>` : ''}
      <p class="caption" style="text-align:center;margin:10px 0">Vergleiche ehrlich – sinngemäß richtig zählt.</p>
      <button class="btn block green" data-exdone disabled>Weiter</button>`);
    $('[data-sol="0"]', el)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function markField(i, val, btn) {
    marks[i] = val;
    $$(`[data-mark="${i}"]`, el).forEach(b => b.classList.toggle('on', b === btn));
    btn.closest('.ex-field').classList.toggle('ok', val === 1);
    btn.closest('.ex-field').classList.toggle('bad', val === 0);
    const done = marks.every(m => m !== null);
    $('[data-exdone]', el).disabled = !done;
  }

  function finishExercise() {
    const q = qs[idx];
    const right = marks.filter(m => m === 1).length;
    const ok = right / marks.length >= 0.75;
    const value = q.fields.map((f, i) => `**${f.label}:** ${$(`#ex${i}`, el).value.trim() || '–'}`).join('\n');
    answers.push({ value, result: ok ? 'right' : 'wrong' });
    store.recordQuiz(q.id, ok);
    toast(ok ? `✓ ${right}/${marks.length} – +${store.XP.quizRight} XP` : `${right}/${marks.length} – kommt bei „Fehler üben“ wieder`);
    nextQ();
  }

  function nextQ() {
    idx++;
    if (idx < qs.length) show(); else finish();
  }

  function finish() {
    clearInterval(timer);
    if (mode === 'pruefung') qs.forEach((q, i) => store.recordQuiz(q.id, isOk(answers[i]?.result)));
    const right = answers.filter(a => isOk(a.result)).length;
    const pct = Math.round((right / qs.length) * 100);
    store.recordQuizResult({ scope, mode, n: qs.length, right });
    if (right === qs.length && qs.length >= 5) store.bonusXp(10);
    const xp = store.get().xp - xp0;
    const [note, noteColor] = grade(pct);
    const wrongOnes = qs.map((q, i) => ({ q, a: answers[i] })).filter(x => !isOk(x.a?.result));
    el.innerHTML = String(html`
      <div class="summary">
        ${mode === 'pruefung'
          ? html`<div class="grade" style="--gc:${noteColor}">${note}</div>`
          : html`<div>${ring(pct / 100, { size: 120, stroke: 14, color: pct >= 67 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--red)', label: `${pct}%` })}</div>`}
        <h1>${pct === 100 ? 'Perfekt! 🏆' : pct >= 80 ? 'Sehr gut!' : pct >= 50 ? 'Ordentlich!' : 'Weiter üben!'}</h1>
        <p class="subtitle">${right} von ${qs.length} richtig${mode === 'pruefung' ? ` · Note ${note}` : ''}</p>
        <div class="tiles">
          <div class="tile" style="--tc:var(--orange)"><div class="h">XP</div><b>+${xp}</b></div>
          <div class="tile" style="--tc:var(--green)"><div class="h">Richtig</div><b>${right}</b></div>
          <div class="tile" style="--tc:var(--red)"><div class="h">Falsch</div><b>${qs.length - right}</b></div>
        </div>
        <div class="btn-row" style="flex-direction:column">
          ${wrongOnes.length && mode !== 'vokabeln' ? html`<button class="btn red block" data-mode="fehler">Fehler üben (${wrongOnes.length})</button>` : ''}
          <button class="btn block ${wrongOnes.length ? 'secondary' : ''}" data-mode="${mode === 'fehler' ? 'uebung' : mode}">${mode === 'vokabeln' && wrongOnes.length ? 'Neue Runde – Fehler zuerst' : 'Neue Runde'}</button>
          <button class="btn plain block" data-close>Fertig</button>
        </div>
        ${wrongOnes.length ? html`
          <h2 class="section-title">Zum Nachlesen</h2>
          <div class="list review-list">${wrongOnes.map(({ q, a }) => html`<div class="item">
            <div style="font-weight:600">${md(q.question)}</div>
            ${a.value !== null && a.value !== '' ? html`<div class="yours">Deine Antwort: ${q.type === 'mc' ? q.options[a.value] : isEx(q) ? html`<br>${md(a.value)}` : a.value}</div>` : html`<div class="yours">Keine Antwort</div>`}
            <div class="right">Richtig: ${md(solution(q))}</div>
            ${q.explanation ? html`<div class="caption" style="margin-top:6px">${md(q.explanation)}</div>` : ''}
          </div>`)}</div>` : ''}
      </div>`);
    if (pct >= 80) confetti();
    qs = [];
  }

  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if ('close' in t.dataset) {
      clearInterval(timer);
      return exit();
    }
    if (t.dataset.mode && !t.disabled) return start(t.dataset.mode);
    if (t.dataset.dir) {
      store.setSetting('vocabDir', t.dataset.dir);
      $$('[data-dir]', el).forEach(b => b.classList.toggle('on', b === t));
      return;
    }
    if (t.dataset.n) {
      size = +t.dataset.n;
      store.setSetting('quizSize', size);
      $$('[data-n]', el).forEach(b => b.classList.toggle('on', b === t));
      return;
    }
    if (t.dataset.opt !== undefined && !locked) {
      $$('.opt', el).forEach(b => { b.classList.toggle('sel', b === t); b.setAttribute('aria-checked', b === t); });
      $('[data-submit]', el).disabled = false;
      return;
    }
    if (t.dataset.speak) return speech.speak(t.dataset.speak);
    if ('submit' in t.dataset) return submit();
    if ('exreveal' in t.dataset) return revealExercise();
    if (t.dataset.mark !== undefined) return markField(+t.dataset.mark, +t.dataset.val, t);
    if ('exdone' in t.dataset) return finishExercise();
    if ('next' in t.dataset) return nextQ();
  }

  function onSubmit(e) {
    if (e.target.matches('[data-form]')) { e.preventDefault(); locked ? nextQ() : submit(); }
    if (e.target.matches('[data-exform]')) e.preventDefault();
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || !qs.length) return;
    const inInput = e.target.matches('input, textarea');
    if (isEx(qs[idx] || {})) { if (e.key === 'Escape') { clearInterval(timer); exit(); } return; }
    if (e.key === 'Enter' && !inInput && !e.target.matches('button, a')) {
      e.preventDefault();
      if (locked) nextQ(); else submit();
    } else if (!inInput && !locked && /^[1-6]$/.test(e.key)) {
      const b = $$('.opt', el)[+e.key - 1];
      b?.click();
    } else if (e.key === 'Escape') { clearInterval(timer); exit(); }
  }

  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  addEventListener('keydown', onKey);
  if (mode) start(mode); else startScreen();

  return () => {
    clearInterval(timer);
    el.removeEventListener('click', onClick);
    el.removeEventListener('submit', onSubmit);
    removeEventListener('keydown', onKey);
  };
}
