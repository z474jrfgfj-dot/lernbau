// Flashcard session with FSRS scheduling.
import * as store from '../store.js';
import * as content from '../content.js';
import * as speech from '../speech.js';
import { preview, intervalLabel, State } from '../fsrs.js';
import { html, md, $, confetti, plural } from '../util.js';
import { icon, scopeFrom } from '../ui.js';

const LABELS = ['Nochmal', 'Schwer', 'Gut', 'Einfach'];
const COLORS = ['red', 'orange', 'green', ''];

function interleave(reviews, fresh) {
  if (!fresh.length) return reviews;
  if (!reviews.length) return fresh;
  const out = [];
  const every = Math.max(1, Math.round(reviews.length / (fresh.length + 1)));
  let r = 0, f = 0;
  while (r < reviews.length || f < fresh.length) {
    for (let i = 0; i < every && r < reviews.length; i++) out.push(reviews[r++]);
    if (f < fresh.length) out.push(fresh[f++]);
  }
  return out;
}

function buildQueue(scope, extra) {
  const s = store.settings();
  const now = Date.now();
  const due = content.dueItems(scope, now).slice(0, s.sessionSize);
  const room = Math.max(0, s.sessionSize - due.length);
  const fresh = content.newItems(scope);
  const nNew = extra ? Math.min(room || 10, 10) : Math.min(room, content.newLeftToday());
  return interleave(due, fresh.slice(0, nNew));
}

const isLong = t => String(t || '').length > 90 || /\n|\\n/.test(t || '');

export default function review(el, route) {
  const scope = scopeFrom(route.args);
  const extra = route.query.extra === '1';
  const opts = () => ({ retention: store.settings().retention });
  let queue = buildQueue(scope, extra);
  const session = { done: 0, ratings: [0, 0, 0, 0], xp0: store.get().xp, started: Date.now(), seen: new Set() };
  let current = null, revealed = false, shownAt = 0, undo = null;

  const exit = () => {
    if (history.length > 1) history.back();
    else location.hash = '#/heute';
  };

  if (!queue.length) {
    const st = content.stats(scope);
    el.innerHTML = String(html`
      <div class="session-top"><button class="icon-btn" data-close aria-label="Schließen">${icon.close}</button></div>
      <div class="empty"><div class="e">🎉</div><h3>Nichts fällig</h3>
        <p>${st.fresh ? 'Dein Limit für neue Karten ist für heute erreicht.' : 'Du hast alle Karten in diesem Bereich gelernt.'}</p>
        <div class="btn-row" style="max-width:420px;margin:20px auto 0">
          ${st.fresh ? html`<a class="btn green" href="${location.hash.split('?')[0]}?extra=1">10 neue Karten</a>` : ''}
          <a class="btn" href="#/quiz${route.args.length ? '/' + route.args.join('/') : ''}">Quiz</a>
        </div></div>`);
    $('[data-close]', el).onclick = exit;
    return;
  }

  function next() {
    revealed = false;
    current = queue.shift();
    if (!current) return finish();
    shownAt = Date.now();
    draw();
    if (current.dir === 'en-de' && store.settings().autoSpeak) speech.speak(current.card.en);
  }

  function frontHtml(it) {
    const c = it.card;
    if (it.dir === 'en-de') return html`<div class="word-row"><div class="q">${c.en}</div>
      <button class="icon-btn speak" data-speak="${c.en}" aria-label="Vorlesen">${icon.speaker}</button></div>
      <p class="caption">Was heißt das auf Deutsch?</p>`;
    if (it.dir === 'de-en') return html`<div class="q">${c.de}</div><p class="caption">Wie heißt das auf Englisch?</p>`;
    return html`<div class="q ${isLong(c.front) ? 'long' : ''}">${md(c.front)}</div>
      ${revealed ? '' : html`<p class="caption">Antwort im Kopf überlegen – dann aufdecken und ehrlich bewerten.</p>`}
      ${c.hint ? html`<button class="hint-btn" data-hint>💡 Tipp anzeigen</button><p class="caption" data-hinttext hidden>${md(c.hint)}</p>` : ''}`;
  }

  function backHtml(it) {
    const c = it.card;
    if (it.dir) {
      const main = it.dir === 'en-de' ? c.de : c.en;
      return html`<div class="word-row"><div class="a">${main}</div>
        ${it.dir === 'de-en' ? html`<button class="icon-btn speak" data-speak="${c.en}" aria-label="Vorlesen">${icon.speaker}</button>` : ''}</div>
        ${c.example ? html`<div class="example"><button class="icon-btn speak" data-speak="${c.example}" aria-label="Beispiel vorlesen">${icon.speaker}</button>
          <span>${c.example}${c.exampleDe ? html`<br><span style="font-style:normal">${c.exampleDe}</span>` : ''}</span></div>` : ''}
        ${c.note ? html`<div class="note">${md(c.note)}</div>` : ''}`;
    }
    return html`<div class="a ${isLong(c.back) ? 'long' : ''}">${md(c.back)}</div>`;
  }

  function draw() {
    const it = current;
    const card = store.get().cards[it.id];
    const isNew = !card || card.state === State.New;
    const total = session.done + queue.length + 1;
    const pv = revealed ? preview(card, Date.now(), opts()) : null;
    el.innerHTML = String(html`
      <div class="session-top">
        <button class="icon-btn" data-close aria-label="Schließen">${icon.close}</button>
        <div class="progress" role="progressbar" aria-valuenow="${session.done}" aria-valuemax="${total}"><i style="width:${(session.done / total) * 100}%"></i></div>
        ${undo ? html`<button class="icon-btn" data-undo aria-label="Rückgängig" title="Rückgängig (Z)">${icon.undo}</button>` : ''}
        <span class="count">${session.done + 1}/${total}</span>
      </div>
      <div class="flash" style="--tile:${it.subject.color}">
        <div class="meta"><span class="pill">${it.subject.icon} ${it.subject.name}</span><span>${it.deck.title}</span>
          <span class="state" style="color:${isNew ? 'var(--accent)' : card.state === State.Review ? 'var(--green)' : 'var(--orange)'}">${isNew ? 'NEU' : card.state === State.Review ? '' : 'Lernen'}</span></div>
        <div class="front">${frontHtml(it)}</div>
        ${revealed ? html`<div class="back">${backHtml(it)}</div>` : ''}
      </div>
      <div class="dock">
        ${revealed
          ? html`<div class="rate">${LABELS.map((l, i) => html`<button class="btn ${COLORS[i]}" data-rate="${i + 1}">
              ${l}<small>${intervalLabel(pv[i])}</small><kbd>${i + 1}</kbd></button>`)}</div>`
          : html`<button class="btn block" data-reveal>Antwort zeigen <kbd>Leertaste</kbd></button>`}
      </div>`);
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    draw();
    if (current.dir === 'de-en' && store.settings().autoSpeak) speech.speak(current.card.en);
  }

  function rate(g) {
    if (!revealed) return;
    const it = current;
    const now = Date.now();
    const st = store.get();
    const prev = st.cards[it.id];
    undo = { it, prev: prev ? { ...prev } : null, queue: [...queue], day: { ...store.today() }, xp: st.xp, session: { done: session.done, ratings: [...session.ratings] } };
    const nextCard = preview(prev, now, opts())[g - 1];
    delete nextCard.ivl;
    store.recordReview(it.id, nextCard, g, !prev || prev.state === State.New, now - shownAt);
    session.done++;
    session.ratings[g - 1]++;
    session.seen.add(it.id);
    // Short learning steps come back in this session.
    const wait = nextCard.due - now;
    if (wait < 30 * 60_000) {
      const pos = Math.min(queue.length, wait <= 2 * 60_000 ? 3 : 6);
      queue.splice(pos, 0, it);
    }
    speech.stop();
    next();
  }

  function doUndo() {
    if (!undo) return;
    const st = store.get();
    if (undo.prev) st.cards[undo.it.id] = undo.prev; else delete st.cards[undo.it.id];
    Object.assign(store.today(), undo.day);
    st.xp = undo.xp;
    store.save();
    queue = undo.queue;
    session.done = undo.session.done;
    session.ratings = undo.session.ratings;
    current = undo.it;
    undo = null;
    revealed = true;
    shownAt = Date.now();
    draw();
  }

  function finish() {
    const n = session.done;
    if (n >= 5) store.bonusXp(store.XP.sessionBonus);
    const xp = store.get().xp - session.xp0;
    const good = session.ratings[2] + session.ratings[3];
    const acc = n ? Math.round((good / n) * 100) : 0;
    const mins = Math.max(1, Math.round((Date.now() - session.started) / 60000));
    const more = content.dueItems(scope).length + Math.min(content.newLeftToday(), content.newItems(scope).length);
    const goal = store.today().xp >= store.settings().dailyGoal;
    el.innerHTML = String(html`
      <div class="summary">
        <div class="big-emoji">${acc >= 85 ? '🏆' : acc >= 60 ? '💪' : '🌱'}</div>
        <h1>${acc >= 85 ? 'Stark gemacht!' : acc >= 60 ? 'Gute Runde!' : 'Dranbleiben!'}</h1>
        <p class="subtitle">${plural(session.seen.size, 'Karte', 'Karten')} in ${mins} Min${goal ? ' · Tagesziel erreicht 🎯' : ''}</p>
        <div class="tiles">
          <div class="tile" style="--tc:var(--orange)"><div class="h">XP</div><b>+${xp}</b></div>
          <div class="tile" style="--tc:var(--accent)"><div class="h">Wiederholt</div><b>${n}</b></div>
          <div class="tile" style="--tc:var(--green)"><div class="h">Gewusst</div><b>${acc}%</b></div>
        </div>
        <div class="btn-row" style="flex-direction:column">
          ${more ? html`<button class="btn green block" data-again>Weiterlernen (${more})</button>` : ''}
          <button class="btn ${more ? 'secondary' : ''} block" data-close>Fertig</button>
        </div>
      </div>`);
    if (n) confetti();
    undo = null;
  }

  function restart() {
    queue = buildQueue(scope, false);
    Object.assign(session, { done: 0, ratings: [0, 0, 0, 0], xp0: store.get().xp, started: Date.now(), seen: new Set() });
    undo = null;
    next();
  }

  function onClick(e) {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.speak) { e.stopPropagation(); speech.speak(t.dataset.speak); return; }
    if ('close' in t.dataset) return exit();
    if ('reveal' in t.dataset) return reveal();
    if ('undo' in t.dataset) return doUndo();
    if ('again' in t.dataset) return restart();
    if ('hint' in t.dataset) { t.hidden = true; $('[data-hinttext]', el).hidden = false; return; }
    if (t.dataset.rate) return rate(+t.dataset.rate);
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!current) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); revealed ? rate(3) : reveal(); }
    else if (/^[1-4]$/.test(e.key)) rate(+e.key);
    else if (e.key === 'Escape') exit();
    else if (e.key.toLowerCase() === 'z') doUndo();
    else if (e.key.toLowerCase() === 'r' && current.card.en) speech.speak(current.card.en);
  }

  // Tap anywhere on the card to reveal.
  function onCardTap(e) {
    if (!revealed && e.target.closest('.flash') && !e.target.closest('button')) reveal();
  }

  el.addEventListener('click', onClick);
  el.addEventListener('click', onCardTap);
  addEventListener('keydown', onKey);
  next();

  return () => {
    el.removeEventListener('click', onClick);
    el.removeEventListener('click', onCardTap);
    removeEventListener('keydown', onKey);
    speech.stop();
  };
}
