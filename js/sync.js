// Cross-device sync via Supabase (REST, no SDK). Login with a one-time e-mail code.
// One row per user in table "progress"; every sync = pull → merge → push.
import * as store from './store.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const AUTH_KEY = 'lernbau.auth';
const listeners = new Set();
let session = null;
let busy = false;
let pushTimer = null;
export const status = { last: 0, error: '', running: false };

export const enabled = () => !!(SUPABASE_URL && SUPABASE_KEY);
export const user = () => session?.user ?? null;
export const onStatus = fn => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach(fn => fn());

function loadSession() {
  try { session = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { session = null; }
}
function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
    else localStorage.removeItem(AUTH_KEY);
  } catch {}
  emit();
}

async function api(path, { method = 'GET', body, auth = true, headers = {}, keepalive = false } = {}) {
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
  if (auth) h.Authorization = `Bearer ${await accessToken()}`;
  const res = await fetch(SUPABASE_URL + path, { method, headers: h, body: body && JSON.stringify(body), keepalive });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.msg || data?.error_description || data?.message || `Fehler ${res.status}`);
  return data;
}

function fromAuth(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
    user: { id: d.user.id, email: d.user.email },
  };
}

async function accessToken() {
  if (!session) throw new Error('Nicht angemeldet');
  if (session.expires_at - 60_000 < Date.now()) {
    try {
      const d = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: session.refresh_token } });
      saveSession(fromAuth(d));
    } catch (e) {
      if (navigator.onLine) saveSession(null);
      throw e;
    }
  }
  return session.access_token;
}

export async function sendCode(email) {
  await api('/auth/v1/otp', { method: 'POST', auth: false, body: { email, create_user: true } });
}

export async function verifyCode(email, token) {
  const d = await api('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token } });
  saveSession(fromAuth(d));
  await syncNow();
}

export function logout() {
  clearTimeout(pushTimer);
  saveSession(null);
}

function payload() {
  const { settings, ...rest } = store.get();   // settings stay per device
  return rest;
}

/** Pull remote state, merge into local, push the result. */
export async function syncNow({ keepalive = false } = {}) {
  if (!enabled() || !session || busy || !navigator.onLine) return;
  busy = true; status.running = true; emit();
  try {
    if (!keepalive) {
      const rows = await api(`/rest/v1/progress?select=state&user_id=eq.${session.user.id}`);
      if (rows?.[0]?.state) {
        store.merge(rows[0].state);
        store.flush();
      }
    }
    await api('/rest/v1/progress', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: session.user.id, state: payload(), updated_at: new Date().toISOString() },
      keepalive,
    });
    status.last = Date.now();
    status.error = '';
  } catch (e) {
    status.error = e.message;
    console.warn('Sync', e);
  } finally {
    busy = false; status.running = false; emit();
  }
}

export function init() {
  loadSession();
  if (!enabled()) return;
  // Local change → sync a few seconds later (batches a whole card session).
  store.onChange(() => {
    if (busy || !session) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 5000);
  });
  document.addEventListener('visibilitychange', () => {
    if (!session) return;
    if (document.hidden) { clearTimeout(pushTimer); syncNow({ keepalive: true }); }
    else syncNow();
  });
  addEventListener('online', () => syncNow());
  if (session) syncNow();
}
