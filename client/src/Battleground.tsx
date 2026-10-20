// Battleground: interactive wave defense overlay.
// Option A: client plays the battle, server validates the result.
import { useState, useEffect, useRef, type CSSProperties } from "react";
import { elementForPiece, type Element } from "./App";
import FieldAwoken from "./FieldAwoken";
import { api, type Awakened } from "./api";
import { elementPalette } from "./palette";
import { PROJECTILE_GIF, BEAM_GIF } from "./effects";
type FieldAsset = { sourceId: string; name: string; imageUrl: string; category: string };
import { trackPlayer, type TrackData } from "./trackPlayer";
import battlegroundBg from "./assets/battleground-bg.jpg";

// Fallback tracks served by the server (not bundled by Vite)
const BATTLE_TRACKS = [
  { name: "Goliath", url: "/music/goliath.mp3" },
  { name: "Balefire", url: "/music/balefire.mp3" },
  { name: "Song of the Forge", url: "/music/song-of-the-forge.mp3" },
  { name: "Sentinel", url: "/music/sentinel.mp3" },
  { name: "Uprising", url: "/music/uprising.mp3" },
  { name: "Into the Wilds", url: "/music/into-the-wilds.mp3" },
  { name: "Legacy", url: "/music/legacy.mp3" },
  { name: "Born of the Sky", url: "/music/born-of-the-sky.mp3" },
  { name: "Vanguard", url: "/music/vanguard.mp3" },
  { name: "Phoenix", url: "/music/phoenix.mp3" },
];
import { useEnemyArt, enemyImgFor } from "./enemyArt";

interface Defender {
  placementId: number;
  awoken: Awakened;
  stance?: string; // field stance, locked in battle
  tileId?: number; // for building effects (thorn wall)
}

interface WaveInfo {
  waveNumber: number;
  frayCount: number;
  unravelers: number;
  hollows?: number;
  tangles?: number;
  totalPower: number;
  isBoss?: boolean;
  bossLevel?: number;
}

interface BattlegroundProps {
  defenders: Defender[];  // Field Awoken on the bastion
  thornWallTiles?: number[]; // tile IDs with active thorn walls
  watchtowerTiles?: number[]; // tile IDs with active watchtowers (first-strike)
  towerAuraTiles?: number[]; // tiles with +2 power from adjacent watchtowers
  towerDamage?: number; // watchtower volley damage (from UI Workspace)
  thornDamage?: number; // thorn wall damage (from UI Workspace)
  towerPowerBonus?: number; // watchtower power aura (from UI Workspace)
  enemyConfig?: Record<string, { power: number; hp: number }>;
  wave: WaveInfo;
  hand: Awakened[];  // For reinforcements
  assets: FieldAsset[];
  energy: number;
  maxEnergy: number;
  onBattleEnd: (result: { victory: boolean; survivors: number[]; continueWave?: boolean; bonusTileId?: number; wallState?: { edgeKey: string; hp: number }[]; runesTriggered?: string[]; grimState?: { id: number; hp?: number; stops?: number; charges?: number; spent?: boolean }[]; grimEnergy?: number }) => void;
  onClose: () => void;
  bonusTiles?: { id: number; q: number; r: number }[];
  onVictoryDetected?: (survivors: number[], wallState?: { edgeKey: string; hp: number }[], runesTriggered?: string[], grim?: { grimState: { id: number; hp?: number; stops?: number; charges?: number; spent?: boolean }[]; grimEnergy: number }) => Promise<void>;
  // Hex walls standing on the defenders' tiles (War-Ground, 2026-10-15):
  // tileId → the walls on that tile's edges. Enemy strikes against a
  // fighter land on its tile's walls first; the walls' remaining HP is
  // reported back at resolution and persisted by the server.
  wallsByTile?: Record<number, { edgeKey: string; hp: number; kind?: string }[]>;
  // Edge works, continued (War-Ground, Nigel 2026-10-15): runes laid
  // on the defenders' tiles spring on the first enemy who closes on
  // them (one-shot — the sprung edges are reported at resolution and
  // consumed by the server); thorns on a tile's edges slow its
  // attackers, costing each its next strike.
  runesByTile?: Record<number, { edgeKey: string; runeKind: "snare" | "harm" | "meld"; level: number }[]>;
  edgeThornTiles?: number[];
  // The Written Light standing on this battle's ground (the
  // Grimoire, Nigel 2026-10-17): the Tender's map castings whose
  // hexes and edges this battle touches, with the lookups the
  // referee needs precomputed by the Territory (which knows the
  // map's geometry): floor runes by tile, ward ids touching each
  // tile, each ward's two tiles, the Standard/Beacon aura ledgers
  // by tile, the poured form names, and the purified tiles a
  // Coil may throw the dark to. Their engines run in
  // applyEnemyStrike / applyStrike by the book's numbers; the
  // battle mirror is reported back in the battle's result.
  grimWorkings?: import("./api").MapWorking[];
  grimRunesByTile?: Record<number, import("./api").MapWorking>;
  grimWardsByTile?: Record<number, number[]>;
  grimWardTiles?: Record<number, [number, number]>;
  grimStdTiles?: Record<number, number>;
  grimBcnTiles?: Record<number, number>;
  grimCoilTiles?: number[];
  grimNames?: Record<number, string>;
  // The server's rolled aspect grant for a boss victory (resolved at
  // detection, before this screen opens) — null when no grant waits.
  aspectGrant?: string[] | null;
  // The live world mood, kept current by the Territory's sky watch —
  // when the sky turns mid-battle, Weather's teeth turn with it.
  mood?: string | null;
}

interface Fighter {
  id: string;
  awokenId?: number;
  img?: string;  // For enemies
  x: number; y: number; w: number;
  power: number; tough: number; hp: number; maxHp: number;
  basePower?: number; // enemies: their unsurged power (storm scaling restores to this)
  name: string;
  side: "aw" | "en";
  field: boolean;  // True if field defender, false if reinforcement
  awoken?: Awakened;  // For FieldAwoken rendering
  tileId?: number;  // For building effects (thorn wall)
  stance?: string;  // The defender's stance — the binding mend reads it
}

/** A visible projectile flying across the battlefield. */
interface Projectile {
  id: string;
  fx: number; fy: number;  // start (px, relative to .battle-field)
  tx: number; ty: number;  // target (px)
  glyph: string; color: string;
  img?: string;            // dreamed sprite (effects.ts) — rendered instead of the glyph when set
  arc?: boolean;           // lobbed shots fly a high arc; every shot obeys gravity
  duration: number;        // ms of flight
}

/** One projectile in flight, driven frame-by-frame with true
 *  projectile maths (Nigel, 2026-10-18: gravity on the arc, and the
 *  sprite turned to its direction of travel so it reads as aimed).
 *  The shot is a parabola pinned to its endpoints: with s the
 *  fraction of the flight elapsed and peak the arc's height above
 *  the straight chord, position is
 *      x = dx·s,  y = dy·s − 4·peak·s·(1−s)
 *  which is exactly a body under constant gravity g with
 *  peak = g·T²/8 — horizontal velocity constant, vertical velocity
 *  growing linearly. The sprite's rotation is the tangent of that
 *  same curve, atan2(dy/ds, dx/ds): noses up on the climb, levels
 *  at the apex, and dives onto the target at the end of the fall.
 *  The sprites are authored nose-right, so rotation 0 is travel
 *  along +x. Flight timing/impact stay with spawnProjectile's
 *  duration timer; this component only draws. */
function ProjectileFlight({ p }: { p: Projectile }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const dx = p.tx - p.fx;
    const dy = p.ty - p.fy;
    const dist = Math.hypot(dx, dy);
    // A lobbed shot climbs high; a direct shot still rises and falls
    // a little under gravity rather than sliding along a ruler.
    const peak = p.arc ? Math.max(90, dist * 0.35) : Math.max(26, dist * 0.12);
    const step = (now: number) => {
      const s = Math.min(1, (now - t0) / p.duration);
      const x = dx * s;
      const y = dy * s - 4 * peak * s * (1 - s);
      const vx = dx;                        // constant, as gravity demands
      const vy = dy - 4 * peak * (1 - 2 * s); // the tangent's fall
      const el = wrapRef.current;
      if (el) {
        const swell = 0.9 + 0.2 * Math.sin(Math.PI * s); // swells near the apex, as the CSS flight did
        el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y}px) scale(${swell})`;
      }
      const spin = spinRef.current;
      if (spin) spin.style.transform = `rotate(${Math.atan2(vy, vx)}rad)`;
      if (s < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [p]);
  return (
    <div ref={wrapRef} className="projectile" style={{ left: p.fx, top: p.fy, color: p.color }}>
      {p.img
        ? <img ref={(el) => { spinRef.current = el; }} className="proj-img" src={p.img} alt="" />
        : <span ref={(el) => { spinRef.current = el; }} className="proj-glyph">{p.glyph}</span>}
    </div>
  );
}

/** Element-flavored attack visuals for Awoken strikes. Projectile colors
 *  read the ONE canonical palette (./palette) at spawn time — this map
 *  keeps only the glyphs. */
const ELEMENT_SHOT_GLYPH: Record<string, string> = {
  tide: "\u{1F4A7}",
  sky: "\u{1F300}",
  stone: "\u{1FAA8}",
  root: "\u{1F33F}",
  fire: "\u{1F525}",
};
const ENEMY_SHOT = { glyph: "\u25C9", color: "#8a3a8a" };

/** Dominant element of an Awoken for its projectile flavor. */
function dominantElementOf(aw?: Awakened): Element {
  const counts: Record<Element, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
  for (const layer of aw?.layers ?? []) {
    const el = elementForPiece(layer.name, (layer as any).element);
    if (el !== "neutral") counts[el] = (counts[el] ?? 0) + 1;
  }
  let best: Element = "root";
  let max = -1;
  for (const k of ["tide", "sky", "stone", "root", "fire"] as Element[]) {
    if (counts[k] > max) { max = counts[k]; best = k; }
  }
  return best;
}

/** Victory aspect rewards: the grant a verified boss victory recorded
 *  server-side (5 + 2 per boss level, split rolled by the server at the
 *  moment of victory). This component only displays the server's roll
 *  and claims it — exactly once, through claimAspectGrant. Until the
 *  War-Ground fix (2026-10-15) it rolled the split in the client and
 *  minted the points through an ungated endpoint, on every victory
 *  screen, as often as the screen was shown. */
function VictoryAspects({ grant }: { grant: string[] | null }) {
  const [claimed, setClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const aspects = (grant ?? []).map(element => ({ element }));

  const glyphs: Record<string, React.ReactElement> = {
    tide: (
      <svg viewBox="0 0 60 24" width="40" height="16">
        <path d="M2,12 Q10,4 18,12 T34,12 T50,12" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M50,12 L60,12" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
      </svg>
    ),
    sky: (
      <svg viewBox="0 0 60 24" width="40" height="16">
        <path d="M28,12 m-8,0 a8,8 0 1,1 8,8 a6,6 0 1,0 -6,-6 a4,4 0 1,1 4,4" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M36,12 L60,12" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
      </svg>
    ),
    stone: (
      <svg viewBox="0 0 60 24" width="40" height="16">
        <path d="M6,18 L18,4 L26,12" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M26,12 L60,12" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
      </svg>
    ),
    root: (
      <svg viewBox="0 0 60 24" width="40" height="16">
        <path d="M10,18 Q10,6 22,6 Q34,6 34,14" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M34,14 L60,14" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
      </svg>
    ),
  };

  const claim = async () => {
    // One call: the server consumes the recorded grant and pays its
    // elements exactly once. A second claim finds no grant waiting.
    try {
      await api.claimAspectGrant();
      setClaimed(true);
      setClaimError(null);
    } catch (e) {
      setClaimError((e as Error).message || "The grant could not be claimed.");
    }
  };

  if (!aspects.length) return null;
  return (
    <div className="victory-aspects">
      <h3>Aspect Rewards</h3>
      <div className="aspect-reward-list">
        {aspects.map((a, i) => (
          <div key={i} className="aspect-reward">
            {glyphs[a.element]}
            <span>+1 {a.element}</span>
          </div>
        ))}
      </div>
      {!claimed && (
        <button className="abtn small" onClick={claim}>Claim Aspects</button>
      )}
      {claimError && <p className="quiet" style={{ color: "#ff8888" }}>{claimError}</p>}
      {claimed && <p className="quiet">✓ Aspects claimed</p>}
    </div>
  );
}

export default function Battleground({ defenders, thornWallTiles = [], watchtowerTiles = [], towerAuraTiles = [], towerDamage = 3, thornDamage = 1, towerPowerBonus = 2, enemyConfig, wave, hand, assets, energy, maxEnergy, onBattleEnd, onClose, bonusTiles = [], onVictoryDetected, aspectGrant = null, mood = null, wallsByTile = {}, runesByTile = {}, edgeThornTiles = [], grimWorkings = [], grimRunesByTile = {}, grimWardsByTile = {}, grimWardTiles = {}, grimStdTiles = {}, grimBcnTiles = {}, grimCoilTiles = [], grimNames = {} }: BattlegroundProps) {
  // The creator's live enemy art (UI Workspace uploads/selection).
  const { data: enemyArtData } = useEnemyArt();
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [enemies, setEnemies] = useState<Fighter[]>([]);
  // Hex walls (War-Ground, 2026-10-15): live HP per wall edge during
  // the battle. Enemy strikes against a fighter whose tile still has
  // a standing wall land on the wall instead — the wall blocks the
  // crossing. Remaining HP is reported at resolution.
  const [wallHp, setWallHpState] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const list of Object.values(wallsByTile)) for (const w of list) init[w.edgeKey] = w.hp;
    return init;
  });
  const wallHpRef = useRef(wallHp);
  const setWallHp = (updater: (prev: Record<string, number>) => Record<string, number>) => {
    wallHpRef.current = updater(wallHpRef.current);
    setWallHpState(wallHpRef.current);
  };
  const currentWallState = (): { edgeKey: string; hp: number }[] =>
    Object.entries(wallHpRef.current).map(([edgeKey, hp]) => ({ edgeKey, hp }));
  // Edge-work traps (War-Ground, Nigel 2026-10-15): skip tokens are
  // strikes an enemy owes to thorns or a snare; sprung runes are
  // one-shot and reported at resolution for the server to consume.
  const skipStrikesRef = useRef<Map<string, number>>(new Map());
  const runesFiredRef = useRef<Set<string>>(new Set());
  const runesTriggeredRef = useRef<string[]>([]);
  const currentRunesTriggered = (): string[] => [...runesTriggeredRef.current];
  const wallShieldFor = (tileId?: number): number => {
    if (tileId == null) return 0;
    return (wallsByTile[tileId] ?? []).reduce((sum, w) => sum + (wallHpRef.current[w.edgeKey] ?? 0), 0);
  };
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState("The Unraveling comes...");
  const [logHistory, setLogHistory] = useState<string[]>(["The Unraveling comes..."]);
  const addLog = (msg: string) => {
    setLog(msg);
    setLogHistory(prev => [...prev.slice(-49), msg]);
  };
  const [battleTrack, setBattleTrack] = useState<{ name: string; url: string } | null>(null);
  const battleAudio = useRef<HTMLAudioElement | null>(null);

  // ---- Siege presentation: refs, timeout tracking, projectile helpers ----
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fighterRefs = useRef(new Map<string, HTMLDivElement>());
  const towerRefs = useRef(new Map<number, HTMLDivElement>());
  const fieldRef = useRef<HTMLDivElement>(null);
  // The Written Light's battle mirror (the Grimoire): live state
  // per standing, seeded from the castings; yields bank as the
  // Engines sing per exchange (doAttack). Reported at the end.
  const grimRef = useRef<Map<number, { hp: number; stops: number; charges: number; spent: boolean; maxHp: number; pour: number }>>(
    new Map(grimWorkings.map((w) => [w.id, { hp: w.hp, stops: w.stops, charges: w.charges, spent: false, maxHp: w.maxHp, pour: w.pour }])),
  );
  const grimYieldRef = useRef(0);
  const grimBrightBg = () => grimWorkings.some((w) => w.engine === "engine" && !(grimRef.current.get(w.id)?.spent));
  const grimName = (w: import("./api").MapWorking) => grimNames[w.id] ?? w.spellKey;
  const grimReportBg = () => ({
    grimState: [...grimRef.current.entries()].map(([id, st]) => ({ id, hp: st.hp, stops: st.stops, charges: st.charges, spent: st.spent })),
    grimEnergy: grimYieldRef.current,
  });
  const fightersRef = useRef<Fighter[]>([]);
  const enemiesRef = useRef<Fighter[]>([]);
  const busyRef = useRef(false);

  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter(t => t !== id);
      fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  const setBusyBoth = (v: boolean) => { busyRef.current = v; setBusy(v); };

  const fighterCenter = (id: string) => {
    const el = fighterRefs.current.get(id);
    const field = fieldRef.current;
    if (!el || !field) return null;
    const r = el.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    return { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height * 0.4 };
  };

  const towerCenter = (tileId: number) => {
    const el = towerRefs.current.get(tileId);
    const field = fieldRef.current;
    if (!el || !field) return null;
    const r = el.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    return { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height / 2 };
  };

  const spawnProjectile = (p: { fx: number; fy: number; tx: number; ty: number; glyph: string; color: string; img?: string; arc?: boolean; duration: number; onImpact?: () => void }) => {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setProjectiles(prev => [...prev, { ...p, id }]);
    later(p.duration, () => {
      setProjectiles(prev => prev.filter(x => x.id !== id));
      p.onImpact?.();
    });
  };

  // The towers' searing light: a beam strikes at (x, y) and fades.
  const strikeBeam = (x: number, y: number) => {
    const id = `beam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setBeams(prev => [...prev, { id, x, y }]);
    later(950, () => setBeams(prev => prev.filter(b => b.id !== id)));
  };

  // Keep latest snapshots for mid-sequence targeting; clear timeouts on unmount.
  useEffect(() => { fightersRef.current = fighters; }, [fighters]);
  useEffect(() => { enemiesRef.current = enemies; }, [enemies]);

  // Weather's teeth, felt live (Nigel's ruling, 2026-10-15: no
  // snapshot — the live sky applies): when the sky turns DURING the
  // battle, the Unraveling turns with it. A storm breaking over the
  // battleground surges every living enemy's power by half; a storm
  // spending itself lets the surge fall back to their true power.
  // The server's resolution reads the same live sky, so what the
  // tender feels here is what the War-Ground will reckon there.
  const skySeenRef = useRef<string | null>(mood);
  useEffect(() => {
    const prev = skySeenRef.current;
    const next = mood;
    skySeenRef.current = next;
    if (!prev || !next || prev === next) return;
    if (next === "storm") {
      setEnemies(ens => ens.map(e => e.hp > 0 && e.basePower !== undefined ? { ...e, power: Math.ceil(e.basePower * 1.5) } : e));
      addLog("⛈️ The storm breaks over the battleground — the Unraveling surges with +50% power!");
    } else if (prev === "storm") {
      setEnemies(ens => ens.map(e => e.basePower !== undefined ? { ...e, power: e.basePower } : e));
      addLog("🌤️ The storm spends itself — the Unraveling's surge falls away.");
    } else {
      addLog(`🌙 The sky turns to ${next} over the battleground.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);
  useEffect(() => () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  // Battle music: random enabled track from the workshop library, stops when battle ends
  useEffect(() => {
    let cancelled = false;
    api.getRandomBattleTrack().then(res => {
      if (cancelled) return;
      if (res.track) {
        // trackData is a data URL, /music/ path, or 8-bit JSON
        const td = res.track.trackData;
        const url = (td.startsWith("data:audio") || td.startsWith("/music/")) ? td : BATTLE_TRACKS[Math.floor(Math.random() * BATTLE_TRACKS.length)].url;
        const track = { name: res.track.name, url };
        setBattleTrack(track);
        battleAudio.current = new Audio(track.url);
      } else {
        // Fallback to local tracks if workshop library is empty
        const fallback = BATTLE_TRACKS[Math.floor(Math.random() * BATTLE_TRACKS.length)];
        setBattleTrack(fallback);
        battleAudio.current = new Audio(fallback.url);
      }
      if (battleAudio.current) {
        battleAudio.current.volume = 0.21;
        battleAudio.current.loop = true;
        battleAudio.current.play().catch(() => {});
      }
    }).catch(() => {
      // Offline fallback
      const fallback = BATTLE_TRACKS[Math.floor(Math.random() * BATTLE_TRACKS.length)];
      setBattleTrack(fallback);
      battleAudio.current = new Audio(fallback.url);
      battleAudio.current.volume = 0.21;
      battleAudio.current.loop = true;
      battleAudio.current.play().catch(() => {});
    });
    return () => { cancelled = true; battleAudio.current?.pause(); battleAudio.current = null; };
  }, []);

  const [energyLeft, setEnergyLeft] = useState(energy);
  const [deck, setDeck] = useState(hand.slice(0, 6));
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [attacking, setAttacking] = useState<string | null>(null);
  const [towerVolley, setTowerVolley] = useState(false);
  const [hitFlash, setHitFlash] = useState<string | null>(null);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [beams, setBeams] = useState<{ id: string; x: number; y: number }[]>([]);
  const [windUp, setWindUp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dmgNumbers, setDmgNumbers] = useState<{id: string, fighterId: string, dmg: number, crit: boolean}[]>([]);
  const [critFlash, setCritFlash] = useState(false);
  const [autoBattle, setAutoBattle] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [victory, setVictory] = useState<boolean | null>(null);
  const [showVictoryScreen, setShowVictoryScreen] = useState(false);
  const [pickedTerritory, setPickedTerritory] = useState<number | null>(null);

  // Initialize fighters from defenders + wave
  useEffect(() => {
    const aw: Fighter[] = defenders.map((d, i) => {
      // Stance bonus (locked from field, cannot change in battle):
      // Defense stance: +2 toughness, Attack stance: +2 power
      const stanceBonusPower = d.stance === "attack" ? 2 : 0;
      const stanceBonusTough = d.stance === "defense" ? 2 : 0;
      const towerBonus = d.tileId && towerAuraTiles.includes(d.tileId) ? towerPowerBonus : 0;
      const basePower = d.awoken.power + stanceBonusPower + towerBonus;
      const baseTough = d.awoken.toughness + stanceBonusTough;
      return {
      id: `a-${d.awoken.id}`,
      awokenId: d.awoken.id,
      tileId: d.tileId,
      x: 5 + i * 11, y: 30, w: 13,
      power: basePower, tough: baseTough,
      hp: baseTough, maxHp: baseTough,
      name: d.awoken.name + (d.stance === "attack" ? " ⚔+2" : d.stance === "defense" ? " 🛡+2" : "") + (towerBonus ? " 🗼+2" : ""),
      side: "aw", field: true, stance: d.stance,
      awoken: d.awoken,
    }});
    const en: Fighter[] = [];
    const frayCfg = enemyConfig?.["fray"] ?? { power: 1, hp: 3 };
    for (let i = 0; i < wave.frayCount; i++) {
      en.push({
        id: `e-fray-${i}`, img: "fray",
        x: 52 + i * 4.5, y: 30, w: 9,
        power: frayCfg.power, basePower: frayCfg.power, tough: 0, hp: frayCfg.hp, maxHp: frayCfg.hp,
        name: "Fray", side: "en", field: false,
      });
    }
    const unravCfg = enemyConfig?.["unraveler"] ?? { power: 4, hp: 6 };
    for (let i = 0; i < wave.unravelers; i++) {
      en.push({
        id: `e-unrav-${i}`, img: "unraveler",
        x: 52 + (wave.frayCount * 4.5) + i * 5, y: 30, w: 10,
        power: unravCfg.power, basePower: unravCfg.power, tough: 0, hp: unravCfg.hp, maxHp: unravCfg.hp,
        name: "Unraveler", side: "en", field: false,
      });
    }
    const hollowCfg = enemyConfig?.["hollow"] ?? { power: 0, hp: 5 };
    for (let i = 0; i < (wave.hollows || 0); i++) {
      en.push({
        id: `e-hollow-${i}`, img: "hollow",
        x: 52 + (wave.frayCount * 4.5) + (wave.unravelers * 5) + i * 5, y: 30, w: 10,
        power: hollowCfg.power, basePower: hollowCfg.power, tough: 0, hp: hollowCfg.hp, maxHp: hollowCfg.hp,
        name: "Hollow", side: "en", field: false,
      });
    }
    const tangleCfg = enemyConfig?.["tangle"] ?? { power: 3, hp: 8 };
    for (let i = 0; i < (wave.tangles || 0); i++) {
      en.push({
        id: `e-tangle-${i}`, img: "tangle",
        x: 52 + (wave.frayCount * 4.5) + (wave.unravelers * 5) + ((wave.hollows || 0) * 5) + i * 5, y: 30, w: 10,
        power: tangleCfg.power, basePower: tangleCfg.power, tough: 0, hp: tangleCfg.hp, maxHp: tangleCfg.hp,
        name: "Tangle", side: "en", field: false,
      });
    }
    // The binding mend does NOT run here: at setup no one is wounded
    // yet, so for years it fired into an empty set and Binding's
    // in-battle heal never happened at all (Law's audit, Obs. 2).
    // It lives in runBindingMend now, called between exchanges.
    setFighters(aw);
    setEnemies(en);
    fightersRef.current = aw;
    enemiesRef.current = en;

    // Watchtower opening volley (Nigel, 2026-10-17): the towers no
    // longer loose arrows — each calls down a beam of searing light
    // onto a random enemy, staggered tower by tower.
    if (watchtowerTiles.length > 0 && en.length > 0) {
      setTowerVolley(true);
      addLog(`🗼 Watchtowers call down their searing light!`);
      const staggerMs = 200;
      watchtowerTiles.forEach((tileId, i) => {
        later(1000 + i * staggerMs, () => {
          const from = towerCenter(tileId);
          const alive = enemiesRef.current.filter(e => e.hp > 0);
          if (!from || alive.length === 0) return;
          const target = alive[Math.floor(Math.random() * alive.length)];
          const to = fighterCenter(target.id);
          if (!to) return;
          strikeBeam(to.x, to.y);
          setHitFlash(target.id);
          later(400, () => setHitFlash(null));
          const numId = `tower-${Date.now()}-${i}`;
          setDmgNumbers(prev => [...prev, { id: numId, fighterId: target.id, dmg: towerDamage, crit: false }]);
          later(1200, () => setDmgNumbers(prev => prev.filter(n => n.id !== numId)));
          setEnemies(prev => prev.map(e => e.id === target.id ? { ...e, hp: Math.max(0, e.hp - towerDamage) } : e));
          addLog(`🗼 Tower light sears ${target.name} for ${towerDamage}!`);
        });
      });
      later(1000 + watchtowerTiles.length * staggerMs + 950, () => setTowerVolley(false));
    }

    // Random battle track
    api.getRandomBattleTrack().then(({ track }) => {
      if (track) trackPlayer.play(JSON.parse(track.trackData) as TrackData);
    }).catch(() => {});

    return () => trackPlayer.stop();
  }, []);

  // Initiative: 12 - power
  const getInit = (f: Fighter) => 12 - f.power;

  const buildTurnOrder = () => {
    const all = [...fighters, ...enemies].filter(f => f.hp > 0);
    all.sort((a, b) => getInit(b) - getInit(a) || Math.random() - 0.5);
    setTurnOrder(all.map(f => f.id));
    setTurnIndex(0);
  };

  // Auto-battle: chain attacks with siege pacing until victory or defeat
  useEffect(() => {
    if (!autoBattle || busy) return;
    const livingFighters = fighters.filter(f => f.hp > 0);
    const livingEnemies = enemies.filter(e => e.hp > 0);
    if (livingFighters.length === 0 || livingEnemies.length === 0) {
      setAutoBattle(false);
      return;
    }
    const timer = later(900, () => {
      if (busyRef.current) return;
      const lf = fightersRef.current.filter(f => f.hp > 0);
      const le = enemiesRef.current.filter(e => e.hp > 0);
      if (lf.length > 0 && le.length > 0) doAttack(lf[0], le[0]);
    });
    return () => clearTimeout(timer);
  }, [autoBattle, busy, fighters, enemies]);

  // ---- Siege exchange: wind-up -> projectile flight -> impact -> counterattack ----
  const WINDUP_MS = 600;
  const FLIGHT_MS = 500;
  const IMPACT_PAUSE_MS = 600;
  const COUNTER_WINDUP_MS = 800;
  const COUNTER_FLIGHT_MS = 600;
  const SETTLE_MS = 500;

  const applyStrike = (atk: Fighter, def: Fighter) => {
    // The Written Light's auras (the Grimoire): a Standard over
    // the striker's ground lends its bonus; a Beacon lends its
    // bonus against dark standing in its light.
    const aura = atk.side !== "en" && def.side === "en"
      ? (atk.tileId != null ? grimStdTiles[atk.tileId] ?? 0 : 0) + (def.tileId != null ? grimBcnTiles[def.tileId] ?? 0 : 0)
      : 0;
    const dmg = Math.max(1, atk.power + aura - def.tough);
    const isCrit = dmg >= atk.power * 1.5;
    addLog(`${atk.name} strikes ${def.name} for ${dmg}!${aura > 0 ? " The Written Light lends its strength." : ""}`);
    setHitFlash(def.id);
    later(400, () => setHitFlash(null));
    const numId = `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDmgNumbers(prev => [...prev, { id: numId, fighterId: def.id, dmg, crit: isCrit }]);
    later(1200, () => setDmgNumbers(prev => prev.filter(n => n.id !== numId)));
    if (isCrit) {
      setCritFlash(true);
      later(500, () => setCritFlash(false));
    }
    const newHp = Math.max(0, def.hp - dmg);
    if (newHp === 0 && def.hp > 0) {
      if (def.side === "en") {
        addLog(`💀 ${def.name} unravels into nothing.`);
      } else {
        addLog(`🌙 ${def.name} retreats to rest.`);
      }
    }
    if (def.side === "en") {
      setEnemies(prev => prev.map(e => e.id === def.id ? { ...e, hp: Math.max(0, e.hp - dmg) } : e));
    } else {
      setFighters(prev => prev.map(f => f.id === def.id ? { ...f, hp: Math.max(0, f.hp - dmg) } : f));
    }
  };

  const applyEnemyStrike = (attacker: Fighter, target: Fighter) => {
    // Held fast (War-Ground, Nigel 2026-10-15): a strike owed to
    // thorns crossed or a snare sprung is a strike that never lands.
    const held = skipStrikesRef.current.get(attacker.id) ?? 0;
    if (held > 0) {
      skipStrikesRef.current.set(attacker.id, held - 1);
      addLog(`${attacker.name} is held fast — thorns and sprung runes drag at it, and its strike falters.`);
      return;
    }
    if (target.tileId != null) {
      // A rune springs as the enemy closes on the tile — the trap is
      // on the crossing, before any barrier is tested. One-shot.
      const rune = (runesByTile[target.tileId] ?? []).find(r => !runesFiredRef.current.has(r.edgeKey));
      if (rune) {
        runesFiredRef.current.add(rune.edgeKey);
        runesTriggeredRef.current.push(rune.edgeKey);
        const scale = Math.pow(2, (rune.level ?? 1) - 1);
        if (rune.runeKind === "harm" || rune.runeKind === "meld") {
          const rd = (rune.runeKind === "harm" ? 6 : 3) * scale;
          setEnemies(prev => prev.map(e => e.id === attacker.id ? { ...e, hp: Math.max(0, e.hp - rd) } : e));
          const rNumId = `rune-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setDmgNumbers(prev => [...prev, { id: rNumId, fighterId: attacker.id, dmg: rd, crit: false }]);
          later(1200, () => setDmgNumbers(prev => prev.filter(n => n.id !== rNumId)));
        }
        if (rune.runeKind === "snare") {
          skipStrikesRef.current.set(attacker.id, (skipStrikesRef.current.get(attacker.id) ?? 0) + 1);
          addLog(`A snare rune springs under ${attacker.name} — it is held fast, and its strike never comes!`);
          return;
        }
        if (rune.runeKind === "meld") {
          addLog(`A meld rune springs under ${attacker.name} — bitten and held, its strike never comes!`);
          return;
        }
        addLog(`A harm rune springs under ${attacker.name} — the Unraveling is torn!`);
      }
      // Thorns slow the crossing: this strike lands, the next is owed.
      if (edgeThornTiles.includes(target.tileId)) {
        skipStrikesRef.current.set(attacker.id, Math.max(skipStrikesRef.current.get(attacker.id) ?? 0, 1));
      }
    }
    // The Written Light answers on this ground (the Grimoire):
    // a floor rune springs as the dark closes on its hex, a Seal
    // across the very crossing stops the blow and answers it,
    // and the Trees take the blow into their own health — all
    // before the walls are tested, by the book's numbers.
    if (target.tileId != null) {
      const grune = grimRunesByTile[target.tileId];
      const gst = grune ? grimRef.current.get(grune.id) : undefined;
      if (grune && gst && !gst.spent) {
        const bright = grimBrightBg() ? 1 : 0;
        if (grune.engine === "lattice") {
          // The Lattice holds with its health rating (Nigel,
          // 2026-10-17): pinning costs the striker's power; the
          // writing stands on while health remains.
          const strain = Math.max(1, attacker.power);
          if (gst.hp >= strain) {
            gst.hp -= strain;
            if (gst.hp <= 0) gst.spent = true;
            skipStrikesRef.current.set(attacker.id, (skipStrikesRef.current.get(attacker.id) ?? 0) + (grune.nums.pinRounds ?? 2));
            addLog(`${grimName(grune)} springs — ${attacker.name} is pinned in the lattice of light, and its strike never comes!`);
            return;
          }
          addLog(`${grimName(grune)} strains to hold ${attacker.name} — its light is too worn (❤${Math.max(0, gst.hp)}).`);
        }
        if (grune.engine === "blade" || grune.engine === "blades") {
          const power = (grune.nums.power ?? (grune.engine === "blade" ? 6 : 3)) + bright * (grune.nums.brightBonus ?? 1);
          setEnemies(prev => prev.map(e => (e.tileId === target.tileId || e.id === attacker.id) ? { ...e, hp: Math.max(0, e.hp - power) } : e));
          gst.charges--;
          if (gst.charges <= 0) gst.spent = true;
          addLog(`${grimName(grune)} springs — ${power} harm to everything dark on its ground!`);
        }
        if (grune.engine === "coil") {
          const dests = grimCoilTiles.filter(t => t !== target.tileId && t !== attacker.tileId);
          if (dests.length) {
            const dest = dests[Math.floor(Math.random() * dests.length)];
            setEnemies(prev => prev.map(e => e.id === attacker.id ? { ...e, tileId: dest } : e));
            grimYieldRef.current += Math.min(grune.nums.energyCap ?? 3, grune.nums.energyPerDark ?? 1);
          }
          gst.spent = true;
          addLog(`${grimName(grune)} turns ${attacker.name} aside — hurled to far ground, its strike lost in the turning!`);
          return;
        }
        if (grune.engine === "shardrain") {
          // SHARD RAIN (Nigel, 2026-10-17): one pool, split over
          // every dark thing standing on the covered ground —
          // on the map, the rune's own hex. The dice: the base,
          // plus one per attunement level the caster held in
          // the spell's element when they wrote it.
          const here = enemiesRef.current.filter(e => e.tileId === target.tileId || e.id === attacker.id);
          if (here.length) {
            const dice = Math.max(1, (grune.nums.diceBase ?? 2) + (grune.nums.dicePerLevel ?? 1) * (grune.nums.rainLevel ?? 0));
            const rolls: number[] = [];
            let pool = 0;
            for (let i = 0; i < dice; i++) { const r = 1 + Math.floor(Math.random() * 6); rolls.push(r); pool += r; }
            const share = Math.floor(pool / here.length);
            let rem = pool - share * here.length;
            const harm = new Map<string, number>();
            for (const e of here) { harm.set(e.id, share + (rem > 0 ? (rem--, 1) : 0)); }
            setEnemies(prev => prev.map(e => harm.has(e.id) ? { ...e, hp: Math.max(0, e.hp - (harm.get(e.id) ?? 0)) } : e));
            gst.spent = true;
            addLog(`${grimName(grune)} FALLS — the sky opens: ${dice} dice (${rolls.join(" + ")}) make a pool of ${pool}, split over ${here.length} of the dark — ${share} harm each, the first in line taking the remainder!`);
          }
        }
        if (grune.engine === "shard") {
          const here = enemiesRef.current.filter(e => e.tileId === target.tileId || e.id === attacker.id);
          const greatest = here.length ? Math.max(...here.map(e => e.power)) : 0;
          if (greatest >= (grune.nums.minPower ?? 5)) {
            const dmg = greatest * (grune.nums.multiplier ?? 2) + (grune.pour ?? 0) * (grune.nums.harmPerPoint ?? 1);
            setEnemies(prev => prev.map(e => (e.tileId === target.tileId || e.id === attacker.id) ? { ...e, hp: Math.max(0, e.hp - dmg) } : e));
            gst.spent = true;
            addLog(`${grimName(grune)} FALLS on the whole hex — ${dmg} harm, measured by the greatest dark standing there!`);
          }
        }
      }
      // Seals first — a blow stopped cold never reaches the trees.
      for (const wid of grimWardsByTile[target.tileId] ?? []) {
        const w = grimWorkings.find(x => x.id === wid);
        const st = grimRef.current.get(wid);
        if (!w || !st || st.spent || w.engine !== "seal") continue;
        const [ta, tb] = grimWardTiles[wid] ?? [-1, -1];
        const other = ta === target.tileId ? tb : tb === target.tileId ? ta : null;
        if (other === null || attacker.tileId !== other) continue;
        st.stops++;
        // The Seal's health rating: the stopped blow's power
        // comes out of the Seal's own health.
        st.hp -= Math.max(1, attacker.power);
        if (st.stops >= (w.nums.stops ?? 3) || st.hp <= 0) st.spent = true;
        const rip = (w.nums.riposte ?? 3) + (grimBrightBg() ? (w.nums.brightBonus ?? 1) : 0);
        setEnemies(prev => prev.map(e => e.id === attacker.id ? { ...e, hp: Math.max(0, e.hp - rip) } : e));
        addLog(`${grimName(w)} stops ${attacker.name}'s strike cold — and answers it (${rip})!`);
        return;
      }
      // Then the Trees take what crosses their edge.
      for (const wid of grimWardsByTile[target.tileId] ?? []) {
        const w = grimWorkings.find(x => x.id === wid);
        const st = grimRef.current.get(wid);
        if (!w || !st || st.spent || w.engine !== "trees" || st.hp <= 0) continue;
        st.hp = Math.max(0, st.hp - Math.max(1, attacker.power));
        if (st.hp <= 0) st.spent = true;
        addLog(st.hp > 0
          ? `${grimName(w)} take the blow meant for ${target.name} — the trees hold at ${st.hp}.`
          : `${grimName(w)} are broken bringing ${attacker.name}'s strike down — for this battle. The seed remembers them.`);
        setHitFlash(target.id);
        later(400, () => setHitFlash(null));
        return;
      }
    }
    // Hex walls block the crossing (War-Ground, 2026-10-15): while a
    // wall stands on the target's tile, the enemy's strike lands on
    // the WALL — its full power against the wall's HP, no toughness —
    // and the fighter behind it is untouched. Wards stand in the same
    // ledger and answer strikes the same way — a wall of the other
    // kind (and the only one the sky cannot ignore, when fliers come).
    if (target.tileId != null) {
      const standing = (wallsByTile[target.tileId] ?? []).find(w => (wallHpRef.current[w.edgeKey] ?? 0) > 0);
      if (standing) {
        const wallDmg = Math.max(1, attacker.power);
        const left = Math.max(0, (wallHpRef.current[standing.edgeKey] ?? 0) - wallDmg);
        setWallHp(prev => ({ ...prev, [standing.edgeKey]: left }));
        const workName = standing.kind === "ward" ? "ward" : "wall";
        addLog(left > 0
          ? `${attacker.name} hammers the ${workName} before ${target.name} — the ${workName} holds at ${left}.`
          : `${attacker.name} brings the ${workName} down before ${target.name}!`);
        setHitFlash(target.id);
        later(400, () => setHitFlash(null));
        const numId = `wall-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setDmgNumbers(prev => [...prev, { id: numId, fighterId: target.id, dmg: wallDmg, crit: false }]);
        later(1200, () => setDmgNumbers(prev => prev.filter(n => n.id !== numId)));
        return;
      }
    }
    const edmg = Math.max(1, attacker.power - target.tough);
    const thornHit = target.tileId != null && thornWallTiles.includes(target.tileId);
    let logMsg = `${attacker.name} strikes back at ${target.name} for ${edmg}!`;
    if (thornHit) logMsg += ` Thorns bite back for ${thornDamage}!`;
    setLog(logMsg);
    setHitFlash(target.id);
    later(400, () => setHitFlash(null));
    const numId = `edmg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDmgNumbers(prev => [...prev, { id: numId, fighterId: target.id, dmg: edmg, crit: false }]);
    later(1200, () => setDmgNumbers(prev => prev.filter(n => n.id !== numId)));
    if (thornHit) {
      setEnemies(ens => ens.map(e =>
        e.id === attacker.id ? { ...e, hp: Math.max(0, e.hp - thornDamage) } : e
      ));
      const tNumId = `thorn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setDmgNumbers(prev => [...prev, { id: tNumId, fighterId: attacker.id, dmg: thornDamage, crit: false }]);
      later(1200, () => setDmgNumbers(prev => prev.filter(n => n.id !== tNumId)));
    }
    setFighters(prev => prev.map(f =>
      f.id === target.id ? { ...f, hp: Math.max(0, f.hp - edmg) } : f
    ));
  };

  const scheduleCounter = () => {
    const aliveEnemies = enemiesRef.current.filter(e => e.hp > 0);
    const aliveFighters = fightersRef.current.filter(f => f.hp > 0);
    if (aliveEnemies.length === 0 || aliveFighters.length === 0) {
      setBusyBoth(false);
      return;
    }
    const attacker = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
    const target = aliveFighters[Math.floor(Math.random() * aliveFighters.length)];
    setWindUp(attacker.id);
    later(COUNTER_WINDUP_MS, () => {
      setWindUp(null);
      setAttacking(attacker.id);
      later(350, () => setAttacking(null));
      const from = fighterCenter(attacker.id);
      const to = fighterCenter(target.id);
      const finish = () => {
        applyEnemyStrike(attacker, target);
        later(SETTLE_MS, () => setBusyBoth(false));
      };
      if (!from || !to) { finish(); return; }
      spawnProjectile({
        fx: from.x, fy: from.y, tx: to.x, ty: to.y,
        glyph: ENEMY_SHOT.glyph, color: ENEMY_SHOT.color,
        duration: COUNTER_FLIGHT_MS, onImpact: finish,
      });
    });
  };

  // Binding mend (kept law, re-timed 2026-10-17 on Nigel's order):
  // once between exchanges, each living binding-stance defender's
  // power joins a pool split among the living wounded — the heal the
  // law always promised, at a moment when wounds exist.
  const runBindingMend = () => {
    const current = fightersRef.current;
    const binders = current.filter(f => f.side === "aw" && f.hp > 0 && f.stance === "binding");
    if (!binders.length) return;
    const totalHeal = binders.reduce((sum, f) => sum + (f.awoken?.power ?? f.power), 0);
    const wounded = current.filter(f => f.side === "aw" && f.hp > 0 && f.hp < f.maxHp);
    if (!wounded.length || totalHeal <= 0) return;
    const healEach = Math.floor(totalHeal / wounded.length);
    const remainder = totalHeal % wounded.length;
    let applied = 0;
    const mended = current.map(f => {
      const idx = wounded.findIndex(w => w.id === f.id);
      if (idx < 0) return f;
      const heal = healEach + (idx < remainder ? 1 : 0);
      const hp = Math.min(f.maxHp, f.hp + heal);
      applied += hp - f.hp;
      return { ...f, hp };
    });
    if (applied <= 0) return;
    fightersRef.current = mended;
    setFighters(mended);
    addLog(`✦ Binding light mends the wounded (+${applied} total)`);
  };

  const doAttack = (atk: Fighter, def: Fighter) => {
    if (busyRef.current) return;
    runBindingMend();
    // The Written Light's Engines sing per exchange (the Grimoire).
    for (const w of grimWorkings) {
      const st = grimRef.current.get(w.id);
      if (w.engine === "engine" && st && !st.spent) grimYieldRef.current += w.nums.energyPerRound ?? 1;
    }
    setBusyBoth(true);
    setSelected(null);

    // Wind-up: attacker glows and gathers power
    setWindUp(atk.id);
    addLog(`${atk.name} gathers power...`);
    later(WINDUP_MS, () => {
      setWindUp(null);
      setAttacking(atk.id);
      later(350, () => setAttacking(null));
      const from = fighterCenter(atk.id);
      const to = fighterCenter(def.id);
      const shotEl = dominantElementOf(atk.awoken);
      const shot = atk.side === "aw"
        ? { glyph: ELEMENT_SHOT_GLYPH[shotEl] ?? "\u2726", color: elementPalette[shotEl] }
        : ENEMY_SHOT;
      const impact = () => {
        applyStrike(atk, def);
        later(IMPACT_PAUSE_MS, () => scheduleCounter());
      };
      if (!from || !to) { impact(); return; }
      spawnProjectile({
        fx: from.x, fy: from.y, tx: to.x, ty: to.y,
        glyph: shot.glyph, color: shot.color,
        img: atk.side === "aw" ? PROJECTILE_GIF[shotEl] ?? PROJECTILE_GIF.unaligned : undefined,
        duration: FLIGHT_MS, onImpact: impact,
      });
    });
  };

  // Check for battle end whenever fighters or enemies change
  useEffect(() => {
    if (victory !== null) return; // Already resolved
    if (fighters.length === 0 && enemies.length === 0) return; // Not initialized
    // Count alive — must have at least one enemy to exist for victory to be valid
    const aliveFighters = fighters.filter(f => f.hp > 0).length;
    const aliveEnemies = enemies.filter(e => e.hp > 0).length;
    const totalEnemies = enemies.length;
    // Only trigger if battle actually started (enemies were created) and now all dead
    if (totalEnemies > 0 && aliveEnemies === 0 && aliveFighters > 0) {
      // Victory! Show the victory screen.
      setVictory(true);
      setSimRunning(false);
      trackPlayer.stop();
      addLog("THE UNRAVELING BREAKS!");
      setTimeout(async () => {
        if (onVictoryDetected) {
          const survivors = fighters.filter(f => f.hp > 0 && f.field).map(f => f.awokenId!).filter(Boolean);
          await onVictoryDetected(survivors, currentWallState(), currentRunesTriggered(), grimReportBg());
        }
        setShowVictoryScreen(true);
      }, 1500);
    } else if (totalEnemies > 0 && aliveFighters === 0 && aliveEnemies > 0) {
      // Defeat — all fighters dead but enemies remain
      setVictory(false);
      setSimRunning(false);
      trackPlayer.stop();
      addLog("THE LINE FALLS...");
      setTimeout(() => onBattleEnd({ victory: false, survivors: [], wallState: currentWallState(), runesTriggered: currentRunesTriggered(), ...grimReportBg() }), 2500);
    }
  }, [fighters, enemies]);

  const [birthing, setBirthing] = useState<number | null>(null);

  const playCard = (index: number) => {
    const card = deck[index];
    const isNewborn = card.name.toLowerCase().includes("newborn") || card.field_born === 1;
    const cost = isNewborn ? 0 : 2 + Math.floor((card.power - 1) / 3);
    if (energyLeft < cost) return;
    if (isNewborn) {
      // Birth ritual: the dot sparkles and expands into the Awoken
      setBirthing(card.id);
      addLog("Something stirs in the card...");
      setTimeout(() => {
        setEnergyLeft(e => e - cost);
        const newFighter: Fighter = {
          id: `a-birth-${Date.now()}`,
          awokenId: card.id,
          x: 5 + fighters.length * 11, y: 30, w: 13,
          power: card.power, tough: card.toughness,
          hp: card.toughness, maxHp: card.toughness,
          name: card.name, side: "aw", field: false,
          awoken: card,
        };
        setFighters(prev => [...prev, newFighter]);
        setDeck(prev => prev.filter((_, i) => i !== index));
        setBirthing(null);
        addLog(`${card.name} is born!`);
      }, 1500);
      return;
    }
    setEnergyLeft(e => e - cost);
    const newFighter: Fighter = {
      id: `a-reinf-${Date.now()}`,
      awokenId: card.id,
      x: 5 + Math.random() * 15, y: 18 + Math.random() * 12, w: 13,
      power: card.power, tough: card.toughness,
      hp: card.toughness, maxHp: card.toughness,
      name: card.name, side: "aw", field: false,
      awoken: card,
    };
    setFighters(prev => [...prev, newFighter]);
    setDeck(prev => prev.filter((_, i) => i !== index));
    addLog(`${card.name} reinforces! (returns to hand after)`);
  };

  return (
    <div className="battleground-overlay">
      <div className="battleground-bg" style={{ backgroundImage: `url(${battlegroundBg})` }} />
      <div className="battle-fog" />
      {towerVolley && (
        <div className="tower-volley-banner">
          <div className="volley-flash" />
          <div className="volley-text">🗼 TOWER VOLLEY 🗼</div>
        </div>
      )}
      <div className="battle-hud">
        <div className="energy-display"><span className="spark-glow">✦</span> {energyLeft}/{maxEnergy}</div>
        <button 
          className={`abtn small ${autoBattle ? "active" : ""}`} 
          onClick={() => setAutoBattle(!autoBattle)}
          title="Automatically battle until victory or defeat"
        >
          {autoBattle ? "⏸ Auto" : "▶ Auto"}
        </button>
        <button className="abtn small" onClick={onClose}>✕ Retreat</button>
      </div>
      {!autoBattle && !selected && fighters.some(f => f.hp > 0) && enemies.some(e => e.hp > 0) && (
        <div className="manual-hint">
          👆 Tap one of your Awokin, then tap an enemy to attack
        </div>
      )}
      <div className="battle-log">
        <div className="battle-log-current">{log}</div>
        <div className="battle-log-history">
          {logHistory.slice(-8, -1).reverse().map((msg: string, i: number) => (
            <div key={i} className="battle-log-old" style={{ opacity: 0.9 - i * 0.1 }}>{msg}</div>
          ))}
        </div>
      </div>
      <div ref={fieldRef} className={`battle-field ${critFlash ? "crit-flash" : ""}`}>
        {watchtowerTiles.length > 0 && (
          <div className="battle-towers">
            {watchtowerTiles.map(t => (
              <div
                key={t}
                className="battle-tower"
                title="Watchtower"
                ref={(el) => { if (el) towerRefs.current.set(t, el); else towerRefs.current.delete(t); }}
              >🗼</div>
            ))}
          </div>
        )}
        <div className="projectile-layer">
          {projectiles.map(p => (
            <ProjectileFlight key={p.id} p={p} />
          ))}
          {beams.map(b => (
            <div key={b.id} className="beam-strike" style={{ left: b.x, top: b.y }}>
              <img src={BEAM_GIF} alt="" />
            </div>
          ))}
        </div>
        <div className="battle-row defenders-row">
        {fighters.filter(f => f.hp > 0).map(f => (
          <div
            key={f.id}
            ref={(el) => { if (el) fighterRefs.current.set(f.id, el); else fighterRefs.current.delete(f.id); }}
            className={`battle-fighter ${selected === f.id ? "selected" : ""} ${f.hp < f.maxHp * 0.25 ? "critical" : ""} ${f.hp < f.maxHp * 0.5 && f.hp >= f.maxHp * 0.25 ? "wounded" : ""} ${f.hp < f.maxHp * 0.25 ? "bloodied" : ""} ${attacking === f.id ? "attacking" : ""} ${hitFlash === f.id ? "hit-flash" : ""} ${windUp === f.id ? "wind-up" : ""}`}
            onClick={() => setSelected(selected === f.id ? null : f.id)}
          >
            {f.awoken && (
              <svg viewBox="0 0 100 130" style={{ width: "100%", height: "auto", display: "block" }}>
                <FieldAwoken awoken={f.awoken} assets={assets} x={0} y={0} width={100} height={130} />
              </svg>
            )}
            <div className="fighter-stats">{f.power}⚔ {f.tough}🛡</div>
            <div className="thermometer">
              <div className="thermo-fill" style={{ height: `${(f.hp / f.maxHp) * 100}%` }} />
              <div className="thermo-bulb" />
            </div>
            {f.field && <div className="field-badge">⚔</div>}
            {(() => { const shield = wallShieldFor(f.tileId); return shield > 0 ? <div className="field-badge" style={{ right: "auto", left: 2 }} title="Hex wall HP shielding this fighter">🧱{shield}</div> : null; })()}
            {dmgNumbers.filter(n => n.fighterId === f.id).map(n => (
              <div key={n.id} className={`dmg-number ${n.crit ? "crit" : ""}`}>-{n.dmg}</div>
            ))}
          </div>
        ))}
        </div>
        <div className="battle-row enemies-row">
        {enemies.filter(e => e.hp > 0).map(e => (
          <div
            key={e.id}
            ref={(el) => { if (el) fighterRefs.current.set(e.id, el); else fighterRefs.current.delete(e.id); }}
            className={`battle-fighter enemy ${e.hp < e.maxHp * 0.25 ? "critical" : ""} ${e.hp < e.maxHp * 0.5 && e.hp >= e.maxHp * 0.25 ? "wounded" : ""} ${e.hp < e.maxHp * 0.25 ? "bloodied" : ""} ${attacking === e.id ? "attacking" : ""} ${hitFlash === e.id ? "hit-flash" : ""} ${windUp === e.id ? "wind-up" : ""}`}
            onClick={() => {
              if (busy || !selected) return;
              const atk = fighters.find(f => f.id === selected);
              if (atk) doAttack(atk, e);
            }}
          >
            <img
              src={enemyImgFor(e.img === "fray" ? "fray" : "unraveler", enemyArtData?.art)}
              alt={e.name}
              style={{ width: "100%", height: "auto", display: "block", filter: "hue-rotate(320deg) saturate(2)" }}
            />
            <div className="fighter-stats">❤{e.hp}/{e.maxHp}</div>
            <div className="thermometer enemy-thermo">
              <div className="thermo-fill" style={{ height: `${(e.hp / e.maxHp) * 100}%` }} />
              <div className="thermo-bulb" />
            </div>
            {dmgNumbers.filter(n => n.fighterId === e.id).map(n => (
              <div key={n.id} className={`dmg-number ${n.crit ? "crit" : ""}`}>-{n.dmg}</div>
            ))}
          </div>
        ))}
        </div>
      </div>
      <div className="battle-deck">
        {deck.map((card, i) => {
          const isNewborn = card.name.toLowerCase().includes("newborn") || card.field_born === 1;
          const cost = isNewborn ? 0 : 2 + Math.floor((card.power - 1) / 3);
          const isBirthing = birthing === card.id;
          return (
            <div
              key={card.id}
              className={`deck-card-mini ${isNewborn ? "newborn" : ""} ${isBirthing ? "birthing" : ""}`}
              onClick={() => playCard(i)}
              style={{ opacity: energyLeft >= cost ? 1 : 0.4 }}
            >
              {!isNewborn && <div className="mini-cost"><span className="spark-glow">✦</span>{cost}</div>}
              {isNewborn ? (
                <>
                  <div className="newborn-dot" />
                  <div className="mini-name" style={{ color: "#ffd700" }}>✦ Newborn</div>
                  <div className="mini-stats" style={{ fontSize: 8 }}>tap to birth</div>
                </>
              ) : (
                <>
                  <div className="mini-name">{card.name}</div>
                  <div className="mini-stats">{card.power}⚔ {card.toughness}🛡</div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {victory !== null && !showVictoryScreen && (
        <div className="victory-overlay">
          <div className="victory-text">{victory ? "THE UNRAVELING BREAKS" : "THE LINE FALLS"}</div>
        </div>
      )}
      {showVictoryScreen && victory && (
        <div className="victory-screen">
          <svg className="spinning-hex" viewBox="0 0 100 100">
            <polygon points="50,5 93,27 93,73 50,95 7,73 7,27"
              fill="none" stroke="#ffd700" strokeWidth="4" />
            <polygon points="50,20 80,37 80,63 50,80 20,63 20,37"
              fill="rgba(255,215,0,0.2)" stroke="#ffedaa" strokeWidth="2" />
          </svg>
          <h1>UNRAVELING COMPLETE</h1>
          <VictoryAspects grant={aspectGrant} />
          {bonusTiles.length > 0 && (
            <div className="victory-territory-pick">
              <p>Choose one new territory to claim:</p>
              <div className="bonus-minimap" style={{ position: "relative", width: "260px", height: "180px", margin: "0 auto" }}>
                {(() => {
                  const qs = bonusTiles.map(t => t.q);
                  const rs = bonusTiles.map(t => t.r);
                  const centerQ = (Math.min(...qs) + Math.max(...qs)) / 2;
                  const centerR = (Math.min(...rs) + Math.max(...rs)) / 2;
                  const scale = 20;
                  return bonusTiles.map(t => {
                    const k = scale / 796;
                    const px = (t.q - centerQ) * 1292 * k + (t.r - centerR) * 13 * k;
                    const py = (t.q - centerQ) * 475 * k + (t.r - centerR) * 946 * k;
                    const isPicked = pickedTerritory === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setPickedTerritory(t.id)}
                        title={`Tile (${t.q},${t.r})`}
                        style={{
                          position: "absolute",
                          left: `calc(50% + ${px}px)`,
                          top: `calc(50% + ${py}px)`,
                          transform: "translate(-50%,-50%)",
                          width: "28px", height: "28px",
                          background: isPicked ? "#ffd700" : "#3a2a1a",
                          border: `2px solid ${isPicked ? "#fff" : "#8a6a3a"}`,
                          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                          cursor: "pointer",
                        }}
                      />
                    );
                  });
                })()}
              </div>
            </div>
          )}
          <div className="victory-buttons">
            <button className="abtn raise-binding" onClick={() => {
              const survivors = fighters.filter(f => f.hp > 0 && f.field).map(f => f.awokenId!);
              onBattleEnd({ victory: true, survivors, bonusTileId: pickedTerritory ?? undefined, wallState: currentWallState(), runesTriggered: currentRunesTriggered(), ...grimReportBg() });
            }}>
              ✦ Rest — end the run
            </button>
            <button className="abtn continue-wave" onClick={() => {
              const survivors = fighters.filter(f => f.hp > 0 && f.field).map(f => f.awokenId!);
              onBattleEnd({ victory: true, survivors, continueWave: true, bonusTileId: pickedTerritory ?? undefined, wallState: currentWallState(), runesTriggered: currentRunesTriggered(), ...grimReportBg() });
            }}>
              Continue →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
