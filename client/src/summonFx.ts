// THE SUMMON SEQUENCE — the Proving Ground's summoning
// theatre, ported whole into the live game (Nigel, 2026-10-23:
// "if you are pushing someone from proving grounds make sure
// it has all of its functions nothing changed or left out").
//
// In the Proving Ground (client/public/spell-preview.html) a
// summon — toggleMote — plays, in this order:
//   · cast(): the tender's own cast gesture is queued. In the
//     live game that gesture is tenderArt's tenderCastPose with
//     the Ground's own beats (CAST_BEATS 0/160/400/680, CAST_MS
//     950): at the Table it already fires on summon casts
//     through the server's castAt echo; on the homeland the
//     summon cast raises it directly (see Territory.castSummon).
//   · spawnSummonFx(sx, sy): 14 shards of debris — earth browns
//     #4a3b28, every third #6e5836, small rounded rects — ring
//     the ground point (radius 40 + rand·14, size 5 + rand·6)
//     and over 640 ms twist together, rise and converge into
//     the point (partyTick's shard loop: angle += t·5.2,
//     radius × (1 − t·0.86), rise 34 px with the vertical
//     squashed to 0.4, spin t·340°).
//   · The figure's RISING (partyTick, 760 ms): the mote's
//     wrapper fades in, opacity = min(1, t·1.7), while its
//     picture scales 0.55 → 1 about its feet (transform-origin
//     50% 100%) — playFigureRise below.
//   · At 640 ms (toggleMote's setTimeout): spawnFlash in the
//     member's colour (radial bloom, 12 → 132 px over 200 ms)
//     and spawnPoof (a pale ring, 2 px rgba(232,220,195,.8),
//     12 → 96 px over 340 ms).
//   · At the rise's end: floatText — "<name> answers" in the
//     member's colour at 108 px above the point, drifting up
//     34 px over 1100 ms, opacity 1 − t².
//   · The RECALL (toggleMote the other way): spawnPoof alone
//     at the figure as it leaves — playRecallPoof below.
//
// Every count, colour, duration and motion formula here is the
// Ground's own. The Ground's lengths are tuned against its
// 98 px mote picture; the live grounds draw their figures at
// other sizes, so lengths scale by the figure's own on-screen
// height (s = h / 98) — the words keep the Ground's own 13 px,
// the one measure both worlds share. The layer holds the
// Ground's #fxlayer station (position:fixed; inset:0;
// pointer-events:none) in client coordinates, and its one rAF
// loop runs only while the theatre plays — the map itself is
// never re-rendered for it (the homeland's pan must not pay
// for a 640 ms effect with a whole-SVG rebuild).

const PG_FIGURE_H = 98;
/** spawnFlash's own default when no colour is named. */
const DEFAULT_COLOR = "#ffd977";

interface Shard { el: HTMLDivElement; a: number; r: number; w: number; rise: number; t0: number; cx: number; gy: number }
interface Flash { el: HTMLDivElement; t0: number; cx: number; gy: number; big: number; dur: number; s: number }
interface Float { el: HTMLDivElement; t0: number; cx: number; y0: number; rise: number }

let layer: HTMLDivElement | null = null;
let shards: Shard[] = [];
let flashes: Flash[] = [];
let floats: Float[] = [];
let rafId = 0;

function fxLayer(): HTMLDivElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.id = "summon-fx-layer";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:85;overflow:hidden";
    document.body.appendChild(layer);
  }
  return layer;
}

function mkDiv(styles: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = styles;
  fxLayer().appendChild(d);
  return d;
}

function tick() {
  const now = performance.now();
  // shards: debris twisting together, rising and converging
  // (the Ground's own loop, word for word).
  shards = shards.filter((s) => {
    const t = (now - s.t0) / 640;
    if (t >= 1) { s.el.remove(); return false; }
    const ang = s.a + t * 5.2, rad = s.r * (1 - t * 0.86);
    s.el.style.left = (s.cx + Math.cos(ang) * rad) + "px";
    s.el.style.top = (s.gy - t * s.rise + Math.sin(ang) * rad * 0.4) + "px";
    s.el.style.width = s.el.style.height = s.w + "px";
    s.el.style.transform = "rotate(" + (t * 340) + "deg)";
    return true;
  });
  flashes = flashes.filter((f) => {
    const t = (now - f.t0) / f.dur;
    if (t >= 1) { f.el.remove(); return false; }
    const size = (12 + t * f.big) * f.s;
    f.el.style.left = f.cx + "px"; f.el.style.top = f.gy + "px";
    f.el.style.width = f.el.style.height = size + "px";
    f.el.style.opacity = String(1 - t);
    return true;
  });
  floats = floats.filter((f) => {
    const t = (now - f.t0) / 1100;
    if (t >= 1) { f.el.remove(); return false; }
    f.el.style.left = f.cx + "px"; f.el.style.top = (f.y0 - t * f.rise) + "px";
    f.el.style.opacity = String(1 - t * t);
    return true;
  });
  if (shards.length || flashes.length || floats.length) rafId = requestAnimationFrame(tick);
  else rafId = 0;
}

function ensureLoop() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

/** The Ground's spawnSummonFx: 14 shards ring the point. */
function spawnSummonFx(cx: number, gy: number, s: number) {
  for (let i = 0; i < 14; i++) {
    const el = mkDiv("position:absolute;background:" + (i % 3 ? "#4a3b28" : "#6e5836") + ";pointer-events:none;border-radius:2px");
    shards.push({ el, a: Math.random() * Math.PI * 2, r: (40 + Math.random() * 14) * s, w: (5 + Math.random() * 6) * s, rise: 34 * s, t0: performance.now(), cx, gy });
  }
  ensureLoop();
}

function spawnFlash(cx: number, gy: number, s: number, color: string) {
  const el = mkDiv("position:absolute;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;background:radial-gradient(circle,#fffbe9 0%," + color + " 45%,rgba(0,0,0,0) 70%)");
  flashes.push({ el, t0: performance.now(), cx, gy, big: 120, dur: 200, s });
  ensureLoop();
}

function spawnPoof(cx: number, gy: number, s: number) {
  const el = mkDiv("position:absolute;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;border:" + Math.max(1, 2 * s).toFixed(2) + "px solid rgba(232,220,195,.8)");
  flashes.push({ el, t0: performance.now(), cx, gy, big: 84, dur: 340, s });
  ensureLoop();
}

function floatText(cx: number, gy: number, s: number, text: string, color: string) {
  const el = mkDiv("position:absolute;transform:translate(-50%,-50%);font-size:13px;letter-spacing:.06em;pointer-events:none;color:" + color + ";text-shadow:0 1px 3px #000");
  el.textContent = text;
  floats.push({ el, t0: performance.now(), cx, y0: gy - 108 * s, rise: 34 * s });
  ensureLoop();
}

export interface SummonFxOpts {
  /** The summoned one's colour — the flash's bloom and the
   *  words' colour (the Ground colours both by the member).
   *  Absent, spawnFlash's own default gold serves. */
  color?: string | null;
  /** The summoned one's name — the rise ends on its word:
   *  "<name> answers". Absent, no words rise. */
  name?: string | null;
}

/** The whole summon sequence at a ground point (client
 *  coordinates): the shards converge over 640 ms, the flash
 *  and poof land at 640, and at the rise's end (760 ms) the
 *  name answers. figureH is the figure's on-screen height in
 *  px — every length is measured against it, as the Ground
 *  measures against its 98 px mote. */
export function playSummonFx(cx: number, groundY: number, figureH: number, opts: SummonFxOpts = {}): void {
  const s = Math.max(0.15, figureH / PG_FIGURE_H);
  const color = opts.color || DEFAULT_COLOR;
  spawnSummonFx(cx, groundY, s);
  window.setTimeout(() => { spawnFlash(cx, groundY, s, color); spawnPoof(cx, groundY, s); }, 640);
  if (opts.name) window.setTimeout(() => { floatText(cx, groundY, s, opts.name + " answers", color); }, 760);
}

/** The recall, the Ground's toggle the other way: a poof
 *  alone where the figure stood. */
export function playRecallPoof(cx: number, groundY: number, figureH: number): void {
  spawnPoof(cx, groundY, Math.max(0.15, figureH / PG_FIGURE_H));
}

/** The figure's RISING, played on the figure's own rendered
 *  node: the container fades in over 760 ms — opacity
 *  min(1, t·1.7), full by t = 1/1.7 — while the art itself
 *  scales 0.55 → 1 about its feet (50% 100%). Web Animations
 *  only: no React state turns for it, so the ground's render
 *  is never rebuilt per frame. */
export function playFigureRise(container: Element, artEls: Element[]): void {
  try {
    (container as HTMLElement).animate(
      [{ opacity: "0" }, { opacity: "1", offset: 0.588 }, { opacity: "1" }],
      { duration: 760, easing: "linear" },
    );
    for (const a of artEls) {
      const el = a as HTMLElement;
      const prevBox = el.style.getPropertyValue("transform-box");
      const prevOrigin = el.style.getPropertyValue("transform-origin");
      el.style.setProperty("transform-box", "fill-box");
      el.style.setProperty("transform-origin", "50% 100%");
      const anim = el.animate(
        [{ transform: "scale(0.55)" }, { transform: "scale(1)" }],
        { duration: 760, easing: "linear" },
      );
      anim.onfinish = () => {
        el.style.setProperty("transform-box", prevBox);
        el.style.setProperty("transform-origin", prevOrigin);
      };
    }
  } catch { /* the theatre is a courtesy — never break the ground for it */ }
}

/** The art a figure's node carries: its direct-child images
 *  and drawn groups (the pieces themselves — never its rings,
 *  names or bars). */
export function figureArtEls(node: Element): Element[] {
  return Array.from(node.children).filter((c) => c.tagName === "image" || c.tagName === "g");
}
