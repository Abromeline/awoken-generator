// THE MATTER SHARD (Nigel's uploaded art, ruled 2026-10-24):
// the projectile of an Awoken's basic ranged attack is his
// "Matter shard" — a six-frame animated sequence (his File Post
// upload "Dream 15", frames 1–6), cropped to its content and
// bundled at 512px wide beside the other effects sets. The
// frames play in order as the shot flies, the shard's bright
// head forward (its native facing is +x; the flight's
// animateMotion rotate="auto" turns it onto its road).
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
