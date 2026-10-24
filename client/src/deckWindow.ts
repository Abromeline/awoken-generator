// THE DECK WINDOW (Nigel, 2026-10-23 19:45 — the R6
// in-wheel fix, superseding the deck panel): summoning
// stays in the action wheel, with no pop-up, and the wheel
// never shows the whole deck at once. The Awoken branch
// carries the company plus a window of deck entries, paged
// by a "More" entry inside the wheel.
//
// THE WINDOW IS FIVE PAGES (Nigel, 2026-10-24 16:19: "set
// a max in the action wheel to show only 5 pages of awoken
// but as they are cast pages refill"): the wheel presents
// at most FIVE pages at a time — pages of six, thirty
// Awoken within reach — and the pager walks those five
// pages only, wrapping inside them. The window is always
// the first five pages OF THE LIVE LIST: a cast removes
// the cast Awoken from the served deck, so every page
// below the cast refills from the page under it and the
// next Awoken waiting beyond the window slides into the
// last page. Cast by cast the window slides over the
// whole deck — never more than five pages, never dry
// until the deck is. A deck of thirty or fewer is simply
// presented whole, exactly as the R6 window presented it.
// This module is the window's whole reckoning, kept pure
// so both grounds (Table + homeland) page identically and
// the deck-window drive can exercise the very code the
// wheel renders.

/** Entries fanned on one page of the wheel's Awoken branch. */
export const DECK_PAGE_SIZE = 6;

/** Pages the wheel presents at once — the window's whole span. */
export const DECK_WINDOW_PAGES = 5;

/** Deck entries within reach at once: five pages of six. */
export const DECK_WINDOW_SIZE = DECK_PAGE_SIZE * DECK_WINDOW_PAGES;

export interface DeckWindow<T> {
  /** The fanned page's entries — at most DECK_PAGE_SIZE. */
  entries: T[];
  /** The page actually shown within the window (the asked-for page, clamped). */
  page: number;
  /** Pages in the presented window — never more than DECK_WINDOW_PAGES. */
  pageCount: number;
  /** Entries the window presents — never more than DECK_WINDOW_SIZE. */
  spanCount: number;
  total: number;
  /** True when a "More" step stands: the window holds more than one page. */
  hasMore: boolean;
}

export function deckPageCount(total: number, size: number = DECK_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** Pages in the presented window over a deck of `total`:
 *  the deck's page count, capped at DECK_WINDOW_PAGES. */
export function deckWindowPageCount(total: number): number {
  return deckPageCount(Math.min(Math.max(0, total), DECK_WINDOW_SIZE), DECK_PAGE_SIZE);
}

export function clampDeckPage(page: number, total: number, size: number = DECK_PAGE_SIZE): number {
  const pc = deckPageCount(total, size);
  const p = Number.isFinite(page) ? Math.floor(page) : 0;
  return Math.min(Math.max(0, p), pc - 1);
}

/** A page index clamped into the presented window: the
 *  window over a deck of `total` holds the deck's first
 *  DECK_WINDOW_SIZE entries, so its pages are the page
 *  count of that capped span. */
function clampWindowPage(page: number, total: number): number {
  const cappedTotal = Math.min(Math.max(0, total), DECK_WINDOW_SIZE);
  return clampDeckPage(page, cappedTotal, DECK_PAGE_SIZE);
}

/** The window of `deck` on `page`: the deck's first five
 *  pages are the presented span; `page` walks inside that
 *  span and clamps to its last standing page, so the wheel
 *  never opens on a blank page while deck entries remain.
 *  When a cast shrinks the live list under the window, the
 *  span refills itself — the entries below the cast flow
 *  up through the pages and the next waiting Awoken stands
 *  in the last page. */
export function deckWindow<T>(deck: readonly T[], page: number): DeckWindow<T> {
  const total = deck.length;
  const pageCount = deckWindowPageCount(total);
  const p = clampWindowPage(page, total);
  const spanCount = Math.min(total, DECK_WINDOW_SIZE);
  return {
    entries: deck.slice(p * DECK_PAGE_SIZE, p * DECK_PAGE_SIZE + DECK_PAGE_SIZE),
    page: p,
    pageCount,
    spanCount,
    total,
    hasMore: pageCount > 1,
  };
}

/** The "More" step: the next page INSIDE the presented
 *  window, wrapping from the window's last page back to
 *  its first. Pages beyond the window are never paged to —
 *  they arrive by the refill as casts slide the window
 *  over the deck. */
export function nextDeckPage(page: number, total: number): number {
  const pc = deckWindowPageCount(total);
  return (clampWindowPage(page, total) + 1) % pc;
}
