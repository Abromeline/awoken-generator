/**
 * THE GRASS'S OWN FACE — Nigel's three grass Dreams (Procreate
 * Dreams sequences "Dream 2", "Dream 4", "Dream 6", uploaded
 * 2026-11-10): 181 frames, 3840×2160 RGBA as his hand delivered
 * them. Prepared copies only — each frame cropped to its own
 * sequence's union ink box across all its frames and shrunk at
 * ONE scale for all three sequences (256 copy px per Dream 2's
 * 1513 original px), so the three tufts keep the sizes his hand
 * gave them relative to one another: Dream 2 the wide lush tuft,
 * Dream 4 the small round one, Dream 6 the tall thin one. The
 * originals stand untouched in the workshop folder. Nothing is
 * redrawn, recoloured or tinted — the green-gold glow is the
 * art's own, as the bramble's was.
 *
 * THE CYCLE (Nigel, 2026-11-10 — the Grass passive): the sprig
 * animations cycle the three Dreams sequences WITHOUT repeats
 * until all three have shown, then the cycle may begin again.
 * The dealing is a bag, not a shuffle per run: a tile's runs are
 * dealt from a bag holding each sequence once (the bag's order
 * hashed from the tile and the bag's number, so every viewer of
 * the same tile at the same hour sees the same deal — the
 * homeland and the Room are one map), and a fresh bag is dealt
 * only when the old one is empty. Within a run the sequence's
 * own frames play in order at the flipbook tempo; tufts of one
 * stand are staggered through the frames so they never sway in
 * lockstep.
 *
 * A run lasts GRASS_RUN_MS — the longest sequence's whole play
 * (61 frames at 100 ms); the 59-frame Dream 6 holds its last
 * frame for the run's tail. The reckoning is pure — a function
 * of the tile and the clock alone, like the bramble mote's
 * frame off its served age — so no state is kept and no two
 * viewers can disagree.
 */
import dream201 from "./assets/effects/grass/dream2-01.png";
import dream202 from "./assets/effects/grass/dream2-02.png";
import dream203 from "./assets/effects/grass/dream2-03.png";
import dream204 from "./assets/effects/grass/dream2-04.png";
import dream205 from "./assets/effects/grass/dream2-05.png";
import dream206 from "./assets/effects/grass/dream2-06.png";
import dream207 from "./assets/effects/grass/dream2-07.png";
import dream208 from "./assets/effects/grass/dream2-08.png";
import dream209 from "./assets/effects/grass/dream2-09.png";
import dream210 from "./assets/effects/grass/dream2-10.png";
import dream211 from "./assets/effects/grass/dream2-11.png";
import dream212 from "./assets/effects/grass/dream2-12.png";
import dream213 from "./assets/effects/grass/dream2-13.png";
import dream214 from "./assets/effects/grass/dream2-14.png";
import dream215 from "./assets/effects/grass/dream2-15.png";
import dream216 from "./assets/effects/grass/dream2-16.png";
import dream217 from "./assets/effects/grass/dream2-17.png";
import dream218 from "./assets/effects/grass/dream2-18.png";
import dream219 from "./assets/effects/grass/dream2-19.png";
import dream220 from "./assets/effects/grass/dream2-20.png";
import dream221 from "./assets/effects/grass/dream2-21.png";
import dream222 from "./assets/effects/grass/dream2-22.png";
import dream223 from "./assets/effects/grass/dream2-23.png";
import dream224 from "./assets/effects/grass/dream2-24.png";
import dream225 from "./assets/effects/grass/dream2-25.png";
import dream226 from "./assets/effects/grass/dream2-26.png";
import dream227 from "./assets/effects/grass/dream2-27.png";
import dream228 from "./assets/effects/grass/dream2-28.png";
import dream229 from "./assets/effects/grass/dream2-29.png";
import dream230 from "./assets/effects/grass/dream2-30.png";
import dream231 from "./assets/effects/grass/dream2-31.png";
import dream232 from "./assets/effects/grass/dream2-32.png";
import dream233 from "./assets/effects/grass/dream2-33.png";
import dream234 from "./assets/effects/grass/dream2-34.png";
import dream235 from "./assets/effects/grass/dream2-35.png";
import dream236 from "./assets/effects/grass/dream2-36.png";
import dream237 from "./assets/effects/grass/dream2-37.png";
import dream238 from "./assets/effects/grass/dream2-38.png";
import dream239 from "./assets/effects/grass/dream2-39.png";
import dream240 from "./assets/effects/grass/dream2-40.png";
import dream241 from "./assets/effects/grass/dream2-41.png";
import dream242 from "./assets/effects/grass/dream2-42.png";
import dream243 from "./assets/effects/grass/dream2-43.png";
import dream244 from "./assets/effects/grass/dream2-44.png";
import dream245 from "./assets/effects/grass/dream2-45.png";
import dream246 from "./assets/effects/grass/dream2-46.png";
import dream247 from "./assets/effects/grass/dream2-47.png";
import dream248 from "./assets/effects/grass/dream2-48.png";
import dream249 from "./assets/effects/grass/dream2-49.png";
import dream250 from "./assets/effects/grass/dream2-50.png";
import dream251 from "./assets/effects/grass/dream2-51.png";
import dream252 from "./assets/effects/grass/dream2-52.png";
import dream253 from "./assets/effects/grass/dream2-53.png";
import dream254 from "./assets/effects/grass/dream2-54.png";
import dream255 from "./assets/effects/grass/dream2-55.png";
import dream256 from "./assets/effects/grass/dream2-56.png";
import dream257 from "./assets/effects/grass/dream2-57.png";
import dream258 from "./assets/effects/grass/dream2-58.png";
import dream259 from "./assets/effects/grass/dream2-59.png";
import dream260 from "./assets/effects/grass/dream2-60.png";
import dream261 from "./assets/effects/grass/dream2-61.png";
import dream401 from "./assets/effects/grass/dream4-01.png";
import dream402 from "./assets/effects/grass/dream4-02.png";
import dream403 from "./assets/effects/grass/dream4-03.png";
import dream404 from "./assets/effects/grass/dream4-04.png";
import dream405 from "./assets/effects/grass/dream4-05.png";
import dream406 from "./assets/effects/grass/dream4-06.png";
import dream407 from "./assets/effects/grass/dream4-07.png";
import dream408 from "./assets/effects/grass/dream4-08.png";
import dream409 from "./assets/effects/grass/dream4-09.png";
import dream410 from "./assets/effects/grass/dream4-10.png";
import dream411 from "./assets/effects/grass/dream4-11.png";
import dream412 from "./assets/effects/grass/dream4-12.png";
import dream413 from "./assets/effects/grass/dream4-13.png";
import dream414 from "./assets/effects/grass/dream4-14.png";
import dream415 from "./assets/effects/grass/dream4-15.png";
import dream416 from "./assets/effects/grass/dream4-16.png";
import dream417 from "./assets/effects/grass/dream4-17.png";
import dream418 from "./assets/effects/grass/dream4-18.png";
import dream419 from "./assets/effects/grass/dream4-19.png";
import dream420 from "./assets/effects/grass/dream4-20.png";
import dream421 from "./assets/effects/grass/dream4-21.png";
import dream422 from "./assets/effects/grass/dream4-22.png";
import dream423 from "./assets/effects/grass/dream4-23.png";
import dream424 from "./assets/effects/grass/dream4-24.png";
import dream425 from "./assets/effects/grass/dream4-25.png";
import dream426 from "./assets/effects/grass/dream4-26.png";
import dream427 from "./assets/effects/grass/dream4-27.png";
import dream428 from "./assets/effects/grass/dream4-28.png";
import dream429 from "./assets/effects/grass/dream4-29.png";
import dream430 from "./assets/effects/grass/dream4-30.png";
import dream431 from "./assets/effects/grass/dream4-31.png";
import dream432 from "./assets/effects/grass/dream4-32.png";
import dream433 from "./assets/effects/grass/dream4-33.png";
import dream434 from "./assets/effects/grass/dream4-34.png";
import dream435 from "./assets/effects/grass/dream4-35.png";
import dream436 from "./assets/effects/grass/dream4-36.png";
import dream437 from "./assets/effects/grass/dream4-37.png";
import dream438 from "./assets/effects/grass/dream4-38.png";
import dream439 from "./assets/effects/grass/dream4-39.png";
import dream440 from "./assets/effects/grass/dream4-40.png";
import dream441 from "./assets/effects/grass/dream4-41.png";
import dream442 from "./assets/effects/grass/dream4-42.png";
import dream443 from "./assets/effects/grass/dream4-43.png";
import dream444 from "./assets/effects/grass/dream4-44.png";
import dream445 from "./assets/effects/grass/dream4-45.png";
import dream446 from "./assets/effects/grass/dream4-46.png";
import dream447 from "./assets/effects/grass/dream4-47.png";
import dream448 from "./assets/effects/grass/dream4-48.png";
import dream449 from "./assets/effects/grass/dream4-49.png";
import dream450 from "./assets/effects/grass/dream4-50.png";
import dream451 from "./assets/effects/grass/dream4-51.png";
import dream452 from "./assets/effects/grass/dream4-52.png";
import dream453 from "./assets/effects/grass/dream4-53.png";
import dream454 from "./assets/effects/grass/dream4-54.png";
import dream455 from "./assets/effects/grass/dream4-55.png";
import dream456 from "./assets/effects/grass/dream4-56.png";
import dream457 from "./assets/effects/grass/dream4-57.png";
import dream458 from "./assets/effects/grass/dream4-58.png";
import dream459 from "./assets/effects/grass/dream4-59.png";
import dream460 from "./assets/effects/grass/dream4-60.png";
import dream461 from "./assets/effects/grass/dream4-61.png";
import dream601 from "./assets/effects/grass/dream6-01.png";
import dream602 from "./assets/effects/grass/dream6-02.png";
import dream603 from "./assets/effects/grass/dream6-03.png";
import dream604 from "./assets/effects/grass/dream6-04.png";
import dream605 from "./assets/effects/grass/dream6-05.png";
import dream606 from "./assets/effects/grass/dream6-06.png";
import dream607 from "./assets/effects/grass/dream6-07.png";
import dream608 from "./assets/effects/grass/dream6-08.png";
import dream609 from "./assets/effects/grass/dream6-09.png";
import dream610 from "./assets/effects/grass/dream6-10.png";
import dream611 from "./assets/effects/grass/dream6-11.png";
import dream612 from "./assets/effects/grass/dream6-12.png";
import dream613 from "./assets/effects/grass/dream6-13.png";
import dream614 from "./assets/effects/grass/dream6-14.png";
import dream615 from "./assets/effects/grass/dream6-15.png";
import dream616 from "./assets/effects/grass/dream6-16.png";
import dream617 from "./assets/effects/grass/dream6-17.png";
import dream618 from "./assets/effects/grass/dream6-18.png";
import dream619 from "./assets/effects/grass/dream6-19.png";
import dream620 from "./assets/effects/grass/dream6-20.png";
import dream621 from "./assets/effects/grass/dream6-21.png";
import dream622 from "./assets/effects/grass/dream6-22.png";
import dream623 from "./assets/effects/grass/dream6-23.png";
import dream624 from "./assets/effects/grass/dream6-24.png";
import dream625 from "./assets/effects/grass/dream6-25.png";
import dream626 from "./assets/effects/grass/dream6-26.png";
import dream627 from "./assets/effects/grass/dream6-27.png";
import dream628 from "./assets/effects/grass/dream6-28.png";
import dream629 from "./assets/effects/grass/dream6-29.png";
import dream630 from "./assets/effects/grass/dream6-30.png";
import dream631 from "./assets/effects/grass/dream6-31.png";
import dream632 from "./assets/effects/grass/dream6-32.png";
import dream633 from "./assets/effects/grass/dream6-33.png";
import dream634 from "./assets/effects/grass/dream6-34.png";
import dream635 from "./assets/effects/grass/dream6-35.png";
import dream636 from "./assets/effects/grass/dream6-36.png";
import dream637 from "./assets/effects/grass/dream6-37.png";
import dream638 from "./assets/effects/grass/dream6-38.png";
import dream639 from "./assets/effects/grass/dream6-39.png";
import dream640 from "./assets/effects/grass/dream6-40.png";
import dream641 from "./assets/effects/grass/dream6-41.png";
import dream642 from "./assets/effects/grass/dream6-42.png";
import dream643 from "./assets/effects/grass/dream6-43.png";
import dream644 from "./assets/effects/grass/dream6-44.png";
import dream645 from "./assets/effects/grass/dream6-45.png";
import dream646 from "./assets/effects/grass/dream6-46.png";
import dream647 from "./assets/effects/grass/dream6-47.png";
import dream648 from "./assets/effects/grass/dream6-48.png";
import dream649 from "./assets/effects/grass/dream6-49.png";
import dream650 from "./assets/effects/grass/dream6-50.png";
import dream651 from "./assets/effects/grass/dream6-51.png";
import dream652 from "./assets/effects/grass/dream6-52.png";
import dream653 from "./assets/effects/grass/dream6-53.png";
import dream654 from "./assets/effects/grass/dream6-54.png";
import dream655 from "./assets/effects/grass/dream6-55.png";
import dream656 from "./assets/effects/grass/dream6-56.png";
import dream657 from "./assets/effects/grass/dream6-57.png";
import dream658 from "./assets/effects/grass/dream6-58.png";
import dream659 from "./assets/effects/grass/dream6-59.png";

/** Dream 2: the wide tuft — 61 frames. */
export const DREAM2_FRAMES = [
  dream201, dream202, dream203, dream204, dream205, dream206, dream207, dream208,
  dream209, dream210, dream211, dream212, dream213, dream214, dream215, dream216,
  dream217, dream218, dream219, dream220, dream221, dream222, dream223, dream224,
  dream225, dream226, dream227, dream228, dream229, dream230, dream231, dream232,
  dream233, dream234, dream235, dream236, dream237, dream238, dream239, dream240,
  dream241, dream242, dream243, dream244, dream245, dream246, dream247, dream248,
  dream249, dream250, dream251, dream252, dream253, dream254, dream255, dream256,
  dream257, dream258, dream259, dream260, dream261,
] as const;

/** Dream 4: the small round tuft — 61 frames. */
export const DREAM4_FRAMES = [
  dream401, dream402, dream403, dream404, dream405, dream406, dream407, dream408,
  dream409, dream410, dream411, dream412, dream413, dream414, dream415, dream416,
  dream417, dream418, dream419, dream420, dream421, dream422, dream423, dream424,
  dream425, dream426, dream427, dream428, dream429, dream430, dream431, dream432,
  dream433, dream434, dream435, dream436, dream437, dream438, dream439, dream440,
  dream441, dream442, dream443, dream444, dream445, dream446, dream447, dream448,
  dream449, dream450, dream451, dream452, dream453, dream454, dream455, dream456,
  dream457, dream458, dream459, dream460, dream461,
] as const;

/** Dream 6: the tall thin tuft — 59 frames. */
export const DREAM6_FRAMES = [
  dream601, dream602, dream603, dream604, dream605, dream606, dream607, dream608,
  dream609, dream610, dream611, dream612, dream613, dream614, dream615, dream616,
  dream617, dream618, dream619, dream620, dream621, dream622, dream623, dream624,
  dream625, dream626, dream627, dream628, dream629, dream630, dream631, dream632,
  dream633, dream634, dream635, dream636, dream637, dream638, dream639, dream640,
  dream641, dream642, dream643, dream644, dream645, dream646, dream647, dream648,
  dream649, dream650, dream651, dream652, dream653, dream654, dream655, dream656,
  dream657, dream658, dream659,
] as const;

/** One frame's hold on the page: 100 ms. */
export const GRASS_FRAME_MS = 100;
/** One run's length: the longest sequence played whole. */
export const GRASS_RUN_MS = 61 * GRASS_FRAME_MS;

export interface GrassSeq {
  /** The sequence's frames, in play order. */
  frames: readonly string[];
  /** Draw width relative to Dream 2's — one scale for all three. */
  wRel: number;
  /** The bundled frames' shape — height per unit width. */
  hPerW: number;
}

/** THE THREE DREAMS, in the registry's dealing order. */
export const GRASS_SEQS: readonly GrassSeq[] = [
  { frames: DREAM2_FRAMES, wRel: 1, hPerW: 133 / 256 },
  { frames: DREAM4_FRAMES, wRel: 619 / 1513, hPerW: 85 / 105 },
  { frames: DREAM6_FRAMES, wRel: 381 / 1513, hPerW: 119 / 64 },
] as const;

/** Dream 2's draw width, in hex sizes — the one seating scale
 *  every sequence's own wRel is measured against. */
export const GRASS_DRAW_W = 1.15;

/** A small deterministic hash — the dealing and the seating
 *  read it, so the same tile at the same hour deals and stands
 *  the same on every screen. */
function grassHash(a: number, b: number): number {
  let h = (a * 2654435761) ^ (b * 40503) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The bag for one tile and one bag number: each of the three
 *  sequences exactly once, in a hashed order (Fisher–Yates on
 *  the tile's own seed). */
export function grassBag(tileId: number, bagNo: number): readonly number[] {
  const bag = [0, 1, 2];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(grassHash(tileId * 3 + bagNo, i * 7919) * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** Which sequence a tile's grass is showing at an hour: runs
 *  are dealt from the tile's bag in order, three runs to a bag,
 *  so no sequence repeats until all three have shown. */
export function grassSeqAt(nowMs: number, tileId: number): number {
  const run = Math.floor(nowMs / GRASS_RUN_MS);
  const bag = grassBag(tileId, Math.floor(run / 3));
  return bag[run % 3];
}

/** One tuft's frame at an hour: the run's sequence, its frames
 *  in order, this tuft staggered seven frames ahead of the last
 *  so a stand never sways in lockstep. */
export function grassFrameAt(nowMs: number, tileId: number, tuftIndex: number): { seq: number; src: string; frame: number } {
  const seq = grassSeqAt(nowMs, tileId);
  const frames = GRASS_SEQS[seq].frames;
  const within = Math.floor((nowMs % GRASS_RUN_MS) / GRASS_FRAME_MS);
  const frame = (within + tuftIndex * 7) % frames.length;
  return { seq, src: frames[frame], frame };
}

/** One tuft's seat on its tile, as fractions of the hex size:
 *  a hashed scatter around the tile's heart, the tuft's base on
 *  the ground line, its scale jittered by the same hash. */
export function grassTuftSeat(tileId: number, tuftIndex: number): { dx: number; dy: number; scale: number } {
  return {
    dx: (grassHash(tileId, 101 + tuftIndex) - 0.5) * 0.6,
    dy: 0.02 + grassHash(tileId, 211 + tuftIndex) * 0.2,
    scale: 0.85 + grassHash(tileId, 307 + tuftIndex) * 0.3,
  };
}
