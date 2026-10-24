/**
 * THE BRAMBLE'S OWN FACE (Nigel's "Bramble 1" flipbook,
 * uploaded 2026-10-22; its field placement Ruled the same
 * day, 15:24: "the flipbook plays over standing bramble on
 * the field"; bound to the homeland map 2026-10-24).
 *
 * Thirty-two frames, 3840×2160 RGBA as his hand delivered
 * them — prepared copies only; the originals stand
 * untouched in the workshop folder. Nothing is redrawn,
 * recoloured or tinted: the green-gold glow is the art's
 * own.
 *
 * THE CROP (Nigel's tap, 2026-10-24: "Crop the game's copies
 * to the thicket — the floating dots never appear"): the
 * frames as delivered carry bright spore dots floating
 * detached in the empty field above the thicket, and the
 * first binding's plain union-box crop (1420×1454, shrunk to
 * 512×524) carried them onto the map, frozen around every
 * standing node. The copies are now re-derived from the
 * originals keeping ONLY the thicket — its one connected
 * glowing mass, filaments and all (components joined through
 * faint alpha are kept whole; the three floating dots in each
 * frame, standing 700–1,090 original px clear of the mass,
 * are blanked — and with them small near-base fragments the
 * same rule caught: mostly crumbs of ≤55 px at 1–33 px gaps,
 * a 292 px detached speck at a 13 px gap in frame 8, and
 * tendril tips of ~180/204 px at 2–3 px gaps in frames 10/11
 * whose joining filaments fall below the threshold; on the
 * rendered map the thicket's bright-green signature measured
 * 378 px before the crop and 377 after, its base row
 * identical) — cropped to the mass's union bounds across
 * all frames, (1567, 1265)–(2160, 1721) = 593×456 original
 * px, and shrunk at the first binding's own scale to
 * 214×164. The seating constants below re-derive the node's
 * drawing from this crop so the thicket stands on the map at
 * exactly the size and place the first binding gave it:
 * same scale (map units per original px), its centre and
 * its base on the same map points as before.
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
/** The bundled frames' shape (214×164) — height per unit width. */
export const BRAMBLE_ASPECT = 164 / 214;
/** The drawn box's width, in tile-size units: the thicket
 *  crop is 593 of the first binding's 1420 original px wide,
 *  drawn at that binding's scale (0.95 of a tile per 1420
 *  original px) — the thicket keeps its exact on-map width. */
export const BRAMBLE_DRAW_W = 0.396725; // 0.95 × 593/1420
/** The thicket centre's standing place against the node's
 *  own point, in tile-size units: in the first binding the
 *  mass's centre (original x 1863.5, the crop's middle) sat
 *  this far left of the node's centre, the old box having
 *  reached right to catch a floating dot; the new box is
 *  centred so the mass stands there still. */
export const BRAMBLE_CENTRE_OFF = -0.068574;
/** The thicket base's standing place against the node's own
 *  point, in tile-size units: the old canvas ran 28 original
 *  px of empty field below the mass's base (the base is the
 *  crop's bottom, original y 1721; the old box ran to 1749),
 *  so the base stood at 0.1 of a tile less that field's
 *  height above the old box's bottom. The new box's bottom
 *  sits exactly where the base itself stood. */
export const BRAMBLE_BASE_OFF = 0.081277;

/** The Bramble frame a node shows at a moment: the growth
 *  walked from the moment the map first saw the node raised
 *  (`bornAt`, the map's own clock), clamped at the last
 *  frame — a standing node holds its full-grown frame. */
export function brambleFrameAt(nowMs: number, bornAt: number): string {
  const k = Math.floor((nowMs - bornAt) / BRAMBLE_FRAME_MS);
  return BRAMBLE_FRAMES[Math.min(BRAMBLE_FRAMES.length - 1, Math.max(0, k))];
}

/** WATERING's young growth (Nigel, 2026-10-24 — the Tide ×
 *  Bramble synergy, "the positive effect of wet"): a bramble
 *  MOTE — the young growth a node's fringe bears, and the
 *  growth a watering adds — is drawn from the flipbook's own
 *  young run: the first eight frames, walked at the growth's
 *  own tempo from the moment the map first saw the mote,
 *  then HELD on the eighth. A mote stands young beside its
 *  parent thicket, never the full-grown mass; only a true
 *  node wears the whole growth. */
export const BRAMBLE_MOTE_HOLD = 7; // the eighth frame (index 7)
/** A mote's drawn size against a node's: it stands at this
 *  share of the thicket's own box, seated on its own point
 *  by the same offsets, scaled. */
export const BRAMBLE_MOTE_SCALE = 0.45;
/** The Bramble frame a mote shows at a moment: the young
 *  run walked from its first sighting, held at the young
 *  standing frame. */
export function brambleMoteFrameAt(nowMs: number, bornAt: number): string {
  const k = Math.floor((nowMs - bornAt) / BRAMBLE_FRAME_MS);
  return BRAMBLE_FRAMES[Math.min(BRAMBLE_MOTE_HOLD, Math.max(0, k))];
}
