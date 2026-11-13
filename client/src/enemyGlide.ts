/* ── THE SMOOTH GLIDE — ENEMY INTERPOLATION (Nigel's fix
 * run, last rung — rung 1, 2026-11-11) ─────────────────────
 * The server's truth was already smooth: the realtime war
 * gear settles every 500 ms and the dark walks in continuous
 * fractional axial space (enemySecPerHex ≈ 3–7.5 s per hex),
 * served to the map as floats. But the homeland FACE drew
 * each enemy at its LATEST served point only — so between
 * reads an enemy stood frozen, then teleported at the next
 * read: steps, not motion. Awokin never suffered this (their
 * marches and patrols interpolate on the map's clock from
 * their road and hour); the dark simply had no road to read.
 *
 * This module is that road. For every wanderer the map keeps
 * its last two served points and the wall moments those
 * points were ARRIVED at (the moment each snapshot landed on
 * the client — the serves carry no clock of their own, so
 * arrival is the only honest tongue; reads land on a steady
 * cadence, so arrival spacing tracks serve spacing). The
 * drawn point glides from the previous served point to the
 * latest over exactly the interval between the two arrivals:
 *
 *   drawn(t) = prev + (latest − prev) · clamp01((t − t1)/(t1 − t0))
 *
 * THE CLAMPS (the whole law of the thing):
 *  · NEVER EXTRAPOLATE: the fraction clamps at 1 — if a read
 *    is late, the enemy WAITS at the latest served point; it
 *    never drifts past where the server last placed it.
 *  · NEVER REWIND: the fraction clamps at 0 — before the
 *    latest arrival's moment, the enemy stands at the
 *    previous point (in practice t ≥ t1 always; the clamp is
 *    the guarantee, not the habit).
 *  · TELEPORTS SNAP: a jump larger than ENEMY_GLIDE_SNAP_HEXES
 *    (a respawn, a dissipation return, a settle correction —
 *    anything no walk could have walked inside one read
 *    interval) is drawn at the new point at once, never
 *    glided across the map. The bound is 1.5 hexes: the
 *    fastest dark (a dry Fray, ≈3 s/hex) crosses ≈0.17 hexes
 *    in a 500 ms battle read and ≈0.93 in a 2.8 s quiet read,
 *    so 1.5 sits clear of every true walk and under every
 *    true teleport (which land whole hexes or maps away).
 *  · FIRST SIGHT IS A PLACE, NOT A JOURNEY: an enemy the map
 *    has never seen stands at its served point — no glide
 *    in from nowhere.
 *  · A POINT THAT DID NOT MOVE starts no glide: the record
 *    simply holds (the stationary enemy's stillness is what
 *    proves the clamping to the drive).
 *
 * The store is a plain mutable Map held in a ref by the map:
 * tracking is bookkeeping beside the render, not state — a
 * new snapshot folds into it during apply, and the render
 * reads the glide for the frame's moment. Nothing here
 * rounds: positions stay fractional end to end, in the same
 * axial tongue the server serves. */

export type GlidePoint = { q: number; r: number };

export type EnemyGlideTrack = {
  /** The previous served point, and the wall moment the
   *  snapshot carrying it arrived. */
  prev: GlidePoint;
  prevAt: number;
  /** The latest served point, and its arrival moment. The
   *  glide runs prev → latest over [prevAt, latestAt]. */
  latest: GlidePoint;
  latestAt: number;
};

export type EnemyGlideStore = Map<number, EnemyGlideTrack>;

/** The snap bound, in axial hexes: a served jump larger
 *  than this is a teleport, drawn at once. See the header
 *  for the arithmetic that seats it. */
export const ENEMY_GLIDE_SNAP_HEXES = 1.5;

const axialDist = (a: GlidePoint, b: GlidePoint): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

export function createEnemyGlideStore(): EnemyGlideStore {
  return new Map();
}

/** Fold one freshly arrived snapshot into the store. `at`
 *  is the wall moment the snapshot landed (Date.now() at
 *  apply). Enemies absent from the snapshot are forgotten —
 *  a fell or a departure leaves no ghost track behind. */
export function foldEnemyGlide(
  store: EnemyGlideStore,
  served: readonly { id: number; posQ: number; posR: number }[],
  at: number,
): void {
  const seen = new Set<number>();
  for (const w of served) {
    seen.add(w.id);
    const point = { q: Number(w.posQ), r: Number(w.posR) };
    const track = store.get(w.id);
    if (!track) {
      // First sight: stands at its point, both ends the same.
      store.set(w.id, { prev: point, prevAt: at, latest: point, latestAt: at });
      continue;
    }
    if (point.q === track.latest.q && point.r === track.latest.r) {
      // Unmoved: the record holds. (Refreshing latestAt here
      // would stretch a LATER glide's interval with stillness
      // that was never travel — the interval must stay the
      // two arrivals that actually bracket the motion.)
      continue;
    }
    if (axialDist(track.latest, point) > ENEMY_GLIDE_SNAP_HEXES) {
      // A teleport: the new point is simply where it stands.
      track.prev = point; track.prevAt = at;
      track.latest = point; track.latestAt = at;
      continue;
    }
    track.prev = track.latest; track.prevAt = track.latestAt;
    track.latest = point; track.latestAt = at;
  }
  for (const id of [...store.keys()]) {
    if (!seen.has(id)) store.delete(id);
  }
}

/** The point an enemy is DRAWN at, at wall moment `now`.
 *  Pure: the same inputs always draw the same point, which
 *  is what lets the drive prove the glide from the math
 *  alone when it must. Falls back to the served point for
 *  an enemy with no track (a first frame before the fold). */
export function enemyGlidePoint(
  store: EnemyGlideStore,
  id: number,
  served: { posQ: number; posR: number },
  now: number,
): GlidePoint {
  const track = store.get(id);
  if (!track) return { q: served.posQ, r: served.posR };
  const span = track.latestAt - track.prevAt;
  if (span <= 0) return track.latest;
  const k = Math.min(1, Math.max(0, (now - track.latestAt) / span));
  if (k <= 0) return track.prev;
  if (k >= 1) return track.latest;
  return {
    q: track.prev.q + (track.latest.q - track.prev.q) * k,
    r: track.prev.r + (track.latest.r - track.prev.r) * k,
  };
}

/** Is any tracked enemy mid-glide at `now` — its drawn
 *  point still short of its latest served point? This is
 *  the rAF gate's question: motion is live exactly while
 *  some glide is unfinished (or a fresh track's interval
 *  has not yet run out). */
export function enemyGlideLive(store: EnemyGlideStore, now: number): boolean {
  for (const track of store.values()) {
    if (track.prev.q === track.latest.q && track.prev.r === track.latest.r) continue;
    if (now - track.latestAt < track.latestAt - track.prevAt) return true;
  }
  return false;
}
