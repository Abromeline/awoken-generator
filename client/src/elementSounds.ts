/**
 * THE ELEMENTAL ATTACK SOUNDS (Nigel, 2026-10-26: "add
 * these sounds for he elemental attacks" — his verdict on
 * the REAL recorded set, after the synthesized set was
 * struck as "computery and 8-bit sounding").
 *
 * Every elemental attack in the game now has a voice, and
 * the voice is a REAL recording of the real thing — never
 * a synthesized substitute (his standing law: real over
 * synthetic). Five elements, two moments each:
 *
 *   CAST — the attack is loosed: leaves rustling (Root),
 *          water swirling (Tide), a gust through trees
 *          (Sky), stones falling and rolling (Stone), a
 *          flare of diesel on a real fire (Fire).
 *   HIT  — the attack lands: a woody thud (Root), a
 *          splash (Tide), a thunderclap (Sky), a brick
 *          striking stone (Stone), a burst of fire
 *          crackle (Fire).
 *
 * A miss sounds no hit. An attack with no element (a
 * neutral blow, an "unaligned" working, the dark's own
 * bolts) sounds nothing at all — no neutral sound was
 * invented. The clips and their provenance stand in
 * client/src/assets/sounds/ (see CREDITS.md there; two
 * are CC BY — Bidgee's thunder and leonseptavaux's brick
 * — and are credited in the app's About section too).
 *
 * THE WIRING lives where the attacks themselves fly:
 * Territory's witnessed placement strikes and working
 * casts, the Battleground's siege projectiles, and the
 * Table's flown strikes and blade flights. This module
 * only sounds them: playElementSound(element, "cast" |
 * "hit") — the element is the attack's own, as the engine
 * already carries it (a strike's dominant element, a
 * working's page hue); anything outside the five is
 * silence, by construction.
 *
 * PLAYBACK DISCIPLINE, on the pack chime's precedent: the
 * context is lazy and every call is wrapped — a browser
 * that refuses audio can only ever SILENCE a sound, never
 * break an attack. The clips decode lazily from the first
 * play (a play that arrives before its clip is ready is
 * dropped, silently). Two guards keep a crowded battle
 * from blasting without ever silencing a real exchange:
 * the feeds deliver a round's strikes in one breath, so
 * a per-element-and-kind burst allowance lets three
 * starts sound inside 45 ms (a genuine volley) and folds
 * only the fourth and beyond; and a ceiling of six clips
 * sounding at once caps the whole field. The clips stand
 * at their approved levels (peaks ≈ 0.52 in the files);
 * the master gain below is the only dial.
 *
 * THE PROBE: window.__awokenElementSounds = { plays,
 * total, ready } — plays counts each STARTED clip by
 * "element:kind", ready names the decoded clips, kept in
 * the standing style (cf. window.__awokenPackChime), so a
 * drive can prove the triggers on real attacks.
 */
import rootCastUrl from "./assets/sounds/element-root-cast.wav";
import rootHitUrl from "./assets/sounds/element-root-hit.wav";
import tideCastUrl from "./assets/sounds/element-tide-cast.wav";
import tideHitUrl from "./assets/sounds/element-tide-hit.wav";
import skyCastUrl from "./assets/sounds/element-sky-cast.wav";
import skyHitUrl from "./assets/sounds/element-sky-hit.wav";
import stoneCastUrl from "./assets/sounds/element-stone-cast.wav";
import stoneHitUrl from "./assets/sounds/element-stone-hit.wav";
import fireCastUrl from "./assets/sounds/element-fire-cast.wav";
import fireHitUrl from "./assets/sounds/element-fire-hit.wav";

export type ElementSoundKind = "cast" | "hit";

/** The whole character in one place: the clips by
 *  element and kind, and the playback dials. */
const SOUND = {
  clips: {
    "root:cast": rootCastUrl, "root:hit": rootHitUrl,
    "tide:cast": tideCastUrl, "tide:hit": tideHitUrl,
    "sky:cast": skyCastUrl, "sky:hit": skyHitUrl,
    "stone:cast": stoneCastUrl, "stone:hit": stoneHitUrl,
    "fire:cast": fireCastUrl, "fire:hit": fireHitUrl,
  } as Record<string, string>,
  /** Master level over the clips' own approved levels. */
  gain: 0.9,
  /** Per element+kind: at most `burst` starts inside this
   *  window sound; the rest of a simultaneous pile folds. */
  retriggerMs: 45,
  burst: 3,
  /** Ceiling on clips sounding at the same instant. */
  maxVoices: 6,
} as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let loading = false;
const recentStarts = new Map<string, number[]>();
let voices = 0;
const plays: Record<string, number> = {};
let total = 0;

function publishProbe(): void {
  try {
    (window as any).__awokenElementSounds = {
      plays: { ...plays },
      total,
      ready: [...buffers.keys()],
    };
  } catch { /* the probe is a courtesy, never a failure */ }
}

function ensureContext(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = SOUND.gain;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Fetch and decode every clip, once. Begun at the first
 *  play — and primed at the player's first touch of the
 *  page (below), so by the time any battle runs the clips
 *  stand ready. A play that arrives before its clip is
 *  decoded is dropped, silently — loading can only
 *  silence. */
function loadClips(ac: AudioContext): void {
  if (loading) return;
  loading = true;
  for (const [key, url] of Object.entries(SOUND.clips)) {
    void (async () => {
      try {
        const res = await fetch(url);
        const raw = await res.arrayBuffer();
        const buf = await ac.decodeAudioData(raw);
        buffers.set(key, buf);
        publishProbe();
      } catch { /* a clip that will not decode simply never sounds */ }
    })();
  }
}

/**
 * Sound one moment of an elemental attack. `element` is
 * the attack's own element as the engine carries it — a
 * strike's dominant element, a working's hue. Anything
 * outside the five elements (neutral, unaligned, the
 * dark's element-less bolts, a missing value) is
 * silence: no sound is started and none is counted.
 */
export function playElementSound(element: string | null | undefined, kind: ElementSoundKind): void {
  try {
    if (!element) return;
    const key = `${element}:${kind}`;
    if (!(key in SOUND.clips)) return;
    const ac = ensureContext();
    if (!ac || !master) return;
    loadClips(ac);
    // A suspended context (the browser's autoplay gate)
    // silences this one play; the next gesture's play
    // resumes it. Never counted, never an error.
    if (ac.state !== "running") return;
    const buf = buffers.get(key);
    if (!buf) return;
    const now = performance.now();
    const recent = (recentStarts.get(key) ?? []).filter((t) => now - t < SOUND.retriggerMs);
    if (recent.length >= SOUND.burst) { recentStarts.set(key, recent); return; }
    if (voices >= SOUND.maxVoices) return;
    recent.push(now);
    recentStarts.set(key, recent);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    voices++;
    src.onended = () => { voices = Math.max(0, voices - 1); };
    src.start();
    plays[key] = (plays[key] ?? 0) + 1;
    total++;
    publishProbe();
  } catch { /* a sound can fail only into silence */ }
}

publishProbe();

// THE PRIMING: the game is click-driven, so the player's
// first touch of the page wakes the context and starts
// the clips decoding — by the time an attack flies, its
// voice stands ready. One touch only; the listeners
// remove themselves.
try {
  const prime = () => {
    const ac = ensureContext();
    if (ac) loadClips(ac);
    window.removeEventListener("pointerdown", prime);
    window.removeEventListener("keydown", prime);
  };
  window.addEventListener("pointerdown", prime);
  window.addEventListener("keydown", prime);
} catch { /* priming is a courtesy, never a failure */ }
