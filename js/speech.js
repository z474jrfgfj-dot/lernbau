// English text-to-speech via the Web Speech API (works offline on iOS/macOS).
import * as store from './store.js';

const synth = window.speechSynthesis;
const PREFERRED = ['Daniel', 'Serena', 'Kate', 'Arthur', 'Martha', 'Oliver', 'Stephanie', 'Google UK English'];

export const supported = () => !!synth;

export function voices() {
  if (!synth) return [];
  return synth.getVoices()
    .filter(v => v.lang?.toLowerCase().startsWith('en'))
    .sort((a, b) => score(b) - score(a));
}

function score(v) {
  let s = 0;
  if (/en[-_]GB/i.test(v.lang)) s += 10;
  if (/premium|enhanced|natural/i.test(v.name)) s += 5;
  const i = PREFERRED.findIndex(p => v.name.includes(p));
  if (i >= 0) s += 8 - i * 0.5;
  if (v.localService) s += 1;
  return s;
}

function pick() {
  const all = voices();
  const want = store.settings().voice;
  return all.find(v => v.voiceURI === want) || all[0] || null;
}

export function speak(text) {
  if (!synth || !text) return;
  synth.cancel();
  // Strip "go – went – gone" separators into pauses and remove markdown markers.
  const clean = String(text).replace(/\*\*/g, '').replace(/\s[–—-]\s/g, ', ');
  const u = new SpeechSynthesisUtterance(clean);
  const v = pick();
  if (v) u.voice = v;
  u.lang = v?.lang || 'en-GB';
  u.rate = store.settings().rate;
  synth.speak(u);
}

export function stop() { synth?.cancel(); }

// Voices load asynchronously in Safari/Chrome.
export function whenReady() {
  return new Promise(res => {
    if (!synth || synth.getVoices().length) return res();
    synth.addEventListener('voiceschanged', () => res(), { once: true });
    setTimeout(res, 1500);
  });
}
