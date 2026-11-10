// THE FLIGHT LAW (Nigel, 2026-11-07): "i want an arch added
// to the elemental attacks of the awoken and the speed of
// the projectiles flight should relate to the speed of the
// awoken that fires it. rock projectiles being slow moving
// heavy hitters. the size of the projectile should also be
// proportional to awokin lvl." Ruled option A (flight time
// tied to the firer's own march pace; size grows with the
// firer's level; stone slowest and heaviest-looking) and
// reach C (all grounds, campaign included).
//
// One law, read by every surface that flies an Awoken's
// shot — the homeland map (Territory), the Table (which also
// seats the campaign), and the battle view (Battleground).
// Enemy and dark flights are NOT this law's: they keep
// their ruled paces untouched, everywhere.
//
// THE PACE: a shot's flight time is the surface's standing
// anchor — the flight a neutral-pace firer has always flown
// there — scaled by the firer's own march pace against the
// neutral gait (3.0 s/hex, the MARCH SPEED LAW's middle
// road: sky 1.6 · fire 2.2 · tide 2.6 · root 3.2 · stone
// 4.5). The pace a surface hands in already carries the
// firer's level weighting (the march law's √growth), as the
// march reckonings on each ground compute it. A Sky Awoken's
// shot crosses briskly; a Stone Awoken's lumbers — slowest
// by construction, her gait being the game's slowest — and
// the band below keeps no shot instant and none frozen:
//   flightMs = clamp(anchorMs × pace / 3.0, 450, 2400).
// On the homeland the anchor is the placement shard's ruled
// half speed, 1056 ms (matterShard.ts): sky ≈ 563 ms, tide
// ≈ 915, stone ≈ 1584 — a stone shot flies exactly as long
// as a dark blow always has, and reads heaviest for it.
// In the battle view the anchor is its own FLIGHT_MS, 500.
//
// THE SIZE: a shot stands at its surface's standing size at
// level 1 and grows by the game's own figure growth — the
// ×1.0848077-per-level step the map draws its Awoken by
// (Territory's lvlScale; ×1.1875 nine-step total spread over
// the road to the level-20 cap) — softened by the square
// root, the same tempering the march law puts on the same
// growth ("speed divides by the square root of its
// growth"), so the shot grows WITH her figure without
// outgrowing it: Lv5 ≈ 1.18×, Lv10 ≈ 1.44×, and the cap
// binds from Lv11 — the cap stood at 2× (binding from
// Lv19, raw Lv15 ≈ 1.77×) until the launched-shot fix
// (Nigel, 2026-11-10: the shots are "way too big" — lower
// the max growth per level); at 1.5× the raw growth's
// ~2.17× at Lv20 never arrives.
//
// THE GROWTH ALONG THE ROAD (Nigel, 2026-11-10, correcting
// the launched-shot fix the same day): the size above is
// the shot's FULL size — and full size is met only at the
// arc's zenith. "i'm ok with the shot starting small and
// growing to its full size at the zenith — i just wanted
// to add that it should point in the direction of flight
// while doing so." The morning's fix had struck ALL change
// of size along the flight (the frames' breathing and the
// battle view's apex swell together); that overshot. What
// stands now is a ruled growth of its own: the shot leaves
// the firer's hand at HALF its full size and grows along a
// smoothstep on the climb — the fraction of the road to
// the zenith (2s on the way up, 2(1−s) on the way down,
// eased t²(3−2t)) — so the growth is a continuous function
// of the road, easing out of the hand, settling into full
// size exactly where the arc's rise above its chord tops
// out (s = ½), and never past it: full size is the ceiling.
// The descent mirrors the climb (Nigel named the growth to
// the zenith only; the mirror is the Keeper's reading,
// carried in the build report). The growth multiplies the
// level growth above — a shape laid on the flight, never a
// second size law — and like the rest of this law it rides
// Awoken shots only: dark and enemy flights keep their
// standing size, untouched.
//
// THE ARC: every Awoken shot flies the battle view's own
// parabola (Battleground's ProjectileFlight, 2026-10-18):
// with s the fraction of the flight elapsed and peak the
// arc's height above the straight chord, the drawn point is
//   x = dx·s,  y = dy·s − 4·peak·s·(1−s),
// a body under constant gravity — and the sprite's heading
// is the same curve's tangent, atan2(dy/ds, dx/ds), nosing
// up on the climb and diving onto the mark. On the flat
// grounds (the homeland's isometric map, the Table) the
// chord is the straight road between the standing points
// and the arc is a screen-space rise-and-fall laid over it.
// A direct shot's peak stands at max(40, dist × 0.18) in
// the surface's own units — it stood at max(26, dist ×
// 0.12) until the launched-shot fix (Nigel, 2026-11-10:
// shots should "arc with the path it's following"; at the
// old measure a one-to-two-hex shot peaked at the floor
// and read as a slide that fell, not a launch); a lobbed
// shot (the battle view's arc class) keeps max(90, dist ×
// 0.35).

/** The neutral gait of the MARCH SPEED LAW (s/hex) — the
 *  pace every anchor stands for. */
export const NEUTRAL_PACE_S_PER_HEX = 3.0;

/** The flight band: no Awoken shot is instant, none frozen. */
export const FLIGHT_MIN_MS = 450;
export const FLIGHT_MAX_MS = 2400;

/** The flight's life for a shot loosed by a firer whose own
 *  march pace is `paceSecondsPerHex`, on a surface whose
 *  standing (neutral-pace) flight is `anchorMs`. */
export function flightMsForPace(anchorMs: number, paceSecondsPerHex: number): number {
  const pace = paceSecondsPerHex > 0 ? paceSecondsPerHex : NEUTRAL_PACE_S_PER_HEX;
  return Math.round(Math.min(FLIGHT_MAX_MS, Math.max(FLIGHT_MIN_MS, anchorMs * pace / NEUTRAL_PACE_S_PER_HEX)));
}

/** A shot's drawn scale at its firer's level: 1 at level 1,
 *  growing by the square root of the game's own per-level
 *  figure growth (×1.0848077 a level), capped at 1.5× (the
 *  cap stood at 2× until the launched-shot fix, 2026-11-10:
 *  Nigel — shots are "way too big", lower the max growth). */
export function sizeScaleForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level) || 1);
  return Math.min(1.5, Math.sqrt(Math.pow(1.0848077, lv - 1)));
}

/** THE GROWTH TO THE ZENITH (Nigel, 2026-11-10): a shot
 *  leaves its firer's hand at this fraction of its full
 *  size and grows to the whole of it at the arc's zenith.
 *  One half — small enough that the birth reads clearly
 *  small against the full size at the top, never a sliver. */
export const SHOT_GROWTH_START = 0.5;

/** The growth multiplier at the fraction s of a shot's
 *  flight: SHOT_GROWTH_START at the hand, exactly 1 at the
 *  zenith (s = ½, where the arc's rise above its chord
 *  peaks), mirrored on the descent, and never above 1 —
 *  full size is the ceiling. A smoothstep on the climb
 *  fraction (2s up, 2(1−s) down, eased t²(3−2t)): the
 *  growth's rate eases to nothing at the hand, at the
 *  zenith and at the mark, so the size never steps — it is
 *  a continuous function of the road, laid over the frames'
 *  seated content (which holds each frame's painted width
 *  to the one measure) and multiplied by the level growth:
 *  drawn size = standing size × sizeScaleForLevel × this. */
export function shotGrowthScale(s: number): number {
  const t = Math.min(1, Math.max(0, s));
  const climb = t <= 0.5 ? t * 2 : (1 - t) * 2;
  const eased = climb * climb * (3 - 2 * climb);
  return SHOT_GROWTH_START + (1 - SHOT_GROWTH_START) * eased;
}

/** The arc's shape for one shot: given the chord (dx, dy in
 *  the surface's own units) and the fraction s of the flight
 *  elapsed, the point on the parabola and its heading. The
 *  peak is the direct-shot measure (max(40, dist × 0.18))
 *  by default; pass `lobbed` for the high-arc class. */
export function arcPoint(dx: number, dy: number, s: number, lobbed = false): { x: number; y: number; headingDeg: number } {
  const dist = Math.hypot(dx, dy);
  const peak = lobbed ? Math.max(90, dist * 0.35) : Math.max(40, dist * 0.18);
  const x = dx * s;
  const y = dy * s - 4 * peak * s * (1 - s);
  const vx = dx;
  const vy = dy - 4 * peak * (1 - 2 * s);
  return { x, y, headingDeg: Math.atan2(vy, vx) * 180 / Math.PI };
}
