// Shared UI fragments.
import { html, raw, $, $$ } from './util.js';
import * as store from './store.js';

export function applyTheme() {
  const t = store.settings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#000000' : '#F2F2F7'));
}

export const icon = {
  chev: raw('<svg class="chev" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6"/></svg>'),
  back: raw('<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>'),
  close: raw('<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'),
  speaker: raw('<svg viewBox="0 0 24 24"><path d="M4 9.5h3.2L12 5.2v13.6l-4.8-4.3H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.3 5.8a9 9 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  undo: raw('<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg>'),
};

export function chips() {
  const s = store.streak();
  const doneToday = store.today().xp > 0;
  return html`<div class="chips">
    <span class="chip flame ${doneToday ? '' : 'off'}" title="Lernserie">🔥 ${s}</span>
    <span class="chip xp" title="XP gesamt">⚡ ${store.get().xp}</span>
  </div>`;
}

export function backLink(href, label = 'Zurück') {
  return html`<a class="back" href="${href}">${icon.back}${label}</a>`;
}

export function subjectTile(s, size = '') {
  return html`<span class="icon-tile ${size}" style="--tile:${s.color}22">${s.icon}</span>`;
}

/** Stacked progress bar: mastered / learned / rest */
export function progressBar(st, color) {
  const t = Math.max(1, st.total);
  return html`<div class="bar" style="--tile:${color}">
    <i class="m" style="width:${(st.mastered / t) * 100}%"></i>
    <i class="l" style="width:${((st.learned - st.mastered) / t) * 100}%"></i>
  </div>`;
}

/** Simple bottom sheet. content: html; onMount(el, close) */
export function sheet(title, content, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = String(html`<div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="grabber"></div><h2>${title}</h2>${content}</div>`);
  const close = () => { wrap.remove(); removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  onMount?.($('.sheet', wrap), close);
  return close;
}

export function confirmSheet(title, text, okLabel, onOk, danger = true) {
  sheet(title, html`<p class="subtitle" style="text-align:center;margin-bottom:18px">${text}</p>
    <div class="btn-row"><button class="btn secondary" data-x>Abbrechen</button>
    <button class="btn ${danger ? 'red' : ''}" data-ok>${okLabel}</button></div>`, (el, close) => {
    el.querySelector('[data-x]').onclick = close;
    el.querySelector('[data-ok]').onclick = () => { close(); onOk(); };
  });
}

/** route args ['subject','statik'] → { type: 'subject', id: 'statik' } */
export function scopeFrom(args) {
  if ((args[0] === 'subject' || args[0] === 'deck') && args[1]) return { type: args[0], id: args[1] };
  return { type: 'all' };
}

export function scopeHref(kind, scope) {
  return scope.type === 'all' ? `#/${kind}` : `#/${kind}/${scope.type}/${encodeURIComponent(scope.id)}`;
}
