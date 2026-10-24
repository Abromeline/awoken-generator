/* ── THE JUMP + THE QUICKNESS LADDER (Nigel's law, 2026-10-19;
 * the ladder ruled 2026-10-22, ported whole from the Proving
 * Ground in Recovery R14, 2026-10-23) ────────────────────────
 * Space leaps, and every class keeps its own arc — the Warden's
 * low hop, the Binder's long flat bound, the Witch's hover, the
 * Runewright's rune-double, the Sage's wild speed and her
 * third-jump backflip. This module is the game's ONE reckoning
 * of the ladder, read by every surface that moves a Tender
 * figure (the homeland stride, the Table's leap); the server's
 * Table glide reads the mirrored readers in server/src/skills.ts
 * (quicknessStepFor / quicknessSpeedFor), and the R14 drive
 * proves the two reckonings agree number for number.
 *
 * THE LADDER (Nigel, 2026-10-22 04:22; jump gap doubled 11:55,
 * speed gap doubled 11:56, air time untouched by either):
 * WARDEN +0 < RUNEWRIGHT +1 < BINDER +2 < WITCH +3 < SAGE +4,
 * one ordering on all three measures —
 *   run speed  165 / 195 / 225 / 255 / 285 px/s (base 165, +30)
 *   jump peak   26 /  38 /  50 /  62 /  74 px   (base 26, +12)
 *   air time   420 / 500 / 580 / 660 / 740 ms  (base 420, +80)
 * The numbers are the Proving Ground's own, in its demo pixels
 * (its figure stands ~117 px); each surface scales them to the
 * body it raises and the pace its ground already keeps — the
 * homeland's figure at 62/117 of the arc and its stride at its
 * standing 57.5 px/s Warden pace, the Table's figure at 58/117
 * and its glide at its standing 30 px/s Warden pace — so the
 * Warden rung is exactly the pace each ground already had, and
 * every step above it is the ladder's own ratio. A classless
 * figure — an unbound Table seat, a class not yet chosen —
 * takes the base rung: QUICK reads an unknown key as +0, the
 * same Warden fallback the engine and the Table have always
 * kept (JPHYS.warden, `?? "warden"`).
 *
 * Jump distance is the air measure lived: a figure running at
 * its ladder speed for its ladder air travels the ladder's
 * ordering — with one trait shaping it: the Witch's hover
 * drifts at QUARTER speed, so her distance stays under the
 * Sage's despite her longer air. */

export const QUICK: Record<string, number> = {
  warden: 0, runewright: 1, binder: 2, witch: 3, sage: 4,
};

/** The ladder step of a class key; a classless or unknown key
 *  stands on the base rung (+0, the Warden's). */
export function quicknessStep(classKey: string | null | undefined): number {
  return classKey ? (QUICK[classKey] ?? 0) : 0;
}

/** The ladder's run speed for a class, in the Ground's demo
 *  px/s: 165 + 30 a step. */
export function ladderSpeedOf(classKey: string | null | undefined): number {
  return 165 + 30 * quicknessStep(classKey);
}

/** A surface's own standing Warden pace, raised by the ladder:
 *  the surface keeps its pace law at the base rung and gains
 *  exactly the ladder's ratio above it. */
export function ladderSpeedAt(basePxPerSec: number, classKey: string | null | undefined): number {
  return basePxPerSec * (ladderSpeedOf(classKey) / 165);
}

export const JPHYS: Record<string, { peak: number; air: number; flat?: number; rise?: number }> = {
  warden:     { peak: 26, air: 420 },
  runewright: { peak: 38, air: 500 },
  binder:     { peak: 50, air: 580, flat: 0.65 },
  witch:      { peak: 62, air: 660, rise: 300 },
  sage:       { peak: 74, air: 740 },
};

/** The whole ladder as one table — the proof hooks' reading. */
export function ladderTable(): Record<string, { step: number; speed: number; peak: number; air: number }> {
  const t: Record<string, { step: number; speed: number; peak: number; air: number }> = {};
  for (const k of Object.keys(QUICK)) {
    t[k] = { step: QUICK[k], speed: ladderSpeedOf(k), peak: JPHYS[k].peak, air: JPHYS[k].air };
  }
  return t;
}

export interface JumpState {
  t0: number; key: string; flip: boolean; dbl: boolean; t1: number; base: number; landT: number;
  /** The Witch's hover: the air-time (ae) at which the plateau
   *  ends and the sink begins; null while the hover still holds. */
  hoverEnd: number | null;
  /** The hover's purse clock: the first charge is taken as the
   *  hover begins, the next every 3000 ms of hovering. */
  hoverBegan: boolean; hoverMs: number; hoverLast: number;
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

/** AIRBORNE = NO CURSE (Nigel, 2026-10-22 12:16): off the
 *  ground — in a jump, or in the Witch's hover — curse
 *  attrition does not touch her. The Ground's curseExempt()
 *  hook, the same state under the same name. */
export function jumpCurseExempt(e: JumpEngine, now: number): boolean {
  return jumpAirborne(e, now);
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
  // A press while the landing squash still holds starts the
  // next leap at once — the Ground's own shape, and the Sage's
  // instant re-jump: her chain (below) is counted from these
  // starts, 1200 ms apart at most, every third a backflip.
  let flip = false;
  if (classKey === "sage") {
    if (now - e.sageLastStart > 1200) e.sageChain = 0;
    e.sageChain++; e.sageLastStart = now;
    if (e.sageChain === 3) { flip = true; e.sageChain = 0; e.lastFlipStart = now; }
  }
  e.jump = { t0: now, key: classKey, flip, dbl: false, t1: 0, base: 0, landT: 0, hoverEnd: null, hoverBegan: false, hoverMs: 0, hoverLast: 0 };
}

/** THE WITCH'S HOVER (Nigel, 2026-10-22 12:16; the rate
 *  corrected the same day, 12:42): she rises 300 ms, then the
 *  hover is SUSTAINED from the purse while Space is held — one
 *  charge as the hover begins, the next every 3 SECONDS of
 *  hovering; release, or an empty purse, ends it and the sink
 *  begins. The Ground's tick, kept whole: `spaceHeld` is the
 *  surface's held Space; `trySpend` is the surface's purse
 *  answering for 1 energy (true = the charge was paid). */
export function jumpHoverTick(e: JumpEngine, now: number, spaceHeld: boolean, trySpend: () => boolean): void {
  const j = e.jump;
  if (!j || j.key !== "witch" || j.landT || j.dbl || j.hoverEnd != null) return;
  const P = JPHYS.witch;
  const ae = now - j.t0 - 90;
  if (ae < (P.rise ?? 300)) return;
  if (!spaceHeld) { j.hoverEnd = ae; return; }
  if (!j.hoverBegan) {
    j.hoverBegan = true; j.hoverMs = 0; j.hoverLast = now;
    if (!trySpend()) j.hoverEnd = ae;
    return;
  }
  j.hoverMs += now - j.hoverLast;
  j.hoverLast = now;
  if (j.hoverMs >= 3000) {
    j.hoverMs -= 3000;
    if (!trySpend()) j.hoverEnd = ae;
  }
}

/** End the Witch's hover from outside the tick — the purse's
 *  late refusal (the server's word arriving after the local
 *  mirror had already answered) sets her down the same way an
 *  empty purse does: the sink begins where she hangs. */
export function jumpEndHover(e: JumpEngine, now: number): void {
  const j = e.jump;
  if (!j || j.key !== "witch" || j.landT || j.dbl || j.hoverEnd != null) return;
  const ae = now - j.t0 - 90;
  if (ae >= (JPHYS.witch.rise ?? 300)) j.hoverEnd = ae;
}

/** The hover plateau itself: risen, not yet sinking — the
 *  state in which her glide drifts at quarter speed (the
 *  Ground's own SPEED factor reads this same condition). */
export function jumpHovering(e: JumpEngine, now: number): boolean {
  const j = e.jump;
  return !!j && j.key === "witch" && !j.landT && !j.dbl && j.hoverEnd == null
    && (now - j.t0 - 90) >= (JPHYS.witch.rise ?? 300);
}

function arcOf(key: string, P: { peak: number; air: number; flat?: number; rise?: number }, ae: number, hoverEnd: number | null): { h: number; u: number; done: boolean } {
  if (key === "witch") {
    // The Ground's arc: rise over `rise`, hold the peak while
    // the hover lasts (hoverEnd, set by the hover tick — an
    // unended hover holds indefinitely), then sink over the
    // air the rise did not spend (air − rise).
    const rise = P.rise!, sink = P.air - P.rise!, end = hoverEnd != null ? hoverEnd : Infinity;
    if (ae >= end + sink) return { h: 0, u: 1, done: true };
    if (ae < rise) { const q = ae / rise; return { h: P.peak * Math.sin(Math.PI / 2 * q), u: 0.5 * q, done: false }; }
    if (ae < end) return { h: P.peak, u: 0.5, done: false };
    const q = (ae - end) / sink;
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
  const A = arcOf(j.key, P, el - 90, j.hoverEnd);
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
