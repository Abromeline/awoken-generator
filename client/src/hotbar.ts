// THE HOTBAR (Nigel, 2026-10-19): the tender-mode control
// law's belt — workings, weapons, abilities and Awokin locked
// from the radial (or the hand) onto a small clickable bar.
// The bar's contents are the player's own arrangement, kept
// in this browser; what a slot DOES is always the surface's
// real flow (placing, wield, manifest, summon) — the bar
// holds no power of its own.

export const HOTBAR_MAX = 6;

/** The touch form factor: a coarse pointer (a finger, a pen)
 *  is the first hand. Touch law is additive — it never takes
 *  a mouse surface away. */
export function coarsePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

export function loadHotbar(storageKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x === "string").slice(0, HOTBAR_MAX) : [];
  } catch { return []; }
}

export function saveHotbar(storageKey: string, keys: string[]): void {
  try { window.localStorage.setItem(storageKey, JSON.stringify(keys.slice(0, HOTBAR_MAX))); }
  catch { /* storage denied — the bar lives for the sitting */ }
}

/** Lock or loose a key: present → removed; absent → appended
 *  (the bar refuses a seventh — loose one first). */
export function toggleHotbarKey(keys: string[], key: string): string[] {
  if (keys.includes(key)) return keys.filter(k => k !== key);
  if (keys.length >= HOTBAR_MAX) return keys;
  return [...keys, key];
}
