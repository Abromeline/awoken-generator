// THE BRICK (Nigel's painted art, ruled 2026-10-27;
// amended 2026-11-10): the raised brick an Awoken with two
// Rock or more lifts above itself, looses at an enemy's
// ground, and answers with in battle — drawn from his three
// brick paintings (the PSD arrivals in ~/workspace/
// brick-arrival/, each cut from its true painted layer,
// CMYK walked to RGB for the web copy, the originals never
// flattened or resaved). The three stand as variants: a
// hovering stand and a flight wear them in turn, by the
// brick's own index, so a volley does not fly in lockstep.
// The art is worn as painted — its pale wash and all; no
// tint is laid over it, because a brick is stone matter,
// not an element's hue.
import brick1 from "./assets/effects/brick/brick-1.png";
import brick2 from "./assets/effects/brick/brick-2.png";
import brick3 from "./assets/effects/brick/brick-3.png";

/** The three brick paintings, with each cut's own measure —
 *  a flight or a hover seats its brick by the variant's true
 *  aspect, so no painting is ever stretched. */
export const BRICK_FRAMES: readonly { src: string; w: number; h: number }[] = [
  { src: brick1, w: 760, h: 574 },
  { src: brick2, w: 708, h: 760 },
  { src: brick3, w: 760, h: 665 },
];

/** The variant a brick wears, by its index within its
 *  stand or its volley — steady per index, so a stand does
 *  not reshuffle its faces between reads. */
export function brickFrame(index: number): { src: string; w: number; h: number } {
  const n = BRICK_FRAMES.length;
  return BRICK_FRAMES[((index % n) + n) % n];
}
