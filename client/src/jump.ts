/* ── THE JUMP (Nigel's law, 2026-10-19) ─────────────────────────
 * The Proving Ground's jump engine, ported whole into the game:
 * Space leaps, and every class keeps its own arc — the Warden's
 * low hop, the Binder's long graceful bound, the Witch's hover,
 * the Runewright's rune-double, the Sage's wild speed and her
 * third-jump backflip. The physics numbers are the Ground's own
 * (JPHYS, demo pixels against its ~115 px figure); each surface
 * scales heights to its own figure. Frames are the Ground's
 * business — the game raises the figure on this arc, shrinks its
 * ground shadow with height, and reads airborne/apex from here
 * for the traversal law: a leap is the only road over a wall, up
 * a two-tray rise, or onto a floating isle. */

export const JPHYS: Record<string, { peak: number; air: number; flat?: number; hover?: number; rise?: number }> = {
  warden:     { peak: 26, air: 410 },
  binder:     { peak: 44, air: 910, flat: 0.65 },
  witch:      { peak: 40, air: 710, hover: 350, rise: 320 },
  runewright: { peak: 40, air: 660 },
  sage:       { peak: 46, air: 460 },
};

export interface JumpState {
  t0: number; key: string; flip: boolean; dbl: boolean; t1: number; base: number; landT: number;
}

export interface JumpEngine {
  jump: JumpState | null;
  h: number;
  sageChain: number;
  sageLastStart: number;
  lastFlipStart: number;
  lastRuneAt: number;
}

export function createJumpEngine(): JumpEngine {
  return { jump: null, h: 0, sageChain: 0, sageLastStart: -1e9, lastFlipStart: -1e9, lastRuneAt: -1e9 };
}

/** Off the ground in truth: past the crouch, before the landing
 *  squash — the Ground's own line (90 ms). */
export function jumpAirborne(e: JumpEngine, now: number): boolean {
  return !!e.jump && !e.jump.landT && (now - e.jump.t0) >= 90;
}

/** High in the arc: the window in which a leap may cross onto a
 *  floating isle — three-fifths of the class's peak or better. */
export function jumpApex(e: JumpEngine, now: number): boolean {
  if (!jumpAirborne(e, now)) return false;
  const P = JPHYS[e.jump!.key] || JPHYS.warden;
  return e.h >= P.peak * 0.6;
}

export function jumpPress(e: JumpEngine, classKey: string, now: number): void {
  if (e.jump && !e.jump.landT) {
    if (classKey === "runewright" && e.jump.key === "runewright" && !e.jump.dbl && jumpAirborne(e, now)) {
      e.jump.dbl = true; e.jump.t1 = now; e.jump.base = e.h; e.lastRuneAt = now;
    }
    return;
  }
  let flip = false;
  if (classKey === "sage") {
    if (now - e.sageLastStart > 1200) e.sageChain = 0;
    e.sageChain++; e.sageLastStart = now;
    if (e.sageChain === 3) { flip = true; e.sageChain = 0; e.lastFlipStart = now; }
  }
  e.jump = { t0: now, key: classKey, flip, dbl: false, t1: 0, base: 0, landT: 0 };
}

function arcOf(key: string, P: { peak: number; air: number; flat?: number; hover?: number; rise?: number }, ae: number): { h: number; u: number; done: boolean } {
  if (key === "witch") {
    const rise = P.rise!, sink = P.air - P.rise!, tot = P.air + (P.hover ?? 0);
    if (ae >= tot) return { h: 0, u: 1, done: true };
    if (ae < rise) { const q = ae / rise; return { h: P.peak * Math.sin(Math.PI / 2 * q), u: 0.5 * q, done: false }; }
    if (ae < rise + (P.hover ?? 0)) return { h: P.peak, u: 0.5, done: false };
    const q = (ae - rise - (P.hover ?? 0)) / sink;
    return { h: P.peak * Math.pow(Math.cos(Math.PI / 2 * q), 0.85), u: 0.5 + 0.5 * q, done: false };
  }
  const tau = ae / P.air;
  if (tau >= 1) return { h: 0, u: 1, done: true };
  return { h: P.peak * Math.pow(Math.sin(Math.PI * tau), P.flat || 1), u: tau, done: false };
}

export interface JumpPoseInfo {
  /** Height above the ground, in the Ground's demo pixels. */
  h: number;
  /** 0..1 through the arc while the Sage backflips, else null. */
  flipU: number | null;
  airborne: boolean;
  active: boolean;
}

/** Advance the engine to `now` and read the pose — the Ground's
 *  jumpPose, minus its frames. Landing holds a 120 ms squash,
 *  then the leap is done. */
export function jumpPoseInfo(e: JumpEngine, now: number): JumpPoseInfo {
  const j = e.jump;
  if (!j) { e.h = 0; return { h: 0, flipU: null, airborne: false, active: false }; }
  const P = JPHYS[j.key] || JPHYS.warden;
  if (j.landT) {
    if (now - j.landT > 120) { e.jump = null; e.h = 0; return { h: 0, flipU: null, airborne: false, active: false }; }
    e.h = 0;
    return { h: 0, flipU: j.flip ? 1 : null, airborne: false, active: true };
  }
  const el = now - j.t0;
  if (!j.dbl && el < 90) { e.h = 0; return { h: 0, flipU: j.flip ? 0 : null, airborne: false, active: true }; }
  if (j.flip) {
    const tau = (el - 90) / P.air;
    if (tau >= 1) { j.landT = now; e.h = 0; return { h: 0, flipU: 1, airborne: false, active: true }; }
    e.h = P.peak * Math.sin(Math.PI * tau);
    return { h: e.h, flipU: tau, airborne: true, active: true };
  }
  if (j.dbl) {
    const tau2 = (now - j.t1) / P.air;
    if (tau2 >= 1) { j.landT = now; e.h = 0; return { h: 0, flipU: null, airborne: false, active: true }; }
    e.h = j.base * (1 - tau2) + P.peak * Math.sin(Math.PI * tau2);
    return { h: e.h, flipU: null, airborne: true, active: true };
  }
  const A = arcOf(j.key, P, el - 90);
  if (A.done) { j.landT = now; e.h = 0; return { h: 0, flipU: null, airborne: false, active: true }; }
  e.h = A.h;
  return { h: A.h, flipU: null, airborne: el >= 90, active: true };
}

/** The third-jump backflip happened within the last breath —
 *  the Ground's flipped() hook, for proofs. */
export function jumpFlipped(e: JumpEngine, now: number): boolean {
  if (e.jump && e.jump.flip) return true;
  return e.lastFlipStart > 0 && (now - e.lastFlipStart) < 1500;
}

/** The Runewright's mid-air rune was struck within the last
 *  breath — the double jump's visible trace, for proofs. */
export function jumpRuned(e: JumpEngine, now: number): boolean {
  return e.lastRuneAt > 0 && (now - e.lastRuneAt) < 1500;
}
