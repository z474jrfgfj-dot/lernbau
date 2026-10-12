import * as store from '../store.js';
import * as content from '../content.js';
import { html, dayKey, addDays, fmtNum } from '../util.js';
import { chips, subjectTile, progressBar } from '../ui.js';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export default function stats(el) {
  const st = store.get();
  const today = dayKey();
  const all = content.stats({ type: 'all' });
  const days = Object.values(st.days);
  const reviews = days.reduce((s, d) => s + d.reviews, 0);
  const quizN = days.reduce((s, d) => s + d.quiz, 0);
  const quizR = days.reduce((s, d) => s + d.correct, 0);
  const minutes = Math.round(days.reduce((s, d) => s + (d.ms || 0), 0) / 60000);

  // Heatmap: last 20 weeks, columns = weeks starting Monday.
  const weeks = 20;
  const todayDow = (new Date(today + 'T12:00').getDay() + 6) % 7; // Mon=0
  const start = addDays(today, -(weeks - 1) * 7 - todayDow);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const k = addDays(start, i);
    if (k > today) { cells.push(html`<i style="visibility:hidden"></i>`); continue; }
    const xp = st.days[k]?.xp || 0;
    const lvl = !xp ? '' : xp < 15 ? 'l1' : xp < 40 ? 'l2' : xp < 80 ? 'l3' : 'l4';
    cells.push(html`<i class="${lvl} ${k === today ? 'today' : ''}" title="${k}: ${xp} XP"></i>`);
  }

  // Last 7 days XP
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const max7 = Math.max(store.settings().dailyGoal, ...last7.map(k => st.days[k]?.xp || 0));

  const fc = content.forecast(7);
  const maxFc = Math.max(1, ...fc);

  el.innerHTML = String(html`
    <div class="top"><h1 class="large-title">Statistik</h1>${chips()}</div>

    <div class="tiles4" style="margin-top:16px">
      <div class="card"><div class="v" style="color:var(--flame)">🔥 ${store.streak()}</div><div class="l">Tage Serie · Rekord ${store.bestStreak()}</div></div>
      <div class="card"><div class="v" style="color:var(--orange)">⚡ ${fmtNum(st.xp)}</div><div class="l">XP gesamt</div></div>
      <div class="card"><div class="v">${fmtNum(reviews)}</div><div class="l">Wiederholungen · ${minutes} Min</div></div>
      <div class="card"><div class="v" style="color:var(--green)">${quizN ? Math.round((quizR / quizN) * 100) : 0}%</div><div class="l">Quiz richtig (${fmtNum(quizN)})</div></div>
    </div>

    <h2 class="section-title">Diese Woche</h2>
    <div class="card">
      <div class="bars">
        ${last7.map(k => {
          const xp = st.days[k]?.xp || 0;
          return html`<div class="b ${k === today ? 'today' : ''}"><em>${xp || ''}</em><i style="height:${(xp / max7) * 100}%"></i>
            <span>${WD[new Date(k + 'T12:00').getDay()]}</span></div>`;
        })}
      </div>
      <p class="caption" style="margin-top:8px">XP pro Tag · Tagesziel ${store.settings().dailyGoal} XP</p>
    </div>

    <h2 class="section-title">Aktivität</h2>
    <div class="card"><div class="heat">${cells}</div>
      <div class="legend"><span>weniger</span><span><i style="background:var(--fill2)"></i><i class="" style="background:color-mix(in srgb,var(--green) 30%,transparent)"></i><i style="background:color-mix(in srgb,var(--green) 55%,transparent)"></i><i style="background:var(--green)"></i></span><span>mehr</span></div>
    </div>

    <h2 class="section-title">Vorschau fällige Karten</h2>
    <div class="card">
      <div class="bars">
        ${fc.map((n, i) => html`<div class="b"><em>${n || ''}</em><i style="height:${(n / maxFc) * 100}%;background:var(--purple)"></i>
          <span>${i === 0 ? 'Heute' : WD[new Date(addDays(today, i) + 'T12:00').getDay()]}</span></div>`)}
      </div>
    </div>

    <h2 class="section-title">Fortschritt</h2>
    <div class="card" style="margin-bottom:12px">
      <div class="stat-row">
        <div><b>${all.total}</b><span>Karten</span></div>
        <div><b>${all.learned}</b><span>gelernt</span></div>
        <div><b style="color:var(--green)">${all.mastered}</b><span>gefestigt</span></div>
        <div><b>${all.total ? Math.round((all.mastered / all.total) * 100) : 0}%</b><span>Ziel</span></div>
      </div>
    </div>
    <div class="list">
      ${content.subjects().map(s => {
        const ss = content.stats({ type: 'subject', id: s.id });
        const hist = st.quiz.history.filter(h => h.scope?.type === 'subject' ? h.scope.id === s.id : false);
        const last = hist.at(-1);
        return html`<a class="row has-icon" href="#/fach/${s.id}">
          ${subjectTile(s)}
          <div class="grow">
            <div class="title">${s.name}</div>
            <div style="margin:6px 0 4px">${progressBar(ss, s.color)}</div>
            <div class="sub">${ss.mastered} gefestigt · ${ss.learned - ss.mastered} in Arbeit · ${ss.fresh} neu${last ? ` · letztes Quiz ${Math.round((last.right / last.n) * 100)}%` : ''}</div>
          </div>
        </a>`;
      })}
    </div>
    <p class="footnote">Kräftige Farbe = gefestigt (nächste Wiederholung erst in 21+ Tagen), helle Farbe = in Arbeit.</p>
  `);
}
