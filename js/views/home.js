import * as store from '../store.js';
import * as content from '../content.js';
import { html, ring, dayKey, daysBetween, plural } from '../util.js';
import { chips, subjectTile, icon } from '../ui.js';

function greeting(name) {
  const h = new Date().getHours();
  const hi = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Servus' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
  return `${hi}, ${name}`;
}

function dateLine() {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

export default function home(el) {
  const s = store.settings();
  const t = store.today();
  const all = content.stats({ type: 'all' });
  const newToday = Math.min(content.newLeftToday(), all.fresh);
  const pct = t.xp / s.dailyGoal;
  const goalReached = t.xp >= s.dailyGoal;
  const todayKey = dayKey();
  const exams = store.get().exams.filter(e => daysBetween(todayKey, e.date) >= 0);
  const wrong = Object.keys(store.get().quiz.wrong).filter(q => content.question(q)).length;
  const hasWork = all.due + newToday > 0;

  el.innerHTML = String(html`
    <div class="top" style="align-items:center">
      <p class="subtitle">${dateLine()}</p>
      ${chips()}
    </div>
    <h1 class="large-title">${greeting(s.name)} 👋</h1>

    <div class="card goal" style="margin-top:16px">
      ${ring(pct, { size: 68, stroke: 9, color: goalReached ? 'var(--green)' : 'var(--orange)', label: `${Math.min(100, Math.round(pct * 100))}%` })}
      <div>
        <h3 class="${goalReached ? 'goal-done' : ''}">${goalReached ? 'Tagesziel geschafft! 🎉' : 'Tagesziel'}</h3>
        <p class="subtitle">${t.xp} / ${s.dailyGoal} XP${goalReached ? '' : ` · noch ${s.dailyGoal - t.xp} XP`}</p>
        <p class="caption">${t.reviews} Karten · ${t.quiz} Quizfragen heute</p>
      </div>
    </div>

    <div class="hero ${hasWork ? '' : 'done'}" style="margin-top:16px">
      <span class="deco">${hasWork ? '🧠' : '✅'}</span>
      ${hasWork ? html`
        <h2>Bereit zum Lernen?</h2>
        <div class="hero-stats">
          <div><b>${all.due}</b><span>fällig</span></div>
          <div><b>${newToday}</b><span>neu</span></div>
          <div><b>~${Math.max(1, Math.round(Math.min(s.sessionSize, all.due + newToday) * 0.25))}</b><span>Minuten</span></div>
        </div>
        <a class="btn block" href="#/lernen">Los geht's</a>
      ` : html`
        <h2>Alles erledigt für heute</h2>
        <p>Keine Karten fällig. Lust auf ein Quiz oder neue Karten?</p>
        <div class="btn-row" style="margin-top:0">
          <a class="btn" href="#/quiz">Quiz starten</a>
          ${all.fresh ? html`<a class="btn" href="#/lernen?extra=1">Mehr Neue</a>` : ''}
        </div>
      `}
    </div>

    <h2 class="section-title">Prüfungen <a href="#/einstellungen?exam=1">Hinzufügen</a></h2>
    <div class="scroller">
      ${exams.map(e => {
        const sub = content.subject(e.subject);
        const d = daysBetween(todayKey, e.date);
        return html`<a class="exam" style="--tile:${sub?.color || 'var(--accent)'}" href="${sub ? `#/fach/${sub.id}` : '#/einstellungen'}">
          <div class="days">${d === 0 ? 'Heute' : d}${d ? html` <small>${d === 1 ? 'Tag' : 'Tage'}</small>` : ''}</div>
          <div class="t">${sub ? sub.icon + ' ' : ''}${e.title}</div>
          <div class="caption">${new Date(e.date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        </a>`;
      })}
      <a class="exam add" href="#/einstellungen?exam=1">＋<br>Prüfung eintragen</a>
    </div>

    <h2 class="section-title">Üben</h2>
    <div class="quick">
      <a href="#/quiz?mode=uebung">
        <span class="icon-tile" style="--tile:#FF950022">🎯</span>
        <b>Schnell-Quiz</b><span class="caption">${s.quizSize} Fragen gemischt</span>
      </a>
      <a href="#/quiz?mode=pruefung">
        <span class="icon-tile" style="--tile:#5856D622">📝</span>
        <b>Probeprüfung</b><span class="caption">Mit Zeit & Note</span>
      </a>
      ${wrong ? html`<a href="#/quiz?mode=fehler">
        <span class="icon-tile" style="--tile:#FF3B3022">🔁</span>
        <b>Fehler üben</b><span class="caption">${plural(wrong, 'Frage', 'Fragen')} offen</span>
      </a>` : ''}
      <a href="#/statistik">
        <span class="icon-tile" style="--tile:#34C75922">📈</span>
        <b>Fortschritt</b><span class="caption">${all.mastered} von ${all.total} gefestigt</span>
      </a>
    </div>

    <h2 class="section-title">Fächer <a href="#/faecher">Alle</a></h2>
    <div class="list">
      ${content.subjects().map(sub => {
        const st = content.stats({ type: 'subject', id: sub.id });
        return html`<a class="row has-icon" href="#/fach/${sub.id}">
          ${subjectTile(sub)}
          <div class="grow"><div class="title">${sub.name}</div>
            <div class="sub">${st.learned} / ${st.total} Karten gelernt</div></div>
          ${st.due ? html`<span class="badge">${st.due}</span>` : ''}
          ${icon.chev}
        </a>`;
      })}
    </div>
  `);
}
