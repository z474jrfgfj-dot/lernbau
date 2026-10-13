// Checks a typed vocabulary answer against a card side like
// "der Dachdecker / die Dachdeckerin", "das Untergeschoss (der Keller)",
// "setzen, festlegen; abbinden (Beton)" or "be – was/were – been".
import { norm, lev } from './views/quiz.js';

const ARTICLE = /^(der|die|das|den|dem|des|ein|eine|einen|to|the|a|an)\s+/;
const clean = s => norm(s).replace(ARTICLE, '').replace(/[.!?]/g, '').trim();

function alternatives(target) {
  const t = String(target);
  const parens = [...t.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
  const base = t.replace(/\([^)]*\)/g, ' ');
  return [...base.split(/\s*[\/;,]\s*/), ...parens.flatMap(p => p.split(/\s*[\/;,]\s*/))]
    .map(clean).filter(Boolean);
}

const close = (a, b) => a === b ? 'right' : (b.length >= 5 && lev(a, b) <= 1 ? 'typo' : null);

/** returns { result: 'right' | 'typo' | 'partial' | 'wrong' } */
export function checkVocab(target, value) {
  const v = clean(value);
  if (!v) return 'wrong';

  // Verb forms "go – went – gone": every form must match (slashes allow alternatives).
  if (/\s[–—-]\s/.test(target)) {
    const slots = String(target).split(/\s[–—-]\s/).map(s => s.split('/').map(clean));
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
  for (const a of alternatives(target)) {
    const r = close(v, a);
    if (r === 'right') return 'right';
    if (r === 'typo') best = 'typo';
  }
  return best;
}
