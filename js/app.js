// Entry point: boot, theme, hash router.
import * as store from './store.js';
import * as content from './content.js';
import { $, $$, html } from './util.js';
import { applyTheme } from './ui.js';
import * as sync from './sync.js';
import home from './views/home.js';
import { subjectsView, subjectView, deckView } from './views/subjects.js';
import review from './views/review.js';
import quiz from './views/quiz.js';
import stats from './views/stats.js';
import settingsView from './views/settings.js';

const view = $('#view');
let cleanup = null;

const routes = {
  heute: { tab: 'heute', render: home },
  faecher: { tab: 'faecher', render: subjectsView },
  fach: { tab: 'faecher', render: subjectView },
  deck: { tab: 'faecher', render: deckView },
  lernen: { tab: null, render: review },
  quiz: { tab: null, render: quiz },
  statistik: { tab: 'statistik', render: stats },
  einstellungen: { tab: 'einstellungen', render: settingsView },
};

function parse() {
  const h = location.hash.replace(/^#\/?/, '') || 'heute';
  const [path, qs = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0], args: parts.slice(1), query: Object.fromEntries(new URLSearchParams(qs)) };
}

function route() {
  const r = parse();
  const def = routes[r.name] || routes.heute;
  cleanup?.();
  cleanup = null;
  document.body.classList.toggle('immersive', !def.tab);
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === def.tab));
  view.classList.remove('fade-in');
  void view.offsetWidth;
  view.classList.add('fade-in');
  try {
    cleanup = def.render(view, r) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = String(html`<div class="empty"><div class="e">😵</div><h3>Da ist etwas schiefgelaufen</h3><p>${e.message}</p>
      <p style="margin-top:16px"><a class="btn small" href="#/heute">Zur Startseite</a></p></div>`);
  }
  if (!def.tab) window.scrollTo(0, 0);
  else if (!history.state?.keepScroll) window.scrollTo(0, 0);
}

async function boot() {
  store.load();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  try {
    await content.load();
  } catch (e) {
    view.innerHTML = String(html`<div class="empty"><div class="e">📡</div><h3>Inhalte nicht verfügbar</h3>
      <p>${e.message}. Beim ersten Start wird eine Internetverbindung benötigt.</p></div>`);
    return;
  }
  // Optional call: right after an update one module may still come from the browser cache.
  store.applyPresetExams?.(content.presetExams?.() || []);
  addEventListener('hashchange', route);
  route();
  sync.init();
  // Re-render passive pages when synced data arrives from another device.
  let lastSync = 0;
  sync.onStatus(() => {
    if (sync.status.last !== lastSync) {
      lastSync = sync.status.last;
      const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'heute';
      if (['heute', 'faecher', 'fach', 'deck', 'statistik'].includes(name)) route();
    }
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  }
}

boot();
