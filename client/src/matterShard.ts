// THE MATTER SHARD (Nigel's uploaded art, ruled 2026-10-24):
// the projectile of an Awoken's basic ranged attack is his
// "Matter shard" — a six-frame animated sequence (his File Post
// upload "Dream 15", frames 1–6), cropped to its content and
// bundled at 512px wide beside the other effects sets. The
// frames play in order as the shot flies, the shard's bright
// head forward (its native facing is +x; Territory turns it
// onto its road by the flight's heading, drawn from the
// map's own clock — never SMIL, which iPad Safari does not
// run; the projectile repair, 2026-10-24).
//
// THE TINT: the shot wears the hue of the FIRING Awoken's
// dominant element — the card-corner colour language, read from
// the LIVE palette (client/src/palette.ts), never baked into
// the files, so a re-theme re-hues the shots with everything
// else. The tint is a luminance ramp, not a hue rotation: the
// frame is first flattened to its own light (feColorMatrix
// saturate 0), then each channel is walked through a five-stop
// ramp — the element's deep shade, the element colour itself at
// the mid-tones, and white at the top — so the shard reads as
// matter of that element with its white-hot core still white.
// Territory renders one SVG filter per element from the ramps
// computed here. A striker with no element (neutral) flies the
// art in its own colours, untinted.
import shard1 from "./assets/effects/matter-shard/matter-shard-1.png";
import shard2 from "./assets/effects/matter-shard/matter-shard-2.png";
import shard3 from "./assets/effects/matter-shard/matter-shard-3.png";
import shard4 from "./assets/effects/matter-shard/matter-shard-4.png";
import shard5 from "./assets/effects/matter-shard/matter-shard-5.png";
import shard6 from "./assets/effects/matter-shard/matter-shard-6.png";

export const MATTER_SHARD_FRAMES: string[] = [shard1, shard2, shard3, shard4, shard5, shard6];

/** The flight's whole life: six slices of ~88 ms, then gone. */
export const SHARD_SLICE_MS = 88;
export const SHARD_FLIGHT_MS = SHARD_SLICE_MS * MATTER_SHARD_FRAMES.length;

/** THE FLIGHT'S PACE (Nigel's battle-feel rulings,
 * 2026-10-25, landed by the projectile rendering fix,
 * 2026-10-27): a shard's flight runs at HALF SPEED — the
 * six frames over twice the first measure, 1056 ms — and
 * a DARK blow flies at a THIRD SPEED, 1584 ms, so an
 * enemy's shot can be seen coming. The Table's shots take
 * the same face and the same pace (the blanket ruling,
 * 2026-10-27 19:49: the homeland's shot face and pace win),
 * so these are the only flight lengths on either ground. */
export const SHARD_FLIGHT_SLOW_MS = SHARD_FLIGHT_MS * 2;
export const SHARD_FLIGHT_DARK_MS = SHARD_FLIGHT_MS * 3;
export function shardFlightMsFor(dark: boolean): number {
  return dark ? SHARD_FLIGHT_DARK_MS : SHARD_FLIGHT_SLOW_MS;
}

/** THE SHARD'S DRAWN SIZE (the same rulings, amended by
 * the launched-shot fix, Nigel 2026-11-10): every
 * projectile stands TWICE the size it first shipped at —
 * the frame once drew 72 × 38 land units, then THREE
 * times (216 × 114) by the 2026-10-25 ruling; Nigel's
 * play found that "way too big", and it now draws
 * 144 × 76, on the homeland and at the Table alike
 * (the Table's seat scales this measure onto its own
 * hexes when it draws there). */
export const SHARD_DRAW_W = 144;
export const SHARD_DRAW_H = 76;

/** THE FRAMES' PAINTED CONTENT (measured from the bundled
 * PNGs at the launched-shot fix, 2026-11-10): each frame's
 * content bounding box in its 512 × 273 canvas, as
 * { x, y, w, h } in source pixels. The six frames are one
 * open-close cycle (1, 2, 3, 3, 2, 1 by content): the end
 * frames carry 437 px of painted width, the middle frames
 * 274–282 px, and the middle frames' paint sits high and
 * toward the head — so drawn raw, the shard stood widest
 * at its birth and at its fall and narrow between, growing
 * out of the Awoken's hand "like a large club" (Nigel,
 * 2026-11-10). The art is NOT re-cut: each surface draws
 * the frame through this box instead — the box is widened
 * (never narrowed) to the drawn measure's own aspect so
 * nothing painted is clipped, and seated in a viewport of
 * exactly the drawn size, so every frame's painted width
 * crosses the road at the same measure and its painted
 * centre rides the road's point. The widest-boxed frame
 * (the first) reads ~5% under the common measure; the rest
 * read exact. */
export const SHARD_FRAME_CONTENT: { x: number; y: number; w: number; h: number }[] = [
  { x: 26, y: 18, w: 437, h: 242 },
  { x: 204, y: 14, w: 282, h: 111 },
  { x: 189, y: 38, w: 274, h: 81 },
  { x: 189, y: 38, w: 274, h: 81 },
  { x: 204, y: 14, w: 282, h: 111 },
  { x: 26, y: 18, w: 437, h: 242 },
];

/** The viewBox a surface seats one frame's full canvas in
 * so the frame's PAINTED width fills the drawn measure:
 * the content box, widened about its own centre to the
 * drawn aspect (SHARD_DRAW_W : SHARD_DRAW_H) wherever the
 * paint is taller than that aspect allows — widening only,
 * so no painted pixel is ever clipped. */
export function shardFrameViewBox(slice: number): string {
  const c = SHARD_FRAME_CONTENT[Math.min(SHARD_FRAME_CONTENT.length - 1, Math.max(0, slice))] ?? SHARD_FRAME_CONTENT[0];
  const aspect = SHARD_DRAW_W / SHARD_DRAW_H;
  const w = Math.max(c.w, c.h * aspect);
  const h = w / aspect;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  return `${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;
}

/** THE STAGGER'S SPAN (the projectile rendering fix,
 * 2026-10-27): a settled batch's blows fly at their TRUE
 * MOMENTS — each flight starts at the moment its blow
 * stood in the batch relative to the batch's first blow,
 * never all born at the read that carried them. A batch
 * wider than this span is compressed proportionally into
 * it, so a long quiet's backlog does not take a minute to
 * re-fly; a batch narrower than the span keeps its true
 * spacing, unscaled. One law, both grounds. */
export const STRIKE_STAGGER_MAX_MS = 2600;
export function strikeStartsAt(at: number, firstAt: number, lastAt: number, now: number): number {
  const span = Math.max(0, lastAt - firstAt);
  const scale = span > STRIKE_STAGGER_MAX_MS ? STRIKE_STAGGER_MAX_MS / span : 1;
  return now + Math.max(0, at - firstAt) * scale;
}

/** The five tintable elements (the palette's own keys). */
export const SHARD_TINT_ELEMENTS = ["root", "tide", "sky", "stone", "fire"] as const;

/** The SVG filter id Territory defines for an element's tint,
 *  or null when the element carries no tint (neutral, unknown). */
export function shardTintFilterId(element: string | null | undefined): string | null {
  return element && (SHARD_TINT_ELEMENTS as readonly string[]).includes(element) ? `shard-tint-${element}` : null;
}

/** The five-stop luminance ramp for one element colour, as the
 *  per-channel tableValues strings of an feComponentTransfer:
 *  deep shade (the colour at 15% light) → the colour halved →
 *  the colour itself → the colour walked 55% toward white →
 *  white. Stops sit at luminance 0, 0.3, 0.55, 0.8, 1. */
export function shardTintRamp(hex: string): { r: string; g: string; b: string } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  const rgb = m ? [0, 1, 2].map(i => parseInt(m[1].slice(i * 2, i * 2 + 2), 16) / 255) : [0.85, 0.7, 0.4];
  const stops = [0, 0.3, 0.55, 0.8, 1].map(t => {
    if (t <= 0.55) { const k = t / 0.55; return rgb.map(c => c * (0.15 + 0.85 * k)); }
    const k = (t - 0.55) / 0.45; return rgb.map(c => c + (1 - c) * k);
  });
  const fmt = (ch: number) => stops.map(s => s[ch].toFixed(3)).join(" ");
  return { r: fmt(0), g: fmt(1), b: fmt(2) };
}
