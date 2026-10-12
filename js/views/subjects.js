import * as store from '../store.js';
import * as content from '../content.js';
import { State } from '../fsrs.js';
import { html, md, plural, dayKey } from '../util.js';
import { chips, subjectTile, progressBar, backLink, icon } from '../ui.js';

export function subjectsView(el) {
  const subs = content.subjects();
  el.innerHTML = String(html`
    <div class="top"><h1 class="large-title">Fächer</h1>${chips()}</div>
    <p class="subtitle" style="margin-bottom:16px">${plural(subs.length, 'Fach', 'Fächer')} · ${content.totals().cards} Karten · ${content.totals().questions} Quizfragen</p>
    <div class="grid">
      ${subs.map(s => {
        const st = content.stats({ type: 'subject', id: s.id });
        return html`<a class="subject-tile" href="#/fach/${s.id}" style="--tile:${s.color}">
          ${st.due ? html`<span class="badge">${st.due}</span>` : ''}
          ${subjectTile(s, 'lg')}
          <div><b>${s.name}</b><div class="caption">${plural(s.decks.length, 'Thema', 'Themen')}${s.teacher ? ` · ${s.teacher}` : ''}</div></div>
          ${progressBar(st, s.color)}
          <div class="caption">${Math.round((st.learned / Math.max(1, st.total)) * 100)}% gelernt</div>
        </a>`;
      })}
    </div>
  `);
}

function deckRow(d, color) {
  const st = content.stats({ type: 'deck', id: d.id });
  return html`<a class="row" href="#/deck/${d.id}">
    <div class="grow">
      <div class="title">${d.title}</div>
      <div class="sub">${d.cards.length} Karten · ${d.quiz.length} Fragen${st.due ? html` · <b style="color:var(--red)">${st.due} fällig</b>` : ''}</div>
      <div style="margin-top:8px">${progressBar(st, color)}</div>
    </div>
    ${icon.chev}
  </a>`;
}

export function subjectView(el, { args }) {
  const s = content.subject(args[0]);
  if (!s) { location.hash = '#/faecher'; return; }
  const scope = { type: 'subject', id: s.id };
  const st = content.stats(scope);
  const qn = content.questions(scope).length;
  const newToday = Math.min(content.newLeftToday(), st.fresh);
  const exam = store.get().exams.find(e => e.subject === s.id && e.date >= dayKey());

  el.innerHTML = String(html`
    ${backLink('#/faecher', 'Fächer')}
    <div class="subject-head">
      ${subjectTile(s, 'xl')}
      <div><h1>${s.name}</h1><p class="subtitle">${s.teacher ? `${s.teacher} · ` : ''}${plural(s.decks.length, 'Thema', 'Themen')}</p></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="stat-row">
        <div><b style="color:var(--red)">${st.due}</b><span>fällig</span></div>
        <div><b>${st.fresh}</b><span>neu</span></div>
        <div><b style="color:var(--orange)">${st.learned - st.mastered}</b><span>in Arbeit</span></div>
        <div><b style="color:var(--green)">${st.mastered}</b><span>gefestigt</span></div>
      </div>
      <div style="margin-top:14px">${progressBar(st, s.color)}</div>
      ${exam ? html`<p class="caption" style="margin-top:10px">📅 ${exam.title} am ${new Date(exam.date + 'T12:00').toLocaleDateString('de-DE')}</p>` : ''}
      <div class="btn-row">
        ${st.due + newToday > 0
          ? html`<a class="btn green" href="#/lernen/subject/${s.id}">Lernen</a>`
          : html`<a class="btn green" href="#/lernen/subject/${s.id}?extra=1" ${st.fresh ? '' : 'aria-disabled="true"'}>${st.fresh ? 'Neue Karten' : 'Alles gelernt ✓'}</a>`}
        ${qn ? html`<a class="btn" href="#/quiz/subject/${s.id}">Quiz</a>` : ''}
      </div>
    </div>

    <h2 class="section-title">Themen</h2>
    <div class="list">${s.decks.map(d => deckRow(d, s.color))}</div>
  `);
}

export function deckView(el, { args }) {
  const d = content.deck(args[0]);
  if (!d) { location.hash = '#/faecher'; return; }
  const s = content.subject(d.subject);
  const scope = { type: 'deck', id: d.id };
  const st = content.stats(scope);
  const cards = store.get().cards;

  const dotFor = card => {
    const ids = card.type === 'vocab' ? [`${card.id}>de`, `${card.id}>en`] : [card.id];
    const cs = ids.map(i => cards[i]).filter(c => c && c.state !== State.New);
    if (!cs.length) return '';
    return cs.every(c => c.state === State.Review && c.s >= 21) ? 'm' : 'l';
  };

  el.innerHTML = String(html`
    ${backLink(`#/fach/${s.id}`, s.name)}
    <h1 class="large-title" style="font-size:28px">${d.title}</h1>
    ${d.description ? html`<p class="subtitle" style="margin-top:4px">${d.description}</p>` : ''}

    <div class="card" style="margin-top:16px">
      <div class="stat-row">
        <div><b style="color:var(--red)">${st.due}</b><span>fällig</span></div>
        <div><b>${st.fresh}</b><span>neu</span></div>
        <div><b style="color:var(--orange)">${st.learned - st.mastered}</b><span>in Arbeit</span></div>
        <div><b style="color:var(--green)">${st.mastered}</b><span>gefestigt</span></div>
      </div>
      <div class="btn-row">
        ${d.cards.length ? html`<a class="btn green" href="#/lernen/deck/${d.id}${st.due ? '' : '?extra=1'}">${st.due ? 'Lernen' : 'Neue Karten'}</a>` : ''}
        ${d.quiz.length ? html`<a class="btn" href="#/quiz/deck/${d.id}">Quiz (${d.quiz.length})</a>` : ''}
      </div>
      ${d.sources?.length ? html`<p class="caption" style="margin-top:12px">Quelle: ${d.sources.join(', ')}</p>` : ''}
    </div>

    ${d.cards.length ? html`
      <h2 class="section-title">Alle Karten <span class="caption">${d.cards.length}</span></h2>
      <div class="list">
        ${d.cards.map(c => html`<details class="cardrow">
          <summary><span class="dot ${dotFor(c)}"></span><span>${c.type === 'vocab' ? html`<b>${c.en}</b>` : md(c.front)}</span></summary>
          <div class="ans">${c.type === 'vocab'
            ? html`${c.de}${c.example ? html`<br><i>${c.example}</i>` : ''}${c.note ? html`<br>${c.note}` : ''}`
            : md(c.back)}</div>
        </details>`)}
      </div>
      <div class="legend"><span><i style="background:var(--fill)"></i>neu</span><span><i style="background:var(--orange)"></i>in Arbeit</span><span><i style="background:var(--green)"></i>gefestigt</span></div>
    ` : ''}
  `);
}
