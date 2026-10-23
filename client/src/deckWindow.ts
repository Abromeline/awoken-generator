// THE DECK WINDOW (Nigel, 2026-10-23 19:45 — the R6
// in-wheel fix, superseding the deck panel): summoning
// stays in the action wheel, with no pop-up, and the wheel
// never shows the whole deck at once. The Awoken branch
// carries the company plus ONE window of deck entries —
// six at a time, the page the inner ring can honestly hold
// readably — and a "More" entry inside the wheel steps the
// window through the deck until every deck Awoken is
// reachable by paging. This module is the window's whole
// reckoning, kept pure so both grounds (Table + homeland)
// page identically and the deck-window drive can exercise
// the very code the wheel renders.

/** Deck entries shown at once on the wheel's Awoken branch. */
export const DECK_WINDOW_SIZE = 6;

export interface DeckWindow<T> {
  /** The window's entries — at most DECK_WINDOW_SIZE. */
  entries: T[];
  /** The page actually shown (the asked-for page, clamped). */
  page: number;
  pageCount: number;
  total: number;
  /** True when a "More" step stands: more than one page. */
  hasMore: boolean;
}

export function deckPageCount(total: number, size: number = DECK_WINDOW_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

export function clampDeckPage(page: number, total: number, size: number = DECK_WINDOW_SIZE): number {
  const pc = deckPageCount(total, size);
  const p = Number.isFinite(page) ? Math.floor(page) : 0;
  return Math.min(Math.max(0, p), pc - 1);
}

/** The window of `deck` on `page`: never more than `size`
 *  entries, in the deck's own order. A page past the end
 *  (the deck shrank under it — a call landed) clamps to the
 *  last standing page, so the wheel never opens on a blank
 *  window while deck entries remain. */
export function deckWindow<T>(deck: readonly T[], page: number, size: number = DECK_WINDOW_SIZE): DeckWindow<T> {
  const total = deck.length;
  const pageCount = deckPageCount(total, size);
  const p = clampDeckPage(page, total, size);
  return {
    entries: deck.slice(p * size, p * size + size),
    page: p,
    pageCount,
    total,
    hasMore: pageCount > 1,
  };
}

/** The "More" step: the next page, wrapping from the last
 *  page back to the first, so repeated taps walk the whole
 *  deck and begin again. */
export function nextDeckPage(page: number, total: number, size: number = DECK_WINDOW_SIZE): number {
  const pc = deckPageCount(total, size);
  return (clampDeckPage(page, total, size) + 1) % pc;
}
