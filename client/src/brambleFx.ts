/**
 * THE BRAMBLE'S OWN FACE (Nigel's "Bramble 1" flipbook,
 * uploaded 2026-10-22; its field placement Ruled the same
 * day, 15:24: "the flipbook plays over standing bramble on
 * the field"; bound to the homeland map 2026-10-24).
 *
 * Thirty-two frames, 3840×2160 RGBA as his hand delivered
 * them, cropped here to their union alpha box (1420×1454)
 * and shrunk for the page at 512×524 — prepared copies only;
 * the originals stand untouched in the workshop folder.
 * Nothing is redrawn, recoloured or tinted: the green-gold
 * glow is the art's own.
 *
 * THE READING OF THE ART: the sequence is a GROWTH, not a
 * loop. Frame 1 is a near-empty ground with the first sprout;
 * the thicket climbs and thickens until, by about frame 24,
 * the full glowing mass stands; frames 25–32 are that same
 * standing mass settling, its spores drifting — the last
 * frame is not the first frame of anything, and nothing ever
 * shrinks back toward empty. So a fresh raise plays the
 * whole run once, in order, and a standing node then HOLDS
 * the final, full-grown frame. The tempo is the page's own
 * for his flipbooks (the Bats read a frame every 66 ms):
 * 32 frames at 66 ms — about two seconds of growth.
 *
 * (The Spellbook's Bramble chip keeps its Dream 11 GIF face,
 * ruled 2026-10-22 — this module serves the field only.)
 */
import bramble01 from "./assets/effects/bramble/bramble-01.png";
import bramble02 from "./assets/effects/bramble/bramble-02.png";
import bramble03 from "./assets/effects/bramble/bramble-03.png";
import bramble04 from "./assets/effects/bramble/bramble-04.png";
import bramble05 from "./assets/effects/bramble/bramble-05.png";
import bramble06 from "./assets/effects/bramble/bramble-06.png";
import bramble07 from "./assets/effects/bramble/bramble-07.png";
import bramble08 from "./assets/effects/bramble/bramble-08.png";
import bramble09 from "./assets/effects/bramble/bramble-09.png";
import bramble10 from "./assets/effects/bramble/bramble-10.png";
import bramble11 from "./assets/effects/bramble/bramble-11.png";
import bramble12 from "./assets/effects/bramble/bramble-12.png";
import bramble13 from "./assets/effects/bramble/bramble-13.png";
import bramble14 from "./assets/effects/bramble/bramble-14.png";
import bramble15 from "./assets/effects/bramble/bramble-15.png";
import bramble16 from "./assets/effects/bramble/bramble-16.png";
import bramble17 from "./assets/effects/bramble/bramble-17.png";
import bramble18 from "./assets/effects/bramble/bramble-18.png";
import bramble19 from "./assets/effects/bramble/bramble-19.png";
import bramble20 from "./assets/effects/bramble/bramble-20.png";
import bramble21 from "./assets/effects/bramble/bramble-21.png";
import bramble22 from "./assets/effects/bramble/bramble-22.png";
import bramble23 from "./assets/effects/bramble/bramble-23.png";
import bramble24 from "./assets/effects/bramble/bramble-24.png";
import bramble25 from "./assets/effects/bramble/bramble-25.png";
import bramble26 from "./assets/effects/bramble/bramble-26.png";
import bramble27 from "./assets/effects/bramble/bramble-27.png";
import bramble28 from "./assets/effects/bramble/bramble-28.png";
import bramble29 from "./assets/effects/bramble/bramble-29.png";
import bramble30 from "./assets/effects/bramble/bramble-30.png";
import bramble31 from "./assets/effects/bramble/bramble-31.png";
import bramble32 from "./assets/effects/bramble/bramble-32.png";

/** Bramble 1: the flipbook's 32 frames, in play order. */
export const BRAMBLE_FRAMES = [
  bramble01, bramble02, bramble03, bramble04, bramble05, bramble06, bramble07, bramble08,
  bramble09, bramble10, bramble11, bramble12, bramble13, bramble14, bramble15, bramble16,
  bramble17, bramble18, bramble19, bramble20, bramble21, bramble22, bramble23, bramble24,
  bramble25, bramble26, bramble27, bramble28, bramble29, bramble30, bramble31, bramble32,
] as const;

/** One frame's hold on the page: 66 ms (the Bats tempo). */
export const BRAMBLE_FRAME_MS = 66;
/** The growth run's whole life: all 32 frames, once. */
export const BRAMBLE_GROW_MS = BRAMBLE_FRAME_MS * BRAMBLE_FRAMES.length;
/** The bundled frames' shape (512×524) — height per unit width. */
export const BRAMBLE_ASPECT = 524 / 512;

/** The Bramble frame a node shows at a moment: the growth
 *  walked from the moment the map first saw the node raised
 *  (`bornAt`, the map's own clock), clamped at the last
 *  frame — a standing node holds its full-grown frame. */
export function brambleFrameAt(nowMs: number, bornAt: number): string {
  const k = Math.floor((nowMs - bornAt) / BRAMBLE_FRAME_MS);
  return BRAMBLE_FRAMES[Math.min(BRAMBLE_FRAMES.length - 1, Math.max(0, k))];
}
