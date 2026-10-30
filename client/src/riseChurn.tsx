/** THE GRAVEL CHURN (2026-10-29) — the Stone Cast's seam
 *  dressing, ported faithfully from the rise proof Nigel
 *  approved on 2026-10-26 ("i like it in practice"; the proof
 *  stands at ~/workspace/your_files/rise-animation-proof/). One
 *  churn rides each building piece's ground line: as the piece
 *  moves — rising or settling — dark cracks spread along the
 *  ground line from its base, a broken-earth mound bulges at
 *  the seam, gravel in greys/browns/tans is thrown up and out,
 *  tumbles, bounces once at the ground line and comes to rest
 *  at the base, and soft dust drifts up with a short settling
 *  tail after the piece stops. Once the piece stands, the
 *  mound settles to a low rubble line and the cracks remain,
 *  faint — the proof's resting state. The churn sits at and
 *  below the seam and never reveals the underground part.
 *
 *  Every count, colour, rate and motion formula below is the
 *  proof's own, word for word. The proof measured in screen px
 *  against a 212 px wall base; the map measures in land units,
 *  so every length scales by u = the piece's own base length /
 *  212 — each piece churns at its own base, in step with its
 *  own movement, and several pieces rising at once each churn
 *  their own ground line. Movement is read from the piece's
 *  served fraction: the churn runs while the fraction is
 *  actually changing (a held rise, crewless, does not churn),
 *  and the loop sleeps when nothing moves. */
import { useEffect, useMemo, useRef } from "react";

const STONE = ["#8a7d68", "#6b5d4a", "#a89a82", "#554a3a", "#c0b096", "#77694e"];
const SVGNS = "http://www.w3.org/2000/svg";
/** The proof's wall base, in its own px — every length below
 *  is measured against it. */
const PROOF_BASE = 212;
/** A piece whose fraction changed within this window is
 *  moving (the served fraction steps at the land's read
 *  cadence; the window bridges the steps). */
const MOVE_WINDOW_MS = 5000;

/** A small deterministic well for a piece's cracks, so a
 *  piece's crack set is its own and never reshuffles between
 *  renders. */
function well(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CrackDef { side: number; len: number; off: number; pts: { f: number; o: number }[] }

interface StoneP {
  kind: 0; el: SVGPathElement;
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; b: number; age: number; life: number;
}
interface DustP {
  kind: 1; el: SVGCircleElement;
  x: number; y: number; vx: number; vy: number;
  r: number; grow: number; a: number; age: number; life: number;
}
type Particle = StoneP | DustP;

export interface RiseChurnProps {
  /** the piece's own key — unique on the map (wall/floor + id) */
  pieceKey: string;
  /** the crack set's seed (the piece's id) */
  seed: number;
  /** the seam's ends on the land: for a wall its edge, for a
   *  floor its footprint's southern edge — lift already in */
  ax: number; ay: number; bx: number; by: number;
  /** the piece's served rise fraction, 0..1 */
  frac: number;
  /** the piece's served state — rising / settling / standing /
   *  cemented; only a rising or settling piece can be moving */
  state: string;
}

export function RiseChurn({ pieceKey, seed, ax, ay, bx, by, frac, state }: RiseChurnProps) {
  const baseLen = Math.max(1, Math.hypot(bx - ax, by - ay));
  const u = baseLen / PROOF_BASE;
  const dirx = (bx - ax) / baseLen, diry = (by - ay) / baseLen;
  const cx = (ax + bx) / 2, cy = (ay + by) / 2;

  /** The proof's six cracks, seeded per piece: a side, a reach
   *  share, an offset along the seam from its heart, and five
   *  points of jitter. */
  const cracks = useMemo<CrackDef[]>(() => {
    const rnd = well(seed + 7);
    const out: CrackDef[] = [];
    for (let i = 0; i < 6; i++) {
      const pts: { f: number; o: number }[] = [];
      for (let j = 0; j <= 4; j++) pts.push({ f: j / 4, o: (rnd() - 0.5) * 9 });
      out.push({ side: i % 2 ? 1 : -1, len: 0.55 + rnd() * 0.65, pts, off: (i - 2.5) * 7 });
    }
    return out;
  }, [seed]);

  const crackPath = (c: CrackDef): string => {
    const ox = cx + dirx * c.off * u, oy = cy + diry * c.off * u;
    const reach = (30 + 62 * frac) * c.len * u;
    return c.pts.map((q, j) => {
      const along = c.side * reach * q.f;
      const x = ox + dirx * along;
      const y = oy + diry * along + (q.f * 7 + q.o * frac) * u;
      return `${j === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  };

  const rootRef = useRef<SVGGElement | null>(null);
  const moundRef = useRef<SVGGElement | null>(null);
  const partsRef = useRef<SVGGElement | null>(null);
  const parts = useRef<Particle[]>([]);
  const lastFrac = useRef(frac);
  const lastChangeAt = useRef(0);
  const speed = useRef(0);
  const settle = useRef(0);
  const stoneAcc = useRef(0);
  const dustAcc = useRef(0);
  const moundO = useRef(-1);
  const moundS = useRef(0.55);
  const fracRef = useRef(frac);
  const stateRef = useRef(state);
  fracRef.current = frac;
  stateRef.current = state;

  useEffect(() => {
    // A fresh served fraction: measure its speed (fraction per
    // second, the proof's own unit) and stamp the movement.
    const now = performance.now();
    if (frac !== lastFrac.current) {
      const dt = Math.max(1, now - (lastChangeAt.current || now)) / 1000;
      const inst = Math.abs(frac - lastFrac.current) / (lastChangeAt.current ? dt : 1);
      speed.current = lastChangeAt.current ? 0.65 * speed.current + 0.35 * inst : inst;
      lastFrac.current = frac;
      lastChangeAt.current = now;
    }
    const root = rootRef.current, mound = moundRef.current, partsG = partsRef.current;
    if (!root || !mound || !partsG) return;
    if (moundO.current < 0) { moundO.current = frac <= 0.01 ? 0 : 0.5; moundS.current = 0.55; }

    const seamYat = (x: number): number => {
      const dx = bx - ax;
      if (Math.abs(dx) < 0.001) return (ay + by) / 2;
      return ay + (by - ay) * ((x - ax) / dx);
    };
    const spawnStone = (boost: number) => {
      if (parts.current.length > 420) return;
      const t = Math.random();
      const x = ax + (bx - ax) * t;
      const dir = (x - cx) / (baseLen / 2 || 1);
      const shape: string[] = [];
      const s = (1.6 + Math.random() * 4.6) * u;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2, r = 0.7 + Math.random() * 0.55;
        shape.push(`${(Math.cos(a) * s * r).toFixed(2)},${(Math.sin(a) * s * r * 0.78).toFixed(2)}`);
      }
      // A stone is drawn as a PATH, never a polygon: the
      // land's own proofs count floor polygons as floors, and
      // a churn full of polygon stones would falsify the count.
      const el = document.createElementNS(SVGNS, "path");
      el.setAttribute("d", `M${shape.join(" L")} Z`);
      el.setAttribute("fill", STONE[(Math.random() * STONE.length) | 0]);
      el.setAttribute("stroke", "#2e2619");
      el.setAttribute("stroke-width", (0.7 * u).toFixed(2));
      el.setAttribute("class", "rise-stone");
      partsG.appendChild(el);
      parts.current.push({
        kind: 0, el, x, y: seamYat(x) - 2 * u,
        vx: (dir * (26 + Math.random() * 85) + (Math.random() * 30 - 15)) * u,
        vy: -(46 + Math.random() * 135) * boost * u,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() * 10 - 5),
        b: 0, age: 0, life: 1.15 + Math.random() * 0.6,
      });
    };
    const spawnDust = (big: boolean) => {
      if (parts.current.length > 420) return;
      const t = Math.random();
      const x = ax + (bx - ax) * t;
      const dir = (x - cx) / (baseLen / 2 || 1);
      const el = document.createElementNS(SVGNS, "circle");
      el.setAttribute("fill", `url(#rise-dust-${Math.random() < 0.6 ? "a" : "b"}-${pieceKey})`);
      el.setAttribute("class", "rise-dust");
      partsG.appendChild(el);
      parts.current.push({
        kind: 1, el, x, y: seamYat(x) - (3 + Math.random() * 4) * u,
        vx: (dir * (10 + Math.random() * 26) + (Math.random() * 12 - 6)) * u,
        vy: -(7 + Math.random() * 24) * u,
        r: ((big ? 8 : 5) + Math.random() * 10) * u,
        grow: (11 + Math.random() * 13) * u,
        a: 0.13 + Math.random() * 0.14, age: 0, life: 0.9 + Math.random() * 0.8,
      });
    };

    let raf = 0;
    let lastT = performance.now();
    let wasMoving = false;
    const frame = (nowMs: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastT) / 1000));
      lastT = nowMs;
      const f = fracRef.current;
      const active = stateRef.current === "rising" || stateRef.current === "settling";
      const moving = active && f > 0 && f < 1 && nowMs - lastChangeAt.current < MOVE_WINDOW_MS;
      if (wasMoving && !moving && f > 0.01) settle.current = 0.7;
      wasMoving = moving;
      if (moving) {
        const boost = 0.65 + Math.min(1.3, speed.current * 1.6);
        stoneAcc.current += dt * (30 + speed.current * 120);
        dustAcc.current += dt * (10 + speed.current * 38);
        while (stoneAcc.current >= 1) { stoneAcc.current -= 1; spawnStone(boost); }
        while (dustAcc.current >= 1) { dustAcc.current -= 1; spawnDust(false); }
      } else if (settle.current > 0) {
        settle.current -= dt;
        dustAcc.current += dt * 9;
        while (dustAcc.current >= 1) { dustAcc.current -= 1; spawnDust(true); }
      }
      let stones = 0;
      for (let i = parts.current.length - 1; i >= 0; i--) {
        const pt = parts.current[i];
        pt.age += dt;
        if (pt.age >= pt.life) { pt.el.remove(); parts.current.splice(i, 1); continue; }
        const fade = pt.age > pt.life - 0.4 ? Math.max(0, (pt.life - pt.age) / 0.4) : 1;
        if (pt.kind === 0) {
          stones++;
          pt.vy += 430 * u * dt;
          pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.rot += pt.vr * dt;
          const floor = seamYat(pt.x) + 3 * u;
          if (pt.y > floor && pt.vy > 0) {
            pt.y = floor;
            if (pt.b < 2 && Math.abs(pt.vy) > 42 * u) { pt.vy *= -0.34; pt.vx *= 0.55; pt.vr *= 0.5; pt.b++; }
            else { pt.vy = 0; pt.vx *= 0.8; pt.vr = 0; }
          }
          pt.el.setAttribute("transform", `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)}) rotate(${(pt.rot * 180 / Math.PI).toFixed(1)})`);
          pt.el.setAttribute("opacity", fade.toFixed(3));
        } else {
          pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.r += pt.grow * dt; pt.vx *= 0.995;
          const fin = Math.min(1, pt.age / 0.18);
          pt.el.setAttribute("cx", pt.x.toFixed(2));
          pt.el.setAttribute("cy", pt.y.toFixed(2));
          pt.el.setAttribute("r", pt.r.toFixed(2));
          pt.el.setAttribute("fill-opacity", (pt.a * fin * fade).toFixed(3));
        }
      }
      // The mound: bulged while the piece moves, the low rubble
      // line once it stands, nothing before it has emerged.
      const tO = f <= 0.01 ? 0 : (moving ? 0.96 : 0.5);
      const tS = moving ? 1.06 : 0.55;
      const k = Math.min(1, dt * 10);
      moundO.current += (tO - moundO.current) * k;
      moundS.current += (tS - moundS.current) * k;
      mound.setAttribute("opacity", moundO.current.toFixed(3));
      mound.setAttribute("transform", `translate(${cx.toFixed(1)} ${(cy + 13 * u).toFixed(1)}) scale(1 ${moundS.current.toFixed(3)})`);
      root.setAttribute("data-moving", moving ? "1" : "0");
      root.setAttribute("data-stones", String(stones));
      const atRest = Math.abs(moundO.current - tO) < 0.01 && Math.abs(moundS.current - tS) < 0.01;
      if (moving || settle.current > 0 || parts.current.length > 0 || !atRest) {
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { if (raf) cancelAnimationFrame(raf); };
    // The geometry and the served fraction are read live from
    // the refs inside the loop; the effect re-arms on their
    // change, which is what restarts a slept loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frac, state, ax, ay, bx, by, pieceKey, baseLen, u, cx, cy, dirx, diry]);

  const restO = frac <= 0.01 ? 0 : 0.5;
  return (
    <g ref={rootRef} className="rise-churn" data-for={pieceKey} data-moving="0" data-stones="0" pointerEvents="none">
      <defs>
        <radialGradient id={`rise-dust-a-${pieceKey}`}>
          <stop offset="0%" stopColor="rgb(168,150,118)" stopOpacity="1" />
          <stop offset="100%" stopColor="rgb(168,150,118)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`rise-dust-b-${pieceKey}`}>
          <stop offset="0%" stopColor="rgb(110,95,72)" stopOpacity="1" />
          <stop offset="100%" stopColor="rgb(110,95,72)" stopOpacity="0" />
        </radialGradient>
        {/* The mound's earth blobs wear the proof's own
            gradient falloff — solid to ~62%, gone by ~71%. */}
        {["#453a2b", "#574a36", "#413627", "#77694e", "#6a5c43"].map((c, i) => (
          <radialGradient key={c} id={`rise-mound-${i}-${pieceKey}`}>
            <stop offset="62%" stopColor={c} stopOpacity="1" />
            <stop offset="71%" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {frac > 0.02 && cracks.map((c, i) => (
        <path key={i} className="rise-crack" d={crackPath(c)} fill="none"
          stroke={`rgba(16,12,8,${(0.36 * frac).toFixed(3)})`} strokeWidth={2 * u} strokeLinecap="round" />
      ))}
      <g ref={moundRef} className="rise-mound" opacity={restO}
        transform={`translate(${cx.toFixed(1)} ${(cy + 13 * u).toFixed(1)}) scale(1 0.55)`}>
        <g transform={`scale(${u.toFixed(4)})`}>
          <ellipse cx={-85.7} cy={-5.2} rx={44} ry={15} fill={`url(#rise-mound-0-${pieceKey})`} />
          <ellipse cx={0} cy={-4.2} rx={56} ry={18} fill={`url(#rise-mound-1-${pieceKey})`} />
          <ellipse cx={85.7} cy={-5.2} rx={42} ry={14} fill={`url(#rise-mound-2-${pieceKey})`} />
          <ellipse cx={-42.8} cy={-8.3} rx={26} ry={10} fill={`url(#rise-mound-3-${pieceKey})`} />
          <ellipse cx={42.8} cy={-8.3} rx={24} ry={9} fill={`url(#rise-mound-4-${pieceKey})`} />
        </g>
      </g>
      <g ref={partsRef} className="rise-parts" />
    </g>
  );
}
