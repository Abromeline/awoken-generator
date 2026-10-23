/**
 * THE NEW WORKINGS' OWN ART (Nigel, 2026-10-22; ported whole
 * from the Proving Ground, 2026-10-23 — the porting law: what
 * the Proving Ground proved arrives with nothing changed in
 * count, timing, motion or behaviour).
 *
 * BATS — Nigel's 43 frames, cropped to their union and shrunk
 * for the page exactly as the Proving Ground carries them
 * (660×348, RGBA). The sequence plays for the whole life of
 * the swarm; the frame at a moment is the wall clock's own
 * reading, as the page played it: a frame every 66 ms,
 * cycling all 43.
 *
 * HOLD RUNE — the condensed game copy, 47 slots in play
 * order (768×388, RGBA): slots 1–33 the rune forms and
 * hovers, slots 34–40 the crash down, slots 41–47 the crash
 * again. In play the form/hover plays ONCE at its own
 * ~122 ms a slot; when the crash's first strike lands the
 * hold begins (3 s), and the crash section (slots 34–40)
 * LOOPS for the whole hold, stopping when the hold ends.
 *
 * RUNE SHATTER — the Hold Rune's glyph in its three pieces,
 * cut from the formed rune, exactly as the page cut them.
 * A tap looses the three in a straight shot; held, they
 * stream — the pieces cycle in this order as they fly.
 */
import bats01 from "./assets/effects/bats/bats-01.png";
import bats02 from "./assets/effects/bats/bats-02.png";
import bats03 from "./assets/effects/bats/bats-03.png";
import bats04 from "./assets/effects/bats/bats-04.png";
import bats05 from "./assets/effects/bats/bats-05.png";
import bats06 from "./assets/effects/bats/bats-06.png";
import bats07 from "./assets/effects/bats/bats-07.png";
import bats08 from "./assets/effects/bats/bats-08.png";
import bats09 from "./assets/effects/bats/bats-09.png";
import bats10 from "./assets/effects/bats/bats-10.png";
import bats11 from "./assets/effects/bats/bats-11.png";
import bats12 from "./assets/effects/bats/bats-12.png";
import bats13 from "./assets/effects/bats/bats-13.png";
import bats14 from "./assets/effects/bats/bats-14.png";
import bats15 from "./assets/effects/bats/bats-15.png";
import bats16 from "./assets/effects/bats/bats-16.png";
import bats17 from "./assets/effects/bats/bats-17.png";
import bats18 from "./assets/effects/bats/bats-18.png";
import bats19 from "./assets/effects/bats/bats-19.png";
import bats20 from "./assets/effects/bats/bats-20.png";
import bats21 from "./assets/effects/bats/bats-21.png";
import bats22 from "./assets/effects/bats/bats-22.png";
import bats23 from "./assets/effects/bats/bats-23.png";
import bats24 from "./assets/effects/bats/bats-24.png";
import bats25 from "./assets/effects/bats/bats-25.png";
import bats26 from "./assets/effects/bats/bats-26.png";
import bats27 from "./assets/effects/bats/bats-27.png";
import bats28 from "./assets/effects/bats/bats-28.png";
import bats29 from "./assets/effects/bats/bats-29.png";
import bats30 from "./assets/effects/bats/bats-30.png";
import bats31 from "./assets/effects/bats/bats-31.png";
import bats32 from "./assets/effects/bats/bats-32.png";
import bats33 from "./assets/effects/bats/bats-33.png";
import bats34 from "./assets/effects/bats/bats-34.png";
import bats35 from "./assets/effects/bats/bats-35.png";
import bats36 from "./assets/effects/bats/bats-36.png";
import bats37 from "./assets/effects/bats/bats-37.png";
import bats38 from "./assets/effects/bats/bats-38.png";
import bats39 from "./assets/effects/bats/bats-39.png";
import bats40 from "./assets/effects/bats/bats-40.png";
import bats41 from "./assets/effects/bats/bats-41.png";
import bats42 from "./assets/effects/bats/bats-42.png";
import bats43 from "./assets/effects/bats/bats-43.png";

import hold01 from "./assets/effects/hold-rune/hold-rune-01.png";
import hold02 from "./assets/effects/hold-rune/hold-rune-02.png";
import hold03 from "./assets/effects/hold-rune/hold-rune-03.png";
import hold04 from "./assets/effects/hold-rune/hold-rune-04.png";
import hold05 from "./assets/effects/hold-rune/hold-rune-05.png";
import hold06 from "./assets/effects/hold-rune/hold-rune-06.png";
import hold07 from "./assets/effects/hold-rune/hold-rune-07.png";
import hold08 from "./assets/effects/hold-rune/hold-rune-08.png";
import hold09 from "./assets/effects/hold-rune/hold-rune-09.png";
import hold10 from "./assets/effects/hold-rune/hold-rune-10.png";
import hold11 from "./assets/effects/hold-rune/hold-rune-11.png";
import hold12 from "./assets/effects/hold-rune/hold-rune-12.png";
import hold13 from "./assets/effects/hold-rune/hold-rune-13.png";
import hold14 from "./assets/effects/hold-rune/hold-rune-14.png";
import hold15 from "./assets/effects/hold-rune/hold-rune-15.png";
import hold16 from "./assets/effects/hold-rune/hold-rune-16.png";
import hold17 from "./assets/effects/hold-rune/hold-rune-17.png";
import hold18 from "./assets/effects/hold-rune/hold-rune-18.png";
import hold19 from "./assets/effects/hold-rune/hold-rune-19.png";
import hold20 from "./assets/effects/hold-rune/hold-rune-20.png";
import hold21 from "./assets/effects/hold-rune/hold-rune-21.png";
import hold22 from "./assets/effects/hold-rune/hold-rune-22.png";
import hold23 from "./assets/effects/hold-rune/hold-rune-23.png";
import hold24 from "./assets/effects/hold-rune/hold-rune-24.png";
import hold25 from "./assets/effects/hold-rune/hold-rune-25.png";
import hold26 from "./assets/effects/hold-rune/hold-rune-26.png";
import hold27 from "./assets/effects/hold-rune/hold-rune-27.png";
import hold28 from "./assets/effects/hold-rune/hold-rune-28.png";
import hold29 from "./assets/effects/hold-rune/hold-rune-29.png";
import hold30 from "./assets/effects/hold-rune/hold-rune-30.png";
import hold31 from "./assets/effects/hold-rune/hold-rune-31.png";
import hold32 from "./assets/effects/hold-rune/hold-rune-32.png";
import hold33 from "./assets/effects/hold-rune/hold-rune-33.png";
import hold34 from "./assets/effects/hold-rune/hold-rune-34.png";
import hold35 from "./assets/effects/hold-rune/hold-rune-35.png";
import hold36 from "./assets/effects/hold-rune/hold-rune-36.png";
import hold37 from "./assets/effects/hold-rune/hold-rune-37.png";
import hold38 from "./assets/effects/hold-rune/hold-rune-38.png";
import hold39 from "./assets/effects/hold-rune/hold-rune-39.png";
import hold40 from "./assets/effects/hold-rune/hold-rune-40.png";
import hold41 from "./assets/effects/hold-rune/hold-rune-41.png";
import hold42 from "./assets/effects/hold-rune/hold-rune-42.png";
import hold43 from "./assets/effects/hold-rune/hold-rune-43.png";
import hold44 from "./assets/effects/hold-rune/hold-rune-44.png";
import hold45 from "./assets/effects/hold-rune/hold-rune-45.png";
import hold46 from "./assets/effects/hold-rune/hold-rune-46.png";
import hold47 from "./assets/effects/hold-rune/hold-rune-47.png";

import shatter1 from "./assets/effects/shatter/shatter-piece-1.png";
import shatter2 from "./assets/effects/shatter/shatter-piece-2.png";
import shatter3 from "./assets/effects/shatter/shatter-piece-3.png";

/** Bats: the swarm's 43 frames, in play order. */
export const BATS_FRAMES = [
  bats01, bats02, bats03, bats04, bats05, bats06, bats07, bats08, bats09, bats10,
  bats11, bats12, bats13, bats14, bats15, bats16, bats17, bats18, bats19, bats20,
  bats21, bats22, bats23, bats24, bats25, bats26, bats27, bats28, bats29, bats30,
  bats31, bats32, bats33, bats34, bats35, bats36, bats37, bats38, bats39, bats40,
  bats41, bats42, bats43,
] as const;

/** One Bats frame's hold on the page: ~66 ms (the page's own
 *  reading — Math.floor(now / 66) over the whole sequence). */
export const BATS_FRAME_MS = 66;

/** The Bats frame a moment falls on — the wall clock's own
 *  reading, so every surface wheels in step. */
export function batsFrameAt(nowMs: number): string {
  return BATS_FRAMES[Math.floor(nowMs / BATS_FRAME_MS) % BATS_FRAMES.length];
}

/** Hold Rune: the game copy's 47 slots, in play order. */
export const HOLD_RUNE_FRAMES = [
  hold01, hold02, hold03, hold04, hold05, hold06, hold07, hold08, hold09, hold10,
  hold11, hold12, hold13, hold14, hold15, hold16, hold17, hold18, hold19, hold20,
  hold21, hold22, hold23, hold24, hold25, hold26, hold27, hold28, hold29, hold30,
  hold31, hold32, hold33, hold34, hold35, hold36, hold37, hold38, hold39, hold40,
  hold41, hold42, hold43, hold44, hold45, hold46, hold47,
] as const;

/** The game copy's own tempo: ~122 ms a slot. */
export const HOLD_RUNE_SLOT_MS = 122;
/** Slots 1–33 form and hover; the crash is slots 34–40
 *  (indexes 33–39), played again in 41–47 in the preview
 *  shape — in play it LOOPS for the whole 3 s hold. */
export const HOLD_RUNE_FORM_SLOTS = 33;
export const HOLD_RUNE_CRASH_SLOTS = 7;

/** The Hold Rune frame a working shows at a moment: the
 *  form/hover once, from its cast (`bornAt`); once the crash
 *  has struck (`struckAt` — the server's own reckoning, the
 *  hold's first moment), the crash section loops until the
 *  hold ends. Before the strike, time is read from the cast. */
export function holdRuneFrameAt(nowMs: number, bornAt: number, struckAt: number | null | undefined): string {
  if (struckAt) {
    const k = Math.floor((nowMs - struckAt) / HOLD_RUNE_SLOT_MS) % HOLD_RUNE_CRASH_SLOTS;
    return HOLD_RUNE_FRAMES[HOLD_RUNE_FORM_SLOTS + Math.max(0, k)];
  }
  const k = Math.floor((nowMs - bornAt) / HOLD_RUNE_SLOT_MS);
  return HOLD_RUNE_FRAMES[Math.min(HOLD_RUNE_FORM_SLOTS - 1, Math.max(0, k))];
}

/** Rune Shatter: the Hold Rune's glyph in its three pieces. */
export const SHATTER_PIECES = [shatter1, shatter2, shatter3] as const;
