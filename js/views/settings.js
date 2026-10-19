import * as store from '../store.js';
import * as content from '../content.js';
import * as speech from '../speech.js';
import * as sync from '../sync.js';
import { html, $, toast, dayKey, daysBetween } from '../util.js';
import { chips, sheet, confirmSheet, applyTheme } from '../ui.js';

const OPTIONS = {
  dailyGoal: [[20, '20 XP · locker'], [30, '30 XP'], [50, '50 XP · normal'], [80, '80 XP · ehrgeizig'], [120, '120 XP · Prüfungsphase']],
  newPerDay: [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30'], [50, '50']],
  sessionSize: [[10, '10 Karten'], [20, '20 Karten'], [30, '30 Karten'], [50, '50 Karten'], [100, '100 Karten']],
  vocabSize: [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [0, 'Alle']],
  vocabDir: [['both', 'Beide Richtungen'], ['en-de', 'Englisch → Deutsch'], ['de-en', 'Deutsch → Englisch']],
  retention: [[0.85, '85 % · weniger Wiederholungen'], [0.9, '90 % · empfohlen'], [0.95, '95 % · vor Prüfungen']],
  theme: [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']],
  rate: [[0.8, 'Langsam'], [0.95, 'Normal'], [1.1, 'Schnell']],
};

function select(key) {
  const cur = store.settings()[key];
  return html`<select data-set="${key}" aria-label="${key}">
    ${OPTIONS[key].map(([v, l]) => html`<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`)}
  </select>`;
}

function examSheet(rerender) {
  const subs = content.subjects();
  sheet('Prüfung eintragen', html`
    <form data-exam>
      <div class="list">
        <label class="row"><span class="grow">Fach</span>
          <select name="subject">${subs.map(s => html`<option value="${s.id}">${s.icon} ${s.name}</option>`)}</select></label>
        <label class="row"><input type="text" name="title" placeholder="Titel, z. B. 1. Schulaufgabe" required maxlength="60"></label>
        <label class="row"><span class="grow">Datum</span><input type="date" name="date" required min="${dayKey()}"></label>
      </div>
      <div class="btn-row"><button type="button" class="btn secondary" data-x>Abbrechen</button><button class="btn green">Speichern</button></div>
    </form>`, (el, close) => {
    el.querySelector('[data-x]').onclick = close;
    el.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      store.addExam({ subject: f.get('subject'), title: String(f.get('title')).trim(), date: f.get('date') });
      store.flush();
      close();
      toast('Prüfung gespeichert 📅');
      rerender();
    };
  });
}

async function exportBackup() {
  const data = store.exportJson();
  const name = `lernbau-sicherung-${dayKey()}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'LernBau Sicherung' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function settingsView(el, route) {
  let codeFor = '';      // e-mail a login code was sent to
  let syncMsg = '';

  const syncSection = () => {
    const u = sync.user();
    const st = sync.status;
    if (u) return html`
      <h2 class="section-title">Sync</h2>
      <div class="list">
        <div class="row"><span class="grow">Angemeldet als</span><span class="value">${u.email}</span></div>
        <div class="row"><span class="grow">Letzter Abgleich</span><span class="value">${st.running ? 'läuft …' : st.last ? new Date(st.last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–'}</span></div>
        ${st.error ? html`<div class="row"><span class="sub" style="color:var(--red)">${st.error}</span></div>` : ''}
        <button class="row action" data-sync-now>Jetzt synchronisieren</button>
        <button class="row danger" data-logout>Abmelden</button>
      </div>
      <p class="footnote">Dein Fortschritt wird automatisch zwischen allen Geräten abgeglichen, auf denen du angemeldet bist.</p>`;
    return html`
      <h2 class="section-title">Sync</h2>
      <form class="list" data-login>
        ${codeFor
          ? html`<div class="row"><span class="sub">Code an ${codeFor} gesendet. Schau in dein Postfach (auch im Spam).</span></div>
              <label class="row"><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="Code aus der E-Mail" maxlength="10" required></label>
              <button class="row action">Anmelden</button>
              <button type="button" class="row" data-other-mail style="color:var(--label2)">Andere E-Mail</button>`
          : html`<label class="row"><input type="text" name="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="Deine E-Mail-Adresse" required></label>
              <button class="row action">Anmelde-Code senden</button>`}
      </form>
      ${syncMsg ? html`<p class="footnote" style="color:var(--red)">${syncMsg}</p>` : ''}
      <p class="footnote">Melde dich auf jedem Gerät mit derselben E-Mail an, dann ist dein Fortschritt überall gleich. Kein Passwort nötig – du bekommst jedes Mal einen Code per E-Mail.</p>`;
  };

  const render = () => {
    const s = store.settings();
    const t = content.totals();
    const exams = store.get().exams;
    const today = dayKey();
    el.innerHTML = String(html`
      <div class="top"><h1 class="large-title">Mehr</h1>${chips()}</div>

      <h2 class="section-title">Profil</h2>
      <div class="list">
        <label class="row"><span class="grow">Name</span><input type="text" data-name value="${s.name}" maxlength="24" style="max-width:50%;text-align:right"></label>
      </div>

      <h2 class="section-title">Prüfungen <button data-add-exam>Hinzufügen</button></h2>
      <div class="list">
        ${exams.length ? exams.map(e => {
          const sub = content.subject(e.subject);
          const d = daysBetween(today, e.date);
          return html`<div class="row has-icon">
            <span class="icon-tile" style="--tile:${sub?.color || '#888'}22">${sub?.icon || '📅'}</span>
            <div class="grow"><div class="title">${e.title}</div>
              <div class="sub">${new Date(e.date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · ${d < 0 ? 'vorbei' : d === 0 ? 'heute' : `in ${d} Tagen`}</div></div>
            <button class="icon-btn" data-del-exam="${e.id}" aria-label="Löschen" style="color:var(--red)"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button>
          </div>`;
        }) : html`<button class="row action" data-add-exam>＋ Erste Prüfung eintragen</button>`}
      </div>
      <p class="footnote">Prüfungen erscheinen als Countdown auf der Startseite.</p>

      <h2 class="section-title">Lernen</h2>
      <div class="list">
        <label class="row"><span class="grow">Tagesziel</span>${select('dailyGoal')}</label>
        <label class="row"><span class="grow">Neue Karten pro Tag</span>${select('newPerDay')}</label>
        <label class="row"><span class="grow">Rundengröße</span>${select('sessionSize')}</label>
        <label class="row"><span class="grow">Vokabeln abfragen</span>${select('vocabDir')}</label>
        <label class="row"><span class="grow">Vokabeln pro Runde</span>${select('vocabSize')}</label>
        <label class="row"><span class="grow">Behaltensrate</span>${select('retention')}</label>
      </div>
      <p class="footnote">Die Wiederholungen plant der FSRS-Algorithmus: Karten, die du gut kannst, kommen seltener, schwierige öfter. Höhere Behaltensrate = mehr Wiederholungen.</p>

      <h2 class="section-title">Aussprache</h2>
      <div class="list">
        ${speech.supported() ? html`
        <label class="row"><span class="grow">Stimme</span><select data-voice aria-label="Stimme"><option value="">Automatisch</option>
          ${speech.voices().map(v => html`<option value="${v.voiceURI}" ${v.voiceURI === s.voice ? 'selected' : ''}>${v.name} (${v.lang})</option>`)}</select></label>
        <label class="row"><span class="grow">Tempo</span>${select('rate')}</label>
        <label class="row"><span class="grow">Automatisch vorlesen</span>
          <span class="switch"><input type="checkbox" data-toggle="autoSpeak" ${s.autoSpeak ? 'checked' : ''} aria-label="Automatisch vorlesen"><span></span></span></label>
        <button class="row action" data-test-voice>▶︎ Probe hören</button>
        ` : html`<div class="row"><span class="sub">Sprachausgabe wird von diesem Browser nicht unterstützt.</span></div>`}
      </div>
      <p class="footnote">Tipp: Unter iOS/macOS → Bedienungshilfen → Gesprochene Inhalte → Stimmen kannst du bessere englische Stimmen (z. B. „Daniel (Premium)“) laden.</p>

      <h2 class="section-title">Darstellung</h2>
      <div class="segmented" data-theme-seg>
        ${OPTIONS.theme.map(([v, l]) => html`<button class="${s.theme === v ? 'on' : ''}" data-theme-v="${v}">${l}</button>`)}
      </div>

      ${sync.enabled() ? syncSection() : ''}

      <h2 class="section-title">Daten & Geräte</h2>
      <div class="list">
        <button class="row action" data-export>Fortschritt sichern (Datei)</button>
        <label class="row action" style="cursor:pointer">Sicherung laden…<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
      <p class="footnote">Dein Fortschritt wird nur auf diesem Gerät gespeichert. Mit „Sichern“ und „Laden“ kannst du ihn z. B. per AirDrop vom iPhone aufs iPad übertragen – beim Laden werden die Stände zusammengeführt.</p>

      <div class="list" style="margin-top:20px">
        <button class="row danger" data-reset>Lernfortschritt zurücksetzen</button>
      </div>

      <h2 class="section-title">Über</h2>
      <div class="list">
        <div class="row"><span class="grow">Inhalte</span><span class="value">${t.cards} Karten · ${t.questions} Fragen</span></div>
        <div class="row"><span class="grow">Inhaltsstand</span><span class="value mono">${content.version()}</span></div>
        <div class="row"><span class="grow">Version</span><span class="value">LernBau 1.0</span></div>
      </div>
      <p class="footnote" style="text-align:center;padding-bottom:20px">Inhalte KI-erstellt aus deinen Arbeitsblättern – bei Zweifeln gilt das Skript deiner Lehrkraft.</p>
    `);
  };

  function onChange(e) {
    const t = e.target;
    if (t.dataset.set) {
      const raw = t.value;
      store.setSetting(t.dataset.set, isNaN(+raw) ? raw : +raw);
      toast('Gespeichert');
    } else if (t.matches('[data-voice]')) {
      store.setSetting('voice', t.value);
      speech.speak('Scaffolding');
    } else if (t.dataset.toggle) {
      store.setSetting(t.dataset.toggle, t.checked);
    } else if (t.matches('[data-name]')) {
      store.setSetting('name', t.value.trim() || 'Max');
    } else if (t.matches('[data-import]') && t.files[0]) {
      t.files[0].text().then(txt => {
        try { store.importJson(txt, 'merge'); toast('Sicherung geladen ✓'); render(); }
        catch (err) { toast(err.message || 'Datei ungültig'); }
      });
    }
  }

  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    if ('addExam' in t.dataset) return examSheet(render);
    if (t.dataset.delExam) { store.removeExam(t.dataset.delExam); store.flush(); return render(); }
    if (t.dataset.themeV) {
      store.setSetting('theme', t.dataset.themeV);
      applyTheme();
      return render();
    }
    if ('testVoice' in t.dataset) return speech.speak('The concrete slab is reinforced with steel bars.');
    if ('export' in t.dataset) return exportBackup();
    if ('syncNow' in t.dataset) return sync.syncNow();
    if ('logout' in t.dataset) { sync.logout(); toast('Abgemeldet'); return render(); }
    if ('otherMail' in t.dataset) { codeFor = ''; return render(); }
    if ('reset' in t.dataset) {
      return confirmSheet('Fortschritt zurücksetzen?', 'Alle Lernstände, XP und die Serie werden gelöscht. Einstellungen und Prüfungen bleiben. Tipp: Vorher sichern.', 'Zurücksetzen', () => {
        store.reset(); toast('Zurückgesetzt'); render();
      });
    }
  }

  async function onSubmit(e) {
    if (!e.target.matches('[data-login]')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button.action');
    btn.disabled = true;
    syncMsg = '';
    try {
      if (!codeFor) {
        const email = String(f.get('email')).trim().toLowerCase();
        await sync.sendCode(email);
        codeFor = email;
      } else {
        await sync.verifyCode(codeFor, String(f.get('code')).replace(/\s/g, ''));
        codeFor = '';
        toast('Angemeldet – Fortschritt wird synchronisiert ✓');
      }
    } catch (err) {
      syncMsg = err.message || 'Das hat nicht geklappt.';
    }
    render();
  }

  render();
  const offStatus = sync.onStatus(() => { if (!codeFor) render(); });
  el.addEventListener('submit', onSubmit);
  speech.whenReady().then(() => { if (el.isConnected && location.hash.startsWith('#/einstellungen')) render(); });
  el.addEventListener('change', onChange);
  el.addEventListener('click', onClick);
  if (route.query.exam === '1') setTimeout(() => examSheet(render), 50);
  return () => {
    offStatus();
    el.removeEventListener('submit', onSubmit);
    el.removeEventListener('change', onChange);
    el.removeEventListener('click', onClick);
  };
}
