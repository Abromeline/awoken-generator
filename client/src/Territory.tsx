import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Awakened, type TerritoryTile, type FieldPlacement } from "./api";
import EnergyTimer from "./EnergyTimer";
import hallBanner from "./assets/hall-of-champions.jpg";

import FieldAwoken from "./FieldAwoken";
import { Corner, elementForPiece, type Element } from "./App";
import { randomWhisper, pickReturnReport } from "./whispers";
import Friends from "./Friends";
import { useCourtMarks } from "./courtMarks";
import { trackPlayer, type TrackData } from "./trackPlayer";
import Battleground from "./Battleground";
import BuildingMenu, { buildingImage, wheatStageImage, dreamWeedStageImage, enemyImage } from "./BuildingMenu";
import AspectCelebration from "./AspectCelebration";
import { ElementGlyph, type GlyphElement } from "./glyphs";
import frayImg from "./assets/enemies/fray.png";
import unravelerImg from "./assets/enemies/unraveler.png";
import hollowImg from "./assets/enemies/hollow.png";
import tangleImg from "./assets/enemies/tangle.png";

const ENEMY_IMGS: Record<string, string> = {
  fray: frayImg,
  unraveler: unravelerImg,
  hollow: hollowImg,
  tangle: tangleImg,
};
import Tutorial, { tutorialComplete } from "./Tutorial";
import tideImg from "./assets/terrain-iso/tide-v2.png";
import skyImg from "./assets/terrain-iso/sky-v2.png";
import stoneImg from "./assets/terrain-iso/stone-v2.png";
import rootImg from "./assets/terrain-iso/root-v2.png";
import neutralImg from "./assets/terrain-iso/neutral-v2.png";
import cursedImg from "./assets/terrain-iso/cursed-v2.png";

const TERRAIN: Record<string, string> = {
  tide: tideImg, sky: skyImg, stone: stoneImg, root: rootImg,
  neutral: neutralImg, cursed: cursedImg,
};

// Per-key seating offsets for the tile <image>, in units of s (the map
// tile size), converted from source px at the image's render scale
// (dx: ×2.41/1920, dy: ×1.608/1280). Five tiles share one canvas
// template and need none; neutral's slab sits off-template in its own
// canvas (+94, −24 source px from the shared registration), so only
// neutral is nudged to seat its painted face on the lattice point.
const TERRAIN_IMG_OFFSET: Record<string, { dx: number; dy: number }> = {
  neutral: { dx: -0.1180, dy: 0.0302 },
};

// ── THE hex geometry — one source for map, overlays, and hit-testing ──
//
// The polygon IS the painted face. Fix list #13 drew the Wigner–Seitz
// (Voronoi) cell of the tile lattice — but a Voronoi cell's edges are
// the perpendicular bisectors of the neighbor vectors, and the painted
// face's slants are not: measured, that cell is 1459×961 source px
// against a face of 1730×944, so the #13 outlines crossed the painted
// edges along every slant and no basis correction could ever seat
// them. (Before #13 it was worse: a hand-tuned regular hexagon that
// shared nothing with the lattice at all.)
//
// Measured 2026-10-13 (rim-fit sweep of all six terrain PNGs, ±5 px):
// the FACE_HEX polygon below, and the lattice that translates it —
// E (1292, 470), SE (0, 948) per 796 source px. The face tiles by
// translation: its edge midpoints sit at ±E/2, ±SE/2, ±(E−SE)/2 within
// painting tolerance, so adjacent polygons share full edges by
// construction. Every hex drawn over the map — terrain tint, click
// target, hover, mist, selection — is this face at the tile's lattice
// position, so any set of them reads as ONE fitted hexmap at every
// zoom/pan, and the click target is literally the hex you see.
// The ART is canonical: where measurement and art disagree, the code
// moves, never the art.
const ISO_E: [number, number] = [1292, 470];
const ISO_SE: [number, number] = [0, 948];
const ISO_DEN = 796;

/** The lattice basis (east and south-east neighbor offsets) at a size. */
function isoBasis(size: number): { u: [number, number]; v: [number, number] } {
  const k = size / ISO_DEN;
  return { u: [ISO_E[0] * k, ISO_E[1] * k], v: [ISO_SE[0] * k, ISO_SE[1] * k] };
}

/** Axial → pixel offset, from the same basis (used with an origin). */
function isoOffset(q: number, r: number, size: number): { px: number; py: number } {
  const { u, v } = isoBasis(size);
  return { px: q * u[0] + r * v[0], py: q * u[1] + r * v[1] };
}

/** The painted face, measured from the tile art (source px, relative
 *  to face center, in angular order: TL, TR, R, BR, BL, L). */
const FACE_HEX: [number, number][] = [
  [-406, -468], [415, -468], [861, -6],
  [431, 476], [-431, 472], [-870, -6],
];

/** The six corners of the painted-face polygon around (cx, cy),
 *  optionally scaled about the center (pulses, double outlines). */
function hexCellVertices(cx: number, cy: number, size: number, scale = 1): [number, number][] {
  const k = (size / ISO_DEN) * scale;
  return FACE_HEX.map(([x, y]): [number, number] => [cx + x * k, cy + y * k]);
}

/** The fitted hex cell as an SVG points string. */
function hexCellPoints(cx: number, cy: number, size: number, scale = 1): string {
  return hexCellVertices(cx, cy, size, scale).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

interface Props {
  tenderItems: Awakened[];
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
  onUpdate: () => void;
}


// Dominant element of an Awoken, for corner motifs.
function dominantElement(a: Awakened): Element {
  const counts: Record<Element, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
  for (const layer of a.layers ?? []) {
    const el = elementForPiece(layer.name, (layer as any).element);
    counts[el] = (counts[el] ?? 0) + 1;
  }
  let best: Element = "root";
  let max = -1;
  for (const [el, n] of Object.entries(counts)) {
    if (n > max) { max = n; best = el as Element; }
  }
  return best;
}

export default function Territory({ tenderItems, assets, onUpdate }: Props) {
  const fireAspectImg = assets.find(a => a.category === "aspect" && (a as any).element === "fire" && /II/.test(a.name))?.imageUrl
    ?? assets.find(a => a.category === "aspect" && (a as any).element === "fire")?.imageUrl
    ?? null;
  const [selectedBuilding, setSelectedBuilding] = useState<any>(null);
  const [showBuildingMenu, setShowBuildingMenu] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialDone, setTutorialDone] = useState(() => localStorage.getItem("awoken-tutorial-done") === "1");
  const [showTutorial, setShowTutorial] = useState(false);
  const [objectivesMet, setObjectivesMet] = useState(false);
  const [buildings, setBuildings] = useState<any[]>([]);

  const [gameConfig, setGameConfig] = useState<any>(null);
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  // Safety: clear pendingTile if selectedBuilding is lost
  useEffect(() => {
    if (pendingTile !== null && !selectedBuilding) {
      setPendingTile(null);
      setSelectedBuilders([]);
    }
  }, [pendingTile, selectedBuilding]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [selectedBuilders, setSelectedBuilders] = useState<number[]>([]);
  const [tiles, setTiles] = useState<TerritoryTile[]>([]);
  // First-tile claim (fix list #3): a fresh Tender holds no ground — the
  // empty state is where the Last Bastion begins, not a dead end.
  const [territoryLoaded, setTerritoryLoaded] = useState(false);
  const [firstTeam, setFirstTeam] = useState<number[]>([]);
  const [firstClaimBusy, setFirstClaimBusy] = useState(false);
  const [firstClaimError, setFirstClaimError] = useState<string | null>(null);
  const [sparkAnimation, setSparkAnimation] = useState<{ phase: "center" | "fly" } | null>(null);
  const [fireFound, setFireFound] = useState(() => localStorage.getItem("awoken-fire-found") === "1");

  const handleSparkClick = async (tileId: number) => {
    try {
      const result = await api.claimSpark({ tileId });
      // Show animation: glyph center screen, then flies to attunement
      setSparkAnimation({ phase: "center" });
      setTimeout(() => setSparkAnimation({ phase: "fly" }), 1500);
      setTimeout(() => {
        setSparkAnimation(null);
        setFireFound(true);
        localStorage.setItem("awoken-fire-found", "1");
      }, 3000);
      // Refresh tiles
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      onUpdate();
    } catch (e) {
      console.error("Spark claim failed", e);
    }
  };

  // Check tutorial objectives
  useEffect(() => {
    if (!tutorialDone && !objectivesMet && tiles.length > 0) {
      if (tutorialComplete(tiles, buildings)) {
        setObjectivesMet(true);
      }
    }
  }, [tiles, buildings, tutorialDone, objectivesMet]);
  const [placements, setPlacements] = useState<FieldPlacement[]>([]);
  const [battlePool, setBattlePool] = useState<number[]>([]); // hand indices staged for battle, max 4
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [musicOn, setMusicOn] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [libraryTracks, setLibraryTracks] = useState<{ name: string; url: string }[]>([]);
  // Music's weather-mood trigger (Nigel, 2026-10-13): the server computes
  // the terrain playlist from the CURRENT world mood (her categorization,
  // see server musicMoods). The client holds refs alongside state so the
  // audio handlers never chase stale closures.
  const tracksRef = useRef<{ name: string; url: string }[]>([]);
  const trackIdxRef = useRef(0);
  const moodSeenRef = useRef<string | null>(null);
  const fadeAudio = (audio: HTMLAudioElement, to: number, ms = 1200, done?: () => void) => {
    const from = audio.volume;
    const steps = 12;
    let i = 0;
    const iv = window.setInterval(() => {
      i++;
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { window.clearInterval(iv); done?.(); }
    }, ms / steps);
  };
  const playSongAt = (idx: number) => {
    const tracks = tracksRef.current;
    if (!tracks.length) return;
    const i = ((idx % tracks.length) + tracks.length) % tracks.length;
    trackIdxRef.current = i;
    setTrackIdx(i);
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = false;
      audioRef.current.onended = () => playSongAt(trackIdxRef.current + 1);
    }
    const a = audioRef.current;
    a.src = tracks[i].url;
    a.volume = 0.4;
    a.play().catch(() => {});
  };
  const applyPlaylist = (pl: { tracks: { name: string; url: string }[] }) => {
    tracksRef.current = pl.tracks;
    setLibraryTracks(pl.tracks);
    trackIdxRef.current = 0;
    setTrackIdx(0);
  };
  // Load the mood's playlist for the terrain page and arm the music
  useEffect(() => {
    api.getTerrainPlaylist().then(pl => {
      moodSeenRef.current = pl.mood;
      applyPlaylist(pl);
      if (pl.tracks.length) setMusicOn(true); // starts on first toggle tap (browser gesture rule), as before
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The trigger: when a fetched mood differs from the last one seen, the
  // weather has turned — re-ask for the playlist and, if the music is
  // sounding, crossfade the song over to the new mood's keeping.
  useEffect(() => {
    const iv = window.setInterval(async () => {
      try {
        const m = await api.getMood();
        if (!moodSeenRef.current) { moodSeenRef.current = m.mood; return; }
        if (m.mood === moodSeenRef.current) return;
        moodSeenRef.current = m.mood;
        setMood(m);
        const pl = await api.getTerrainPlaylist();
        const sounding = !!audioRef.current && !audioRef.current.paused;
        applyPlaylist(pl);
        if (sounding) {
          const a = audioRef.current!;
          fadeAudio(a, 0, 1200, () => playSongAt(0));
        }
      } catch {}
    }, 60000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [energy, setEnergy] = useState(10);
  const refreshEnergy = async () => {
    try {
      const { energy: e } = await api.getEnergy();
      setEnergy(e);
    } catch {}
  };
  const [selectedAwoken, setSelectedAwoken] = useState<number | null>(null); // awakenedId selected on field
  const [applyingAspect, setApplyingAspect] = useState<any | null>(null); // aspect orb selected, tap Awoken to apply
  const [applyingToTarget, setApplyingToTarget] = useState<number | null>(null); // if set, orb tap applies directly to this Awoken ID
  const [celebration, setCelebration] = useState<any | null>(null);
  const [attackTargeting, setAttackTargeting] = useState(false); // true when attack stance Awoken awaits target
  // The hex currently targeted in a tap-to-target flow (fix list #13) —
  // set on the very tap that chooses it, cleared when the flow ends or
  // is cancelled, so the gold marker never lags a server round-trip.
  const [targetHexId, setTargetHexId] = useState<number | null>(null);
  // #13 refined (Nigel): it is about the hex you are ABOUT to touch.
  // Input modality decides the manners: desktop glows on hover and
  // shines on click (commit at once); touch has no hover, so the
  // first tap raises a MIST preview and a confirm bar commits.
  const [touchMode, setTouchMode] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      // An iPad is a touch device even when a keyboard makes its PRIMARY
      // pointer report "fine", and webviews disagree with Safari here —
      // (pointer: coarse) alone left Nigel's iPad on the desktop path
      // (2026-10-14: card readied, tap deployed-or-died invisibly, no
      // mist, no confirm bar). Any touch capability earns touch manners:
      // the mist + confirm flow is strictly safer than instant commit.
      const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      return coarse || navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    }
  );
  const [hoverHexId, setHoverHexId] = useState<number | null>(null);
  const [hexConfirm, setHexConfirm] = useState<{ kind: "attack" | "move" | "deploy"; tileId: number } | null>(null);
  const raiseHexConfirm = (kind: "attack" | "move" | "deploy", tileId: number) => setHexConfirm({ kind, tileId });
  const clearHexConfirm = () => setHexConfirm(null);
  // Refusals must SPEAK (Nigel's iPad, 2026-10-14: "I tapped to place and
  // nothing happened at all"). Every guard on the hex flows — staging,
  // energy, and every server refusal — lands here in words, never in a
  // silent return or a console line the player will never see.
  const [hexNotice, setHexNotice] = useState<string | null>(null);
  const hexNoticeTimer = useRef<number | null>(null);
  const showHexNotice = (msg: string) => {
    setHexNotice(msg);
    if (hexNoticeTimer.current) window.clearTimeout(hexNoticeTimer.current);
    hexNoticeTimer.current = window.setTimeout(() => setHexNotice(null), 7000);
  };
  const refusalText = (e: unknown, fallback: string) =>
    (e as { message?: string })?.message && (e as { message?: string }).message !== "Failed to fetch"
      ? (e as { message?: string }).message as string
      : fallback;
  const runHexConfirm = () => {
    const pending = hexConfirm;
    if (!pending) return;
    setHexConfirm(null);
    // The mist gives way to the committed shine while it resolves.
    setTargetHexId(pending.tileId);
    if (pending.kind === "attack") handleAttack(pending.tileId);
    else if (pending.kind === "move") handleMove(pending.tileId);
    else handleDeploy(pending.tileId);
  };
  const [stanceMinimized, setStanceMinimized] = useState(false); // bubble collapses after stance pick
  const [moveTargeting, setMoveTargeting] = useState(false); // true when move mode awaits target tile
  const [wave, setWave] = useState<{ waveNumber: number; wavesDefeated: number; frayCount: number; unravelers: number; totalPower: number; nextWaveAt?: string | null; hollows?: number; tangles?: number; isBoss?: boolean; bossLevel?: number } | null>(null);
  // Wave simulation (preview only, no DB changes)
  const [simActive, setSimActive] = useState(false);
  const [battleActive, setBattleActive] = useState(false);
  const [battleWave, setBattleWave] = useState(0);
  const [battleUnits, setBattleUnits] = useState<typeof simUnits>([]);
  const [betweenWaves, setBetweenWaves] = useState(false);
  const [turnPhase, setTurnPhase] = useState<"towers" | "initiative" | "enemies" | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [wavesCleared, setWavesCleared] = useState(0);
  const [bossLevel, setBossLevel] = useState(1);
  const [isBossFight, setIsBossFight] = useState(false);
  const [tileHp, setTileHp] = useState<Map<number, number>>(new Map());
  const [awokenHp, setAwokenHp] = useState<Map<number, number>>(new Map());
  const [battlePaused, setBattlePaused] = useState(false);
  const [battleSpeed, setBattleSpeed] = useState(1.3);
  const [battleManual, setBattleManual] = useState(false);
  // Cached tile positions for battle performance (tileId -> {cx, cy, q, r})
  const tilePosCache = useRef<Map<number, { cx: number; cy: number; q: number; r: number }>>(new Map());
  // Cached tile objects by ID (avoids tiles.find in hot loops)
  const tileByIdCache = useRef<Map<number, any>>(new Map());
  const [simUnits, setSimUnits] = useState<Array<{ id: number; type: string; tileId: number; hp: number; maxHp: number; power: number; x: number; y: number; targetX: number; targetY: number }>>([]);
  const simRef = useRef<{ units: typeof simUnits; timer: any } | null>(null);
  const battleRef = useRef<{ timer: any } | null>(null);
  const [waveResult, setWaveResult] = useState<{ victory: boolean; wavePower: number; defensePower: number } | null>(null);
  const [showBindingPrompt, setShowBindingPrompt] = useState(false);
  const [showBattleground, setShowBattleground] = useState(false);
  const [bonusTiles, setBonusTiles] = useState<{ id: number; q: number; r: number }[]>([]);
  const battleResolvedRef = useRef(false);
  const [legends, setLegends] = useState<{ champion: Awakened | null; legends: { id: number; awakenedId: number; deed: string; count: number; awokenName: string }[] }>({ champion: null, legends: [] });
  const [showChampionPicker, setShowChampionPicker] = useState(false);
  const [showChampionTab, setShowChampionTab] = useState(false);

  const [showAspects, setShowAspects] = useState(false);
  const [returnReport, setReturnReport] = useState<{ awakenedId: number; text: string } | null>(null);
  const [mood, setMood] = useState<{ mood: string; description: string; endsAt: string } | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [wavePullTile, setWavePullTile] = useState<number | null>(null);
  const [waveTarget, setWaveTarget] = useState<{ tile: { id: number; q: number; r: number } | null; defenderIds: number[] } | null>(null);
  const [showTargetMap, setShowTargetMap] = useState(false);

  // Hand = Awoken not on field
  const placedIds = useMemo(() => new Set(placements.map(p => p.awakenedId)), [placements]);
  const hand = useMemo(() => tenderItems.filter(a => !placedIds.has(a.id)), [tenderItems, placedIds]);

  // Energy cap: 10 base + power-based bonus per Awoken (hand AND field).
  // TRIPLED 2026-10-13 (Nigel): 1-3 power: +3, 4-6: +6, 7-9: +9, 10+: +12.
  // Stronger beings contribute more existence. Mirrors the server's
  // calculateMaxEnergy — the two must agree.
  // Defenders generate +1 max energy each — they hold the line and gather strength.
  const energyBonus = (power: number) => 3 + 3 * Math.floor((power - 1) / 3);
  const fieldAwoken = placements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
  const defenderCount = placements.filter(p => p.stance === "defense").length;
  const maxEnergy = 10
    + hand.reduce((sum, a) => sum + energyBonus(a.power), 0)
    + fieldAwoken.reduce((sum, a) => sum + energyBonus(a.power), 0)
    + defenderCount;

  // Deploy cost scales with power: 2 base + 1 per 3 power.
  // 1-3: 2, 4-6: 3, 7-9: 4, 10+: 5.
  const deployCost = (power: number) => 2 + Math.floor((power - 1) / 3);

  // Whisper state: which field Awoken is speaking
  const [whisper, setWhisper] = useState<{ awakenedId: number; text: string } | null>(null);

  useEffect(() => {
    api.getLegends().then(setLegends).catch(() => {});
    // Return report: an Awoken speaks of buildings and needs
    api.getTerritory().then(t => {
      if (t.mood) { setMood(t.mood); moodSeenRef.current = t.mood.mood; }
      const fieldAwoken = t.placements.map((p: any) => p.awakenedId);
      if (!fieldAwoken.length) return;
      const buildings = t.buildings ?? [];
      const hasBuildings = buildings.length > 0;
      const hasWatchtower = buildings.some((b: any) => b.type === "watchtower");
      const hasDefense = buildings.some((b: any) => b.type === "thorn_wall" || b.type === "watchtower");
      const curseNear = t.tiles.some((tile: any) => tile.cursed);
      const text = pickReturnReport(hasBuildings, hasWatchtower, curseNear, hasDefense);
      if (text) {
        const speaker = fieldAwoken[Math.floor(Math.random() * fieldAwoken.length)];
        setReturnReport({ awakenedId: speaker, text });
        // Clear after 12 seconds
        setTimeout(() => setReturnReport(null), 12000);
      }
    }).catch(() => {});
    refreshEnergy();
    const onFocus = () => refreshEnergy();
    window.addEventListener("focus", onFocus);
    if (tiles.length) {
      api.getWave().then(w => {
        setWave(w);
        // After 3 victories, prompt the binding — it protects tiles from waves.
        if (w.wavesDefeated >= 3 && !localStorage.getItem("bindingPromptSeen")) {
          setShowBindingPrompt(true);
        }
      }).catch((e) => {
        console.error("[Territory] getWave failed:", e);
      });
    } else {
      console.warn("[Territory] Skipping getWave: tiles.length is 0");
    }
    return () => window.removeEventListener("focus", onFocus);
  }, [tiles.length]);

  // Load buildings + game config
  useEffect(() => {
    api.getBuildings().then(r => setBuildings(r.buildings)).catch(() => {});
    api.call("getGameConfig", {}).then(setGameConfig).catch(() => {});
  }, []);

  // Field Awoken whisper from time to time (only on field, never in hand)
  useEffect(() => {
    if (placements.length === 0) return;
    const whisperTimer = setInterval(() => {
      const placement = placements[Math.floor(Math.random() * placements.length)];
      setWhisper({ awakenedId: placement.awakenedId, text: randomWhisper() });
      setTimeout(() => setWhisper(null), 7000);
    }, 20000 + Math.random() * 15000);
    return () => clearInterval(whisperTimer);
  }, [placements]);

  useEffect(() => {
    api.getTerritory().then(({ tiles, placements }) => {
      setTiles(tiles); setPlacements(placements);
    }).catch((e) => {
      console.error("[Territory] getTerritory failed:", e);
    }).finally(() => setTerritoryLoaded(true));
  }, []);

  // Hand = Awoken not on field (defined above for energy calc)

  const handleDeploy = async (tileId: number) => {
    if (battlePool.length === 0) return;
    const tile = tiles.find(t => t.id === tileId);
    if (!tile) return;
    const fighters = battlePool.map(i => hand[i]).filter(Boolean);
    if (fighters.length === 0) return;
    const totalCost = fighters.reduce((sum, a) => sum + deployCost(a.power), 0);
    if (energy < totalCost) {
      showHexNotice(`This company needs ${totalCost}⚡ to take the field — you hold ${energy}⚡. Energy returns with time, and with the Awoken you keep in hand.`);
      return;
    }
    const fighterIds = fighters.map(a => a.id);
    try {
      const result = await api.deployBattle({ awakenedIds: fighterIds, tileId });
      await refreshEnergy();
      const after = await api.getTerritory();
      setTiles(after.tiles);
      setPlacements(after.placements);
      setBattlePool([]);
      setTargetHexId(null);
      // If the dark broke, a newborn joins the hand. Server-side, fire-and-forget —
      // it can never hang the purification.
      if (result.purified) {
        const liberatorNames = fighters.map(a => a.name);
        api.birthNewbornToHand({ tileId, liberatorNames }).catch(e =>
          console.error("[Birth] Newborn failed — game continues", e)
        );
      }
      onUpdate();
    } catch (e) {
      console.error("Battle deployment failed", e);
      setTargetHexId(null);
      showHexNotice(refusalText(e, "The deployment was refused."));
    }
  };

  // First-tile claim (fix list #3): the company faces the Unraveler
  // through the live server path — claimFirstTile measures the team's
  // true power itself; the client only gathers the company. On victory
  // the newborn step follows, exactly as after a battle purification.
  const handleFirstClaim = async () => {
    if (firstClaimBusy || firstTeam.length === 0) return;
    setFirstClaimBusy(true);
    setFirstClaimError(null);
    try {
      await api.claimFirstTile({ teamIds: firstTeam });
      const after = await api.getTerritory();
      setTiles(after.tiles);
      setPlacements(after.placements);
      const center = after.tiles.find(t => t.q === 0 && t.r === 0);
      if (center) {
        const liberatorNames = firstTeam
          .map(id => tenderItems.find(a => a.id === id)?.name)
          .filter((n): n is string => !!n);
        api.birthNewbornToHand({ tileId: center.id, liberatorNames }).catch(e =>
          console.error("[Birth] Newborn failed — game continues", e)
        );
      }
      setFirstTeam([]);
      onUpdate();
    } catch (e) {
      setFirstClaimError(e instanceof Error ? e.message : "The Unraveler would not yield.");
    } finally {
      setFirstClaimBusy(false);
    }
  };

  const handleSetStance = async (awakenedId: number, stance: "attack" | "defense" | "binding") => {
    setStanceMinimized(true); // collapse bubble so tiles behind are clickable
    try {
      await api.setStance({ awakenedId, stance, maxEnergy });
      await refreshEnergy();
      const refreshed = await api.getTerritory();
      setPlacements(refreshed.placements);
      if (stance === "attack") {
        setAttackTargeting(true);
      } else {
        setAttackTargeting(false);
      }

    } catch (e) {
      console.error("Stance change failed", e);
    }
  };

  const handleAttack = async (tileId: number) => {
    if (selectedAwoken === null) return;
    if (energy < 1) { // Attacks cost 1 energy
      showHexNotice("A strike costs 1⚡ — your energy is spent. It returns with time.");
      return;
    }
    try {
      const result = await api.attackTile({ awakenedId: selectedAwoken, tileId }) as any;
      await refreshEnergy();
      // Thorns land server-side now: mirror the authoritative attacker HP
      // the server returns. At 0 HP the server has already dissipated the
      // attacker back to hand — the refreshed placements below show it.
      if (typeof result.attackerHp === "number") {
        setAwokenHp(prev => new Map(prev).set(selectedAwoken, result.attackerHp));
      } else if (result.thornsDamage > 0) {
        setAwokenHp(prev => {
          const next = new Map(prev);
          const current = next.get(selectedAwoken) ?? 3;
          next.set(selectedAwoken, Math.max(0, current - result.thornsDamage));
          return next;
        });
      }
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements);
      if (result.wavePull) {
        // Pulled into the Unraveling! Open a wave battle for this tile.
        setWavePullTile(result.tileId);
        setShowBattleground(true);
      } else if (result.purified) {
        api.birthNewbornToHand({ tileId, liberatorNames: [] }).catch(() => {});
      }
      setSelectedAwoken(null);
      setAttackTargeting(false);
      setTargetHexId(null);
      onUpdate();
    } catch (e) {
      console.error("Attack failed", e);
      showHexNotice(refusalText(e, "That strike was refused."));
      setAttackTargeting(false);
      setTargetHexId(null);
    }
  };

  // Move cost: 1 energy for small Awoken, up to 4 for fully powered.
  const moveCost = (power: number) => 1 + Math.floor((power - 1) / 3);

  const handleMove = async (tileId: number) => {
    if (selectedAwoken === null) return;
    const awoken = tenderItems.find(a => a.id === selectedAwoken);
    if (!awoken) return;
    const cost = moveCost(awoken.power);
    if (energy < cost) {
      showHexNotice(`${awoken.name} needs ${cost}⚡ to move — you hold ${energy}⚡.`);
      return;
    }
    try {
      await api.moveAwoken({ awakenedId: selectedAwoken, tileId });
      await refreshEnergy();
      const refreshed = await api.getTerritory();
      setPlacements(refreshed.placements);
      setSelectedAwoken(null);
      setMoveTargeting(false);
      setTargetHexId(null);
      onUpdate();
    } catch (e) {
      console.error("Move failed", e);
      showHexNotice(refusalText(e, "That move was refused."));
      setMoveTargeting(false);
      setTargetHexId(null);
    }
  };

  const handleDefend = async (isBoss = false, bossLvl = 1) => {
    // Always ensure wave data — create a default if fetch fails
    let w = wave;
    if (isBoss) {
      try {
        const bw: any = await api.call("getBossWave", { bossLevel: bossLvl });
        w = {
          waveNumber: bw.waveNumber,
          wavesDefeated: 0,
          frayCount: bw.frayCount,
          unravelers: bw.unravelers,
          totalPower: bw.totalPower,
          hollows: bw.hollows,
          tangles: bw.tangles,
          isBoss: true,
          bossLevel: bossLvl,
        };
        setWave(w);
      } catch (e) {
        console.error("Boss wave fetch failed", e);
      }
    }
    if (!w) {
      try {
        w = await api.getWave();
        setWave(w);
      } catch (e) {
        console.error("Failed to get wave, using default", e);
        // Default wave: wave 1, 7 Fray
        w = { waveNumber: 1, wavesDefeated: 0, frayCount: 7, unravelers: 0, totalPower: 7 };
        setWave(w);
      }
    }
    // Phase 1: Try to get the targeted territory (with 5s timeout)
    try {
      const targetPromise = api.getWaveTarget();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("getWaveTarget timeout")), 5000)
      );
      const target = await Promise.race([targetPromise, timeoutPromise]) as Awaited<ReturnType<typeof api.getWaveTarget>>;
      if (target.tile) {
        setWaveTarget(target);
        setShowTargetMap(true);
      } else {
        // No territory — open battleground directly with client fallback
        console.warn("No target tile, using client fallback");
        setWaveTarget(null);
        setShowBattleground(true);
      }
    } catch (e) {
      console.error("Failed to get wave target, opening battleground directly", e);
      // Fallback: open battleground — client will pick a target tile
      setWaveTarget(null);
      setShowBattleground(true);
    }
  };

  const handleTargetConfirmed = () => {
    // Phase 2: Open the battleground with the target's defenders
    setShowTargetMap(false);
    setShowBattleground(true);
  };

  // === WAVE SIMULATION (preview only) ===
  const simTilePos = (t: any) => {
    const size = 24 * zoom;
    const HEIGHT_PX = 22 * zoom;
    const originX = 250, originY = 170;
    const { px, py } = isoOffset(t.q, t.r, size);
    return { cx: originX + px + pan.x, cy: originY + py + pan.y - (t.height || 0) * HEIGHT_PX };
  };
  const startSim = () => {
    if (!wave || !tiles.length) return;
    // Find cursed perimeter tiles (cursed tiles adjacent to purified)
    const cursed = tiles.filter(t => t.cursed);
    const purified = tiles.filter(t => !t.cursed);
    if (!cursed.length || !purified.length) return;
    
    // Spawn unravelers on random cursed tiles.
    // Enemy stats come from the one source of truth: gameConfig.enemies
    // (workshop-overridable; fallbacks match the design law — Fray power 1).
    const units: typeof simUnits = [];
    let id = 0;
    const frayCfg = (gameConfig as any)?.enemies?.["fray"] ?? { power: 1, hp: 3 };
    const unravCfg = (gameConfig as any)?.enemies?.["unraveler"] ?? { power: 4, hp: 6 };
    for (let i = 0; i < wave.frayCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "fray", tileId: tile.id, hp: frayCfg.hp, maxHp: frayCfg.hp, power: frayCfg.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    for (let i = 0; i < wave.unravelers; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "unraveler", tileId: tile.id, hp: unravCfg.hp, maxHp: unravCfg.hp, power: unravCfg.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    
    setSimUnits(units);
    setSimActive(true);
    
    // Get tower/defender info
    const watchtowers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
    const thornWalls = buildings.filter(b => b.buildingType === "thorn-wall" && b.status === "active");
    const simTowerDamage = (gameConfig as any)?.buildings?.["watchtower"]?.damage ?? 3;
    const simTowerBonus = (gameConfig as any)?.buildings?.["watchtower"]?.powerBonus ?? 2;
    const simThornDamage = (gameConfig as any)?.buildings?.["thorn-wall"]?.damage ?? 1;
    
    // Track which units have been hit by volley (once per tower)
    const volleyHit = new Set<string>();
    
    // Animation loop: move toward center, apply defenses
    const timer = setInterval(() => {
      setSimUnits(prev => {
        if (!prev.length) {
          clearInterval(timer);
          setSimActive(false);
          return prev;
        }
        const center = tiles.find(t => t.q === 0 && t.r === 0) || purified[0];
        const { cx: ccx, cy: ccy } = simTilePos(center);
        
        return prev.map(u => {
          const dx = ccx - u.x;
          const dy = ccy - u.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 5) return u;
          const speed = 1.5;
          const nx = u.x + (dx/dist) * speed;
          const ny = u.y + (dy/dist) * speed;
          let hp = u.hp;
          
          // Find current tile (closest tile to unit position)
          let closestTile = null;
          let closestDist = Infinity;
          for (const t of tiles) {
            const { cx, cy } = simTilePos(t);
            const d = Math.sqrt((nx-cx)**2 + (ny-cy)**2);
            if (d < closestDist) { closestDist = d; closestTile = t; }
          }
          
          if (closestTile) {
            // Watchtower volley: 3 damage once per tower when in range (own + adjacent)
            for (const wt of watchtowers) {
              const wtTile = tiles.find(t => t.id === wt.tileId);
              if (!wtTile) continue;
              const dq = Math.abs(wtTile.q - closestTile.q);
              const dr = Math.abs(wtTile.r - closestTile.r);
              const inRange = (dq <= 1 && dr <= 1);
              const key = `${wt.id}-${u.id}`;
              if (inRange && !volleyHit.has(key)) {
                volleyHit.add(key);
                hp -= simTowerDamage;
              }
            }
            // Thorn Wall: 1 damage when entering tile
            const wall = thornWalls.find(w => w.tileId === closestTile.id);
            if (wall && u.tileId !== closestTile.id) {
              hp -= simThornDamage;
            }
            // Defenders: Awoken on tile deal full power as damage per tick
            // Enemies are stopped (don't advance) while defenders are present
            const defenders = placements.filter(p => p.tileId === closestTile.id && (p.stance === "defense" || p.stance === "attack"));
            if (defenders.length > 0) {
              const nearTower = watchtowers.some(wt => {
                const wtTile = tiles.find(t => t.id === wt.tileId);
                return wtTile && Math.abs(wtTile.q - closestTile.q) <= 1 && Math.abs(wtTile.r - closestTile.r) <= 1;
              });
              for (const d of defenders) {
                const aw = tenderItems.find(a => a.id === d.awakenedId);
                if (aw) {
                  hp -= ((aw.power || 3) + (nearTower ? simTowerBonus : 0)) * 0.5; // Meaningful damage per tick
                }
              }
              // Don't move while defenders hold the tile
              return { ...u, x: u.x, y: u.y, hp, tileId: closestTile?.id ?? u.tileId };
            }
          }
          
          return { ...u, x: nx, y: ny, hp, tileId: closestTile?.id ?? u.tileId };
        }).filter(u => u.hp > 0);
      });
    }, 50);
    
    simRef.current = { units, timer };
  };
  
  const stopSim = () => {
    if (simRef.current?.timer) clearInterval(simRef.current.timer);
    setSimActive(false);
    setSimUnits([]);
  };

  /** Start a single wave (turn-based). */
  const startBattle = () => {
    if (!wave || !tiles.length || battleActive) return;
    setBattleActive(true);
    setBattleWave(wavesCleared + 1);
    setTurnNumber(1);
    spawnBattleWave(wavesCleared + 1);
  };

  /** Hex distance for range calculations. */
  const hexDist = (a: { q: number; r: number }, b: { q: number; r: number }) => {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  };

  /** Get cached tile position (fast). */
  const getTilePos = (tileId: number) => tilePosCache.current.get(tileId);
  /** Get cached tile object (fast, avoids tiles.find). */
  const getTile = (tileId: number) => tileByIdCache.current.get(tileId);

  /** Spawn a battle wave on cursed tiles. */
  const spawnBattleWave = (waveNum: number) => {
    const cursed = tiles.filter(t => t.cursed);
    if (!cursed.length) return;
    // Cache all tile positions and objects once (performance)
    tilePosCache.current.clear();
    tileByIdCache.current.clear();
    for (const t of tiles) {
      const { cx, cy } = simTilePos(t);
      tilePosCache.current.set(t.id, { cx, cy, q: t.q, r: t.r });
      tileByIdCache.current.set(t.id, t);
    }
    const units: typeof simUnits = [];
    let id = Date.now();
    const frayCfgB = (gameConfig as any)?.enemies?.["fray"] ?? { power: 1, hp: 3 };
    const unravCfgB = (gameConfig as any)?.enemies?.["unraveler"] ?? { power: 4, hp: 6 };
    const frayCount = wave!.frayCount + (waveNum - 1) * 2;
    const unravelerCount = wave!.unravelers + (waveNum - 1);
    for (let i = 0; i < frayCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "fray", tileId: tile.id, hp: frayCfgB.hp, maxHp: frayCfgB.hp, power: frayCfgB.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    for (let i = 0; i < unravelerCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      // Wave scaling rides on the config base HP, as before.
      units.push({ id: id++, type: "unraveler", tileId: tile.id, hp: unravCfgB.hp + waveNum * 2, maxHp: unravCfgB.hp + waveNum * 2, power: unravCfgB.power, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    setBattleUnits(units);
    setTurnPhase("towers");
    // Auto-advance through phases with delays for readability
    setTimeout(() => doTowerPhase(), 800);
  };

  /** Phase 1: All towers fire at range 3. */
  const doTowerPhase = () => {
    const watchtowers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
    const wtDamage = (gameConfig as any)?.buildings?.["watchtower"]?.damage ?? 3;
    setBattleUnits(prev => {
      let updated = [...prev];
      for (const wt of watchtowers) {
        const wtTile = getTile(wt.tileId);
        if (!wtTile) continue;
        // Find closest enemy within range 3
        let best: typeof updated[0] | null = null;
        let bestDist = 4;
        for (const u of updated) {
          const uTile = getTile(u.tileId);
          if (!uTile) continue;
          const d = hexDist(wtTile, uTile);
          if (d <= 3 && d < bestDist) { bestDist = d; best = u; }
        }
        if (best) {
          updated = updated.map(u => u.id === best!.id ? { ...u, hp: u.hp - wtDamage } : u).filter(u => u.hp > 0);
        }
      }
      return updated;
    });
    setTurnPhase("initiative");
    setTimeout(() => doInitiativePhase(), battleSpeed * 1000);
  };

  /** Phase 2: Awoken and enemies act in initiative order (lower toughness = faster). */
  const doInitiativePhase = () => {
    if (battlePaused) { setTimeout(() => doInitiativePhase(), 500); return; }

    const fighters = placements
      .filter(p => p.stance === "attack" || p.stance === "defense")
      .map(p => {
        const aw = tenderItems.find(a => a.id === p.awakenedId);
        const tile = tiles.find(t => t.id === p.tileId);
        return aw && tile ? { ...p, aw, tile, initiative: aw.toughness || 3, isAwoken: true } : null;
      })
      .filter(Boolean) as any[];

    // Initialize Awoken HP if not set (HP = toughness)
    setAwokenHp(prev => {
      const next = new Map(prev);
      for (const f of fighters) {
        if (!next.has(f.awakenedId)) {
          next.set(f.awakenedId, (f.aw.toughness || 3));
        }
      }
      return next;
    });

    setBattleUnits(prev => {
      const combatants: any[] = [
        ...fighters.map(f => ({ ...f, toughness: f.initiative })),
        ...prev.map(u => ({ ...u, toughness: u.type === "fray" ? 1 : 3, isAwoken: false })),
      ].sort((a, b) => a.toughness - b.toughness);

      let updated = [...prev];
      const purified = tiles.filter(t => !t.cursed);
      const towers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
      // Watchtower aura: defenders on the tower's tile or adjacent fight at
      // +powerBonus (config-driven). Thorn walls bite enemies entering.
      const towerBonus = (gameConfig as any)?.buildings?.["watchtower"]?.powerBonus ?? 2;
      const towerAura = new Set<number>();
      for (const t of towers) {
        const tt = tiles.find(ti => ti.id === t.tileId);
        if (!tt) continue;
        for (const tile of tiles) if (hexDist(tt, tile) <= 1) towerAura.add(tile.id);
      }
      const thornDmg = (gameConfig as any)?.buildings?.["thorn-wall"]?.damage ?? 1;
      const thornWallTiles = new Set(buildings.filter(b => b.buildingType === "thorn-wall" && b.status === "active").map(b => b.tileId));

      for (const c of combatants) {
        if (c.isAwoken) {
          // Awoken: fire at range with -1 per hex penalty
          let best: typeof updated[0] | null = null;
          let bestDmg = 0;
          for (const u of updated) {
            const uTile = getTile(u.tileId);
            if (!uTile) continue;
            const d = hexDist(c.tile, uTile);
            // Exponential falloff: damage = power * 0.65^distance (min 1)
            const effPower = (c.aw.power || 3) + (towerAura.has(c.tile.id) ? towerBonus : 0);
            const dmg = Math.max(1, Math.round(effPower * Math.pow(0.65, d)));
            if (dmg > bestDmg) { bestDmg = dmg; best = u; }
          }
          if (best) {
            updated = updated.map(u => u.id === best!.id ? { ...u, hp: u.hp - bestDmg } : u).filter(u => u.hp > 0);
          }
        } else {
          // Enemy targeting: check for corruptible hex in reach first
          const uTile = getTile(c.tileId);
          if (!uTile) continue;

          // Find corruptible hexes (purified, no defenders/towers) within 2 hexes
          let targetHex = null;
          for (const p of purified) {
            const d = hexDist(uTile, p);
            if (d <= 2) {
              const hasDefenders = placements.some(pl =>
                pl.tileId === p.id && (pl.stance === "attack" || pl.stance === "defense")
              );
              const hasTower = towers.some(t => {
                const tt = tiles.find(ti => ti.id === t.tileId);
                return tt && hexDist(tt, p) <= 1;
              });
              if (!hasDefenders && !hasTower) { targetHex = p; break; }
            }
          }

          if (targetHex) {
            // Move toward corruptible hex (away from defenders)
            const dq = Math.sign(targetHex.q - uTile.q);
            const dr = Math.sign(targetHex.r - uTile.r);
            const next = tiles.find(t =>
              Math.abs(t.q - (uTile.q + dq)) <= 1 && Math.abs(t.r - (uTile.r + dr)) <= 1 &&
              t.id !== uTile.id
            );
            if (next) {
              const { cx, cy } = simTilePos(next);
              updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id, hp: u.hp - (thornWallTiles.has(next.id) ? thornDmg : 0) } : u).filter(u => u.hp > 0);
              // If reached the hex, attack purification
              if (next.id === targetHex.id) {
                damageTile(next.id, c.power || 2);
              }
            }
          } else {
            // No corruptible hex: prioritize attacking Awoken/towers
            let bestTarget: any = null;
            let bestDist = Infinity;
            // Find nearest fighter
            for (const f of fighters) {
              const d = hexDist(uTile, f.tile);
              if (d < bestDist) { bestDist = d; bestTarget = { type: "awoken", ...f }; }
            }
            // Find nearest tower
            for (const t of towers) {
              const tt = tiles.find(ti => ti.id === t.tileId);
              if (!tt) continue;
              const d = hexDist(uTile, tt);
              if (d < bestDist) { bestDist = d; bestTarget = { type: "tower", tile: tt }; }
            }

            if (bestTarget && bestDist <= 1) {
              // Attack!
              if (bestTarget.type === "awoken") {
                damageAwoken(bestTarget.awakenedId, c.power || 2);
              }
              // Towers don't have HP yet — skip
            } else if (bestTarget) {
              // Move toward target
              const dq = Math.sign(bestTarget.tile.q - uTile.q);
              const dr = Math.sign(bestTarget.tile.r - uTile.r);
              const next = tiles.find(t =>
                Math.abs(t.q - (uTile.q + dq)) <= 1 && Math.abs(t.r - (uTile.r + dr)) <= 1 &&
                t.id !== uTile.id
              );
              if (next) {
                const { cx, cy } = simTilePos(next);
                updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id, hp: u.hp - (thornWallTiles.has(next.id) ? thornDmg : 0) } : u).filter(u => u.hp > 0);
              }
            } else {
              // No targets: move toward center
              const center = tiles.find(t => t.q === 0 && t.r === 0) || purified[0];
              if (center) {
                const dq = Math.sign(center.q - uTile.q);
                const dr = Math.sign(center.r - uTile.r);
                const next = tiles.find(t =>
                  Math.abs(t.q - (uTile.q + dq)) <= 1 && Math.abs(t.r - (uTile.r + dr)) <= 1 &&
                  t.id !== uTile.id
                );
                if (next) {
                  const { cx, cy } = simTilePos(next);
                  updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id, hp: u.hp - (thornWallTiles.has(next.id) ? thornDmg : 0) } : u).filter(u => u.hp > 0);
                }
              }
            }
          }
        }
      }
      return updated;
    });

    if (!battleManual) {
      setTimeout(() => endTurn(), battleSpeed * 1000);
    }
  };

  /** Damage a tile (10 HP, visible when <10). Syncs to server. */
  const damageTile = async (tileId: number, dmg: number) => {
    try {
      const { hp, cursed } = await api.damageTileHp({ tileId, damage: Math.round(dmg) });
      setTileHp(prev => new Map(prev).set(tileId, hp));
      if (cursed) {
        // Tile fell — refresh territory
        onUpdate();
      }
    } catch (e) {
      console.error("Tile damage sync failed", e);
      // Fallback to local
      setTileHp(prev => {
        const next = new Map(prev);
        next.set(tileId, Math.max(0, (next.get(tileId) ?? 10) - dmg));
        return next;
      });
    }
  };

  /** Damage an Awoken (defends tile first). Syncs to server. */
  const damageAwoken = async (awakenedId: number, dmg: number) => {
    try {
      const { hp } = await api.damageAwokenHp({ awakenedId, damage: Math.round(dmg) });
      setAwokenHp(prev => new Map(prev).set(awakenedId, hp));
    } catch (e) {
      console.error("Awoken damage sync failed", e);
      setAwokenHp(prev => {
        const next = new Map(prev);
        next.set(awakenedId, Math.max(0, (next.get(awakenedId) ?? 6) - dmg));
        return next;
      });
    }
  };

  /** Curse a tile that hit 0 HP. */
  const curseTile = (tileId: number) => {
    // TODO: call server to curse the tile
    console.log(`[battle] Tile ${tileId} falls to curse!`);
  };

  /** End of turn: check win/loss, or next turn. */
  const endTurn = () => {
    setBattleUnits(prev => {
      if (prev.length === 0) {
        // Wave cleared!
        setTimeout(() => onWaveCleared(), 100);
        return prev;
      }
      // Next turn
      setTurnNumber(t => t + 1);
      setTurnPhase("towers");
      setTimeout(() => doTowerPhase(), battleSpeed * 1000);
      return prev;
    });
  };

  /** Called when a wave is cleared. */
  const onWaveCleared = () => {
    const cleared = wavesCleared + 1;
    setWavesCleared(cleared);
    setBattleActive(false);
    setBattleUnits([]);
    setTurnPhase(null);
    if (cleared >= 3) {
      // All 3 waves cleared — boss stage available
      console.log("[battle] All waves cleared! Boss available.");
    }
    // Binding heal between waves
    doBindingHeal();
  };

  /** Binding Awoken heal: total power divided by wounded Awoken in hex + adjacent. */
  const doBindingHeal = () => {
    const binders = placements.filter(p => p.stance === "binding");
    if (!binders.length) return;
    setAwokenHp(prev => {
      const next = new Map(prev);
      for (const b of binders) {
        const bAw = tenderItems.find(a => a.id === b.awakenedId);
        const bTile = tiles.find(t => t.id === b.tileId);
        if (!bAw || !bTile) continue;
        const power = bAw.power || 3;
        // Find wounded Awoken in hex + adjacent
        const wounded: number[] = [];
        for (const p of placements) {
          if (p.stance !== "attack" && p.stance !== "defense") continue;
          const pTile = tiles.find(t => t.id === p.tileId);
          if (!pTile) continue;
          if (hexDist(bTile, pTile) <= 1) {
            const hp = next.get(p.awakenedId) ?? 6;
            const maxHp = (tenderItems.find(a => a.id === p.awakenedId)?.power || 3) +
                          (tenderItems.find(a => a.id === p.awakenedId)?.toughness || 3);
            if (hp < maxHp) wounded.push(p.awakenedId);
          }
        }
        if (wounded.length > 0) {
          const healPer = power / wounded.length;
          for (const id of wounded) {
            const aw = tenderItems.find(a => a.id === id);
            const maxHp = (aw?.toughness || 3);
            next.set(id, Math.min(maxHp, (next.get(id) ?? 0) + healPer));
          }
        }
      }
      return next;
    });
  };

  /** Called when enemies breach the center. */
  const onBattleLost = () => {
    setBattleActive(false);
    setBattleUnits([]);
    setTurnPhase(null);
    console.log("[battle] Territory breached!");
  };


  // Called when victory is detected — resolve the battle early to get bonus tiles
  // for the victory screen picker.
  const handleVictoryDetected = async () => {
    // Victory detected mid-battle — the real resolve with survivor IDs happens in handleBattleEnd.
    if (battleResolvedRef.current) return;
    battleResolvedRef.current = true;
  };

  const handleBattleEnd = async (result: { victory: boolean; survivors: number[]; raiseBinding?: boolean; continueWave?: boolean; bonusTileId?: number }) => {
    setShowBattleground(false);
    setIsBossFight(false);
    battleResolvedRef.current = false; // reset for next battle
    // Track boss victories
    if (result.victory && isBossFight) {
      const beaten = parseInt(localStorage.getItem("awoken-bosses-beaten") || "0") + 1;
      localStorage.setItem("awoken-bosses-beaten", String(beaten));
    }
    // Wave-pull battle (from mystery purification): resolve separately
    if (wavePullTile !== null) {
      const tileId = wavePullTile;
      setWavePullTile(null);
      try {
        const res = await api.resolveWavePull({ tileId, victory: result.victory, survivorIds: result.survivors });
        if (res.purified) {
          api.birthNewbornToHand({ tileId, liberatorNames: [] }).catch(() => {});
        }
        const refreshed = await api.getTerritory();
        setTiles(refreshed.tiles);
        setPlacements(refreshed.placements);
        await refreshEnergy();
        onUpdate();
      } catch (e) { console.error("Wave-pull resolve failed", e); }
      return;
    }
    if (!wave) return;
    try {
      // Always resolve with the real survivor list so XP and deeds are granted
      const battleRes = await api.resolveBattle({
        victory: result.victory,
        waveNumber: wave.waveNumber,
        survivorIds: result.survivors,
        continueWave: result.continueWave,
        targetTileId: waveTarget?.tile?.id,
      });
      if (battleRes.bonusEligible && battleRes.bonusEligible.length > 0) {
        setBonusTiles(battleRes.bonusEligible);
      }
      // Claim the picked bonus tile if one was chosen
      if (result.bonusTileId) {
        try {
          await api.claimBonusTile({ tileId: result.bonusTileId });
        } catch (e) { console.error("Bonus tile claim failed", e); }
        setBonusTiles([]);
      }
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements);
      const w = await api.getWave();
      setWave(w);
      await refreshEnergy();
      if (result.victory && isBossFight) {
        // Newborns only from boss fights — adds to wake count
        api.birthNewbornToHand({ tileId: 0, liberatorNames: [] }).catch(() => {});
        if (result.raiseBinding) {
          // Raise Binding: save wave difficulty, return to tender view
          // (wave state already saved by resolveBattle)
          onUpdate();
          return;
        }
        if (result.continueWave) {
          // Continue: +6 energy (granted server-side in resolveBattle), 2 fresh cards, next harder wave
          await refreshEnergy();
          // Refresh hand with 2 new cards (via onUpdate)
          onUpdate();
          return;
        }
      }
      onUpdate();
    } catch (e) {
      console.error("Battle resolve failed", e);
    }
  };

  const courtMarks = useCourtMarks();
  const isCourt = (a: Awakened) => courtMarks.championId === a.id || courtMarks.housedIds.has(a.id);
  const toggleBattlePool = (index: number) => {
    // Court-bound: housed Awoken and the champion stay in hand for battles —
    // they never stage for field deployment.
    const a = hand[index];
    if (a && isCourt(a) && !battlePool.includes(index)) {
      showHexNotice(`${a.name} is of the court — housed Awoken and the champion stay in hand for battles.`);
      return;
    }
    setBattlePool(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length >= 4) return prev;
      return [...prev, index];
    });
  };

  // Helper: get dominant element from Awoken layers (simplified)
  const getDominantElement = (awoken: Awakened): string => {
    // TODO: detect from piece names; default to neutral for now
    return "neutral";
  };

  // Helper: attunement time remaining in ms — 13 minutes. Energy sets the pace.
  const getAttuneRemaining = (tile: TerritoryTile, placement: FieldPlacement, awoken: Awakened): number | null => {
    // TODO: real element detection; for now show countdown on all fresh placements
    const placedAt = new Date(placement.placedAt).getTime();
    const duration = 13 * 60 * 1000;
    const remaining = placedAt + duration - Date.now();
    return remaining > 0 ? remaining : 0;
  };

  const formatRemaining = (ms: number): string => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
    // The empty state is the first-tile step above (fix list #3) — the
    // Tutorial overlay teaches; it never claimed ground.
    // Simple grid layout for now; parallax via row scaling
  // Project a point from the tilted map plane to screen coordinates.
  // The map container has: perspective(900px) rotateX(32deg), origin at center 60%.
  const projectTilted = (cx: number, cy: number, viewW: number, viewH: number) => {
    const theta = 40 * Math.PI / 180;
    const ox = viewW / 2, oy = viewH * 0.6;
    const dy = cy - oy;
    const y1 = dy * Math.cos(theta);
    const z = dy * Math.sin(theta);
    const scale = 900 / (900 - z);
    return {
      x: ox + (cx - ox) * scale,
      y: oy + y1 * scale,
      scale,
    };
  };
  const tiltPoint = (x: number, y: number) => projectTilted(x, y, 500, 340);

  // Render hex grid with mathematical perspective tilt.
  // Hex tiles are tilted (landscape view), Awoken are projected to the tilted
  // positions but drawn upright (not skewed).
  const renderGrid = () => {
    const size = 24 * zoom;
    // XYZ grid: height in pixels per terrain level (for future terraforming)
    const HEIGHT_PX = 22 * zoom;
    // Center the (0,0) tile in the viewBox
    const originX = 250, originY = 170;
    // Isometric tiling vectors come from the ONE shared hex geometry
    // (ISO_E / ISO_SE / isoOffset at the top of this file) — the same
    // basis the overlay cells are solved from, so map, selection, and
    // hit-testing can never drift apart.
    const tilePos = (t: any) => {
      const { px, py } = isoOffset(t.q, t.r, size);
      const cx = originX + px + pan.x;
      const cy = originY + py + pan.y - (t.height || 0) * HEIGHT_PX;
      return { cx, cy };
    };
    // Depth-sort by TILTED screen Y: further (higher on screen) drawn first.
    // This ensures front tiles always overlap back tiles, regardless of lift.
    // Build a set of cursed tile IDs adjacent to Awoken-occupied tiles (passive aura)
    const occupiedKeys = new Set(
      placements.map(p => {
        const t = tiles.find(t => t.id === p.tileId);
        return t ? `${t.q},${t.r}` : null;
      }).filter(Boolean)
    );
    const auraTiles = new Set<number>();
    for (const t of tiles) {
      if (!t.cursed) continue;
      const neighbors = [
        `${t.q+1},${t.r}`, `${t.q-1},${t.r}`,
        `${t.q},${t.r+1}`, `${t.q},${t.r-1}`,
        `${t.q+1},${t.r-1}`, `${t.q-1},${t.r+1}`,
      ];
      if (neighbors.some(n => occupiedKeys.has(n))) {
        auraTiles.add(t.id);
      }
    }
    const sortedTiles = [...tiles].sort((a, b) => {
      const pa = tilePos(a), pb = tilePos(b);
      return pa.cy - pb.cy;
    });
    // Entity layer: Awoken + buildings render ABOVE all terrain (Option A)
    // XYZ: entities sit on the tile top face, lifted by terrain height
    const buildingElements = sortedTiles.map((t) => {
      const { cx, cy } = tilePos(t);
      const s = size;
      // Two building slots per hex: offset left/right on the tile top face
      const slotOffset = s * 0.45;
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5;
      const tileBuildings = buildings.filter(b => b.tileId === t.id);
      const hp = tileHp.get(t.id);
      const showHp = hp !== undefined && hp < 10;
      return (
        <g key={`entity-${t.id}`} transform={`translate(0,${lift})`}>
          {showHp && (
            <g transform={`translate(${cx},${cy - s * 0.7})`}>
              <rect x="-18" y="-8" width="36" height="14" rx="3" fill="rgba(0,0,0,0.7)" stroke="#ff4444" strokeWidth="1" />
              <text y="3" textAnchor="middle" fontSize="10" fill="#ff6666" fontWeight="bold">♥ {hp}/10</text>
            </g>
          )}
          {/* Buildings on this tile (max 2) */}
          {tileBuildings.map((b, bi) => {
            const bpx = { x: cx + (bi === 0 ? -s * 0.45 : s * 0.45), y: cy - s * 0.35 };
            const isBuilding = b.status === "building";
            const isDormant = b.status === "dormant";
            const readyMs = b.readyAt ? new Date(b.readyAt).getTime() - Date.now() : 0;
            const readyMin = Math.max(0, Math.ceil(readyMs / 60000));
            return (
              <g key={`b-${b.id}`} className={isBuilding ? "building-constructing" : ""}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (pendingTile !== null || moveTargeting) return; // Non-clickable in build/move mode
                  if (demoMode) {
                    if (confirm(`Demolish this ${b.buildingType}?`)) {
                      try {
                        await api.demolishBuilding({ buildingId: b.id });
                        const rb = await api.getBuildings();
                        setBuildings(rb.buildings);
                        onUpdate();
                      } catch (err) { console.error("Demolish failed", err); }
                    }
                    return;
                  }
                  const HARVESTABLE_TYPES = ["dream-wheat", "dream-weed", "sky-bloom"];
                  if (!HARVESTABLE_TYPES.includes(b.buildingType) || b.status !== "active") return;
                  const readyAt = b.readyAt ? new Date(b.readyAt).getTime() : Date.now();
                  const lastHarvest = b.lastHarvestAt ? new Date(b.lastHarvestAt).getTime() : readyAt;
                  const growHours = b.growHours ?? 4;
                  const isReady = Date.now() - lastHarvest >= growHours * 60 * 60 * 1000;
                  if (isReady) {
                    try {
                      const r: any = await api.call("harvestWheat", { buildingId: b.id });
                      const rb = await api.getBuildings();
                      setBuildings(rb.buildings);
                      onUpdate();
                    } catch (err) { console.error("Harvest failed", err); }
                  }
                }}
                style={{ cursor: demoMode ? "pointer" : (pendingTile !== null || moveTargeting) ? "default" : ["dream-wheat", "dream-weed", "sky-bloom"].includes(b.buildingType) ? "pointer" : "default" }}>
                <image
                  href={b.buildingType === "dream-wheat" ? wheatStageImage(b) : b.buildingType === "dream-weed" ? dreamWeedStageImage(b) : buildingImage(b.buildingType)}
                  x={bpx.x - s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" || b.buildingType === "hall-of-champions" ? 1 : 0.5)}
                  y={bpx.y - s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" || b.buildingType === "hall-of-champions" ? 1 : 0.5)}
                  width={s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" || b.buildingType === "hall-of-champions" ? 2 : 1)}
                  height={s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" || b.buildingType === "hall-of-champions" ? 2 : 1)}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={isBuilding ? 0.7 : isDormant ? 0.4 : 1}
                  style={isBuilding ? { filter: "drop-shadow(0 0 12px #ffcc88)" } : undefined}
                />
                {isBuilding && (
                  <text x={bpx.x} y={bpx.y + s * 0.4} textAnchor="middle" fontSize={8} fill="#ffcc88">
                    ⏱ {readyMin >= 60 ? `${Math.floor(readyMin/60)}h${readyMin%60}m` : `${readyMin}m`}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      );
    });

    // Awoken layer: renders ABOVE all buildings
    const awokenElements = sortedTiles.map((t) => {
      const { cx, cy } = tilePos(t);
      const s = size;
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5;
      if (!awokens.length) return null;
      return (
        <g key={`awoken-${t.id}`} transform={`translate(0,${lift})`}>
            <g>
              {awokens.slice(0, 4).map((a, idx) => {
                // 4 keystone points: middle-front (default), front-left, front-right, back-center
                const keystones = [
                  { dx: 0, dy: 0.35 },      // middle-front (default)
                  { dx: -0.35, dy: 0.18 }, // front-left
                  { dx: 0.35, dy: 0.18 },  // front-right
                  { dx: 0, dy: -0.28 },    // back-center
                ];
                const ks = keystones[idx];
                const ws = 15, hs = 20;
                const kx = cx + ks.dx * s * 2;
                const ky = cy + ks.dy * s * 2;
                const awScale = 0.8 + zoom * 0.5; // Grows with zoom for visibility
                const aws = ws * awScale, ahs = hs * awScale;
                const isWhispering = whisper?.awakenedId === a.id;
                // Each Awoken drifts on its own rhythm — subtle, never leaves its hex.
                const driftDur = (6 + (a.id % 5)).toFixed(1);
                const driftDelay = (-(a.id % 7)).toFixed(1);
                const placement = tilePlacements.find(p => p.awakenedId === a.id);
                const isSelected = selectedAwoken === a.id;
                return (
                  <g key={a.id} className="field-drifter"
                    style={{
                      "--drift-dur": `${driftDur}s`,
                      "--drift-delay": `${driftDelay}s`,
                      cursor: selectedBuilding ? "pointer" : "pointer",
                      pointerEvents: selectedBuilding ? "none" : "auto",
                    } as React.CSSProperties}
                    onClick={async (e) => {
                      if (selectedBuilding) return; // Let tile handle it in build mode
                      if (moveTargeting || attackTargeting) return; // Only tiles selectable in move/attack mode
                      e.stopPropagation();
                      if (applyingAspect) {
                        try {
                          const awoken = tenderItems.find(x => x.id === a.id);
                          const oldP = awoken?.power ?? 0, oldT = awoken?.toughness ?? 0;
                          const result: any = await api.call("applyAspect", { awakenedId: a.id, inventoryAspectId: applyingAspect.id });
                          setApplyingAspect(null);
                          await onUpdate();
                          // Fetch updated Awoken for celebration
                          const updated = tenderItems.find(x => x.id === a.id);
                          setCelebration({
                            awoken: updated || awoken,
                            aspect: applyingAspect,
                            element: result.element,
                            newLevel: result.newLevel,
                            oldPower: oldP, oldToughness: oldT,
                            newPower: (updated?.power ?? oldP), newToughness: (updated?.toughness ?? oldT),
                          });
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Failed to apply");
                        }
                        return;
                      }
                      setSelectedAwoken(isSelected ? null : a.id);
                      setAttackTargeting(false);
                      setMoveTargeting(false);
                      setStanceMinimized(false);
                    }}>
                    {/* Light aura glow behind Awoken */}
                    <ellipse cx={kx} cy={ky} rx={aws * 0.48} ry={ahs * 0.44}
                      fill="rgba(255,240,200,0.28)"
                      style={{ filter: "blur(6px)" }} />
                    <ellipse cx={kx} cy={ky} rx={aws * 0.38} ry={ahs * 0.34}
                      fill="rgba(255,250,230,0.22)"
                      style={{ filter: "blur(4px)" }} />
                    {isWhispering && (
                      <ellipse cx={kx} cy={ky} rx={aws * 0.6} ry={ahs * 0.55}
                        fill="rgba(255,235,180,0.35)"
                        style={{ filter: "blur(8px)" }} />
                    )}
                    {isSelected && (
                      <circle cx={kx} cy={ky} r={14 * awScale} fill="none" stroke="#ffd700" strokeWidth="1.5" opacity="0.9" />
                    )}
                    <g style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))" }}>
                    <FieldAwoken awoken={a} assets={assets}
                      x={kx - aws / 2} y={ky - ahs / 2}
                      width={aws} height={ahs} />
                    </g>
                    {placement && placement.stance !== "defense" && (
                      <text x={kx} y={ky - ahs / 2 - 4} textAnchor="middle" fontSize={7}
                        fill={placement.stance === "attack" ? "#ff6666" : "#66aaff"}>
                        {placement.stance === "attack" ? "⚔" : "✦"}
                      </text>
                    )}
                    {/* Attunement: element + timer */}
                    {(() => {
                      if (!placement) return null;
                      const remaining = getAttuneRemaining(t, placement, a);
                      if (remaining === null || remaining <= 0) return null;
                      const el = dominantElement(a);
                      const elIcon = ({ tide: "🌊", sky: "🌪", stone: "⛰", root: "🌿", fire: "🔥" } as Record<string, string>)[(el || "").toLowerCase()] || "✦";
                      const akx = kx, aky = ky + ahs / 2 + 10;
                      return (
                        <g className="attunement-badge" opacity="0.9">
                          <text x={akx} y={aky} textAnchor="middle" fontSize={8} fill="#ffd700">
                            {elIcon} {formatRemaining(remaining)}
                          </text>
                        </g>
                      );
                    })()}
                    {isWhispering && (() => {
                      const words = whisper.text.split(" ");
                      const lines: string[] = [];
                      let line = "";
                      for (const w of words) {
                        if ((line + " " + w).trim().length > 32) {
                          lines.push(line.trim());
                          line = w;
                        } else {
                          line = (line + " " + w).trim();
                        }
                      }
                      if (line) lines.push(line.trim());
                      return (
                        <g className="whisper-bubble" opacity="0.9">
                          {lines.map((ln, i) => (
                            <text key={i} x={kx} y={ky - ahs / 2 - 12 - (lines.length - 1 - i) * 9}
                              textAnchor="middle" fontSize="7.5" fontStyle="italic"
                              fill="#e8d5a8" className="whisper-text">
                              {ln}
                            </text>
                          ))}
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
              {(() => {
                const placement = tilePlacements[0];
                if (!placement || !awoken) return null;
                const remaining = getAttuneRemaining(t, placement, awoken);
                if (remaining === null || remaining <= 0) return null;
                const attuneEl = dominantElement(awoken);
                const elColor: Record<string, string> = {
                  tide: "#6aa8d8", sky: "#a8d8f0", stone: "#c8a878",
                  root: "#78b878", fire: "#e87848", neutral: "#b89b5e",
                };
                return (
                  <g>
                    <rect x={cx - 18} y={cy + s * 0.55} width={36} height={9} rx={4.5} fill="#000" opacity="0.8" />
                    <circle cx={cx - 12} cy={cy + s * 0.55 + 4.5} r={2.8} fill={elColor[attuneEl] ?? "#b89b5e"} opacity="0.95" />
                    <text x={cx + 3} y={cy + s * 0.55 + 7} textAnchor="middle" fill="#e8e0d0" fontSize={6.5}>
                      {formatRemaining(remaining)}
                    </text>
                  </g>
                );
              })()}
            </g>
        </g>
      );
    });

    const elements = sortedTiles.map((t, i) => {
      // Flat-top XYZ: tilePos handles axial->pixel + height lift
      const { cx, cy } = tilePos(t);
      const s = size;
      // The fitted hex cell from the shared geometry (hexCellPoints) —
      // the same cell the terrain tiles by, so this tint, the click
      // target below, and every selection overlay share full edges
      // with their neighbors: one hexmap, never a lattice of strays.
      const pts = hexCellPoints(cx, cy, s);
      const tileKey = t.cursed ? "cursed" : (TERRAIN[t.element] ? t.element : "neutral");
      const imgOff = TERRAIN_IMG_OFFSET[tileKey] ?? { dx: 0, dy: 0 };

      const placement = placements.find(p => p.tileId === t.id);
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5; // Purified land hovers above the cursed
      return (
        <g key={t.id} transform={`translate(0,${lift})`}>
          {/* Isometric tile: 1920x1280 PNG; painted face measured 1730×944
              with its center at (964, 546) source px. The x/y place the
              image so the face center lands exactly on the tile's
              lattice point (cx, cy); imgOff seats off-template art. */}
          <image href={TERRAIN[tileKey]}
            x={cx - s * 1.2106 + imgOff.dx * s} y={cy - s * 0.6857 + imgOff.dy * s} width={s * 2.41} height={s * 1.608}
            preserveAspectRatio="xMidYMid meet"
            style={auraTiles.has(t.id) ? { filter: "drop-shadow(0 0 12px rgba(255,215,0,0.9)) brightness(1.15)" } : undefined} />
          {/* Corruption made visible (Nigel, 2026-10-14): cursed hexes
              GLOW crimson-violet from within — the dark bruising the land
              itself, never a red grid laid over it. Always on: the wilds
              smolder at the edge of the light. When a company is readied
              the bruise deepens and its pulse quickens — the dark knows
              it is being aimed at. Layered polygons, no SVG filters, so
              the iPad stays smooth. */}
          {t.cursed && (
            <g className={battlePool.length > 0 ? "corruption-glow armed" : "corruption-glow"} pointerEvents="none">
              <polygon points={hexCellPoints(cx, cy, s, 1.14)} fill={battlePool.length > 0 ? "rgba(150,20,96,0.30)" : "rgba(150,20,96,0.13)"} stroke="none" />
              <polygon points={pts} fill={battlePool.length > 0 ? "rgba(158,26,102,0.40)" : "rgba(158,26,102,0.17)"} stroke="none" />
              {/* The mist climbs (Nigel, 2026-10-14): traces of deep red
                  drifting up off the corruption — the glow made taller.
                  Two soft wisps per hex, staggered by tile so the wilds
                  never breathe in lockstep. CSS-risen, no filters. */}
              <ellipse className="mist-wisp" cx={cx - s * 0.18} cy={cy - s * 0.30} rx={s * 0.30} ry={s * 0.55}
                fill={battlePool.length > 0 ? "rgba(178,24,44,0.16)" : "rgba(178,24,44,0.09)"} stroke="none"
                style={{ animationDelay: `${(t.id % 5) * 0.9}s` }} />
              <ellipse className="mist-wisp" cx={cx + s * 0.22} cy={cy - s * 0.42} rx={s * 0.22} ry={s * 0.44}
                fill={battlePool.length > 0 ? "rgba(160,20,70,0.14)" : "rgba(160,20,70,0.07)"} stroke="none"
                style={{ animationDelay: `${(t.id % 7) * 0.7 + 1.3}s` }} />
            </g>
          )}
          {/* Curse HP on cursed tiles */}
          {t.cursed && (() => {
            const ring = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
            const maxHp = (t as any).curseMaxHp ?? (4 + ring * 6);
            const hp = (t as any).curseHp ?? maxHp;
            const thorns = Math.pow(2, Math.max(0, ring - 1));
            return (
              <g>
              <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8}
                fill="#ff6666" opacity="0.95" fontWeight="bold">
                ♥ {hp}
              </text>
              {thorns > 1 && (
                <text x={cx} y={cy + 18} textAnchor="middle" fontSize={7}
                  fill="#ffaa00" opacity="0.9" fontWeight="bold">
                  🌵 {thorns}
                </text>
              )}
              </g>
            );
          })()}
          {/* Burning tile: Fire III art */}
          {t.spark === 2 && fireAspectImg && (
            <image href={fireAspectImg} x={cx - 40} y={cy - 50} width={80} height={80}
              preserveAspectRatio="xMidYMid meet" opacity="0.7" pointerEvents="none" />
          )}
          {/* Spark: fire aspect waiting to be claimed */}
          {t.spark === 1 && (
            <g onClick={(e) => { e.stopPropagation(); handleSparkClick(t.id); }} style={{ cursor: "pointer" }}>
              {fireAspectImg ? (
                <image href={fireAspectImg} x={cx - 30} y={cy - 40} width={60} height={60}
                  preserveAspectRatio="xMidYMid meet" opacity="0.95" />
              ) : (
                <text x={cx} y={cy - 10} textAnchor="middle" fontSize={24} fill="#ff6600" opacity="0.95">🔥</text>
              )}
              <text x={cx} y={cy + 25} textAnchor="middle" fontSize={8}
                fill="#ffaa00" opacity="0.9" fontWeight="bold">
                SPARK — tap to claim
              </text>
            </g>
          )}
          {t.element && t.element !== "neutral" && (
            <polygon points={pts} fill={
              t.element === "tide" ? "rgba(74,144,217,0.15)" :
              t.element === "sky" ? "rgba(135,206,235,0.15)" :
              t.element === "stone" ? "rgba(139,115,85,0.15)" :
              t.element === "root" ? "rgba(107,142,35,0.15)" :
              t.element === "fire" ? "rgba(255,68,68,0.15)" : "rgba(0,0,0,0)"
            } pointerEvents="none" />
          )}
          {/* The hit target IS the visible hex (the fitted cell above) —
              invisible itself; the corruption glow over the terrain face
              is what marks cursed ground now. */}
          <polygon points={pts}
            fill="rgba(0,0,0,0)"
            stroke="transparent"
            style={{
              cursor: (battlePool.length > 0 || attackTargeting) ? "pointer" : "default",
              filter: auraTiles.has(t.id) ? "drop-shadow(0 0 6px rgba(100,255,100,0.6))" : undefined,
              pointerEvents: "all"
            }}
            onMouseEnter={() => setHoverHexId(t.id)}
            onMouseLeave={() => setHoverHexId(h => (h === t.id ? null : h))}
            onClick={async (e) => {
              // A tile tap is not an empty-map tap: stop the click here,
              // or it bubbles into the map's dismiss handler and erases
              // the confirm/targeting this very tap just raised.
              e.stopPropagation();
              if (selectedBuilding && !t.cursed) {
                // Open builder selection for this tile — the pending
                // tile wears the mist while the placement is unconfirmed.
                setPendingTile(t.id);
                setSelectedBuilders([]);
                setTargetHexId(null);
                clearHexConfirm();
              } else if (attackTargeting && selectedAwoken !== null) {
                if (touchMode) raiseHexConfirm("attack", t.id);
                else { setTargetHexId(t.id); handleAttack(t.id); }
              } else if (moveTargeting && selectedAwoken !== null) {
                if (touchMode) raiseHexConfirm("move", t.id);
                else { setTargetHexId(t.id); handleMove(t.id); }
              } else if (battlePool.length > 0) {
                if (touchMode) raiseHexConfirm("deploy", t.id);
                else { setTargetHexId(t.id); handleDeploy(t.id); }
              }
            }} />

          {/* Awoken render in entity layer */}
        </g>
      );
    });
    // Selection layers (fix list #13, refined) — drawn as the LAST
    // layers of the map, above terrain art and creatures, below the
    // modal UI, all from the fitted cell geometry:
    //  · HOVER (desktop): a soft gold glow on the hex under the cursor
    //    while a targeting flow is armed — the hex you are about to
    //    select.
    //  · MIST (touch, and the building flow's pending tile): a pale,
    //    translucent wash — this hex is about to be acted on, not yet
    //    committed; the confirm bar (or the builder popup) decides.
    //  · SHINE (committed): the gold double outline + chevron on the
    //    hex the tap chose, while its action resolves.
    const flowArmed = battlePool.length > 0 || attackTargeting || moveTargeting || !!selectedBuilding;
    const mistTileId = hexConfirm?.tileId ?? pendingTile;
    const cellLayer = (tileId: number | null, kind: "hover" | "mist" | "shine") => {
      if (tileId === null) return null;
      const tile = tiles.find(t => t.id === tileId);
      if (!tile) return null;
      const { cx, cy } = tilePos(tile);
      const s = size;
      const lift = tile.cursed ? 0 : -5; // match the terrain layer's lift
      if (kind === "hover") {
        return (
          <g key="target-hex-hover" transform={`translate(0,${lift})`} pointerEvents="none">
            <polygon points={hexCellPoints(cx, cy, s)} fill="rgba(255,215,0,0.07)" stroke="rgba(255,215,0,0.55)" strokeWidth={1.5} strokeLinejoin="round" />
          </g>
        );
      }
      if (kind === "mist") {
        return (
          <g key="target-hex-mist" className="target-hex-mist" transform={`translate(0,${lift})`} pointerEvents="none">
            <polygon points={hexCellPoints(cx, cy, s)} fill="rgba(255,244,214,0.20)" stroke="rgba(255,236,180,0.85)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
            <polygon points={hexCellPoints(cx, cy, s, 0.82)} fill="rgba(255,248,228,0.12)" stroke="none" />
          </g>
        );
      }
      return (
        <g key="target-hex-marker" className="target-hex-marker" transform={`translate(0,${lift})`} pointerEvents="none">
          <polygon className="target-hex-pulse" points={hexCellPoints(cx, cy, s, 1.05)} fill="rgba(255,215,0,0.10)" stroke="#ffd700" strokeWidth={3} strokeLinejoin="round" />
          <polygon points={hexCellPoints(cx, cy, s, 0.93)} fill="none" stroke="#ffedb0" strokeWidth={1.5} strokeLinejoin="round" />
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0; 0 3; 0 0" dur="1.6s" repeatCount="indefinite" />
            <polygon points={`${cx - 7},${cy - s * 1.14} ${cx + 7},${cy - s * 1.14} ${cx},${cy - s * 0.82}`} fill="#ffd700" stroke="#7a5c00" strokeWidth={0.75} strokeLinejoin="round" />
          </g>
        </g>
      );
    };
    const hoverLayer = !touchMode && flowArmed && hoverHexId !== null && hoverHexId !== mistTileId && hoverHexId !== targetHexId
      ? cellLayer(hoverHexId, "hover") : null;
    const mistLayer = cellLayer(mistTileId, "mist");
    const targetMarker = cellLayer(targetHexId, "shine");
    return (
      <>
        {elements}
        {buildingElements}
        {awokenElements}
        {hoverLayer}
        {mistLayer}
        {targetMarker}
      </>
    );
  };

  const deedLabel = (deed: string) => {
    switch (deed) {
      case "wave_survived": return "Unravelings survived";
      case "curse_broken": return "Curses broken";
      case "battle_won": return "Battles won";
      case "level_10": return "Reached level 10";
      case "level_20": return "Reached level 20";
      case "level_30": return "Reached level 30";
      default: return deed;
    }
  };

/** Hall of Champions: dwellings for champions — house, feed, and raise the Hall. */
function HallPanel({ tenderItems, onUpdate, onChampionChange }: { tenderItems: any[]; onUpdate: () => void; onChampionChange?: () => void }) {
  const queryClient = useQueryClient();
  const hallQ = useQuery({ queryKey: ["hall"], queryFn: () => api.getHall(), refetchInterval: 30000 });
  const legendsQ = useQuery({ queryKey: ["legends"], queryFn: () => api.getLegends() });
  const championId = (legendsQ.data as any)?.champion?.id ?? null;
  const makeChampion = useMutation({
    mutationFn: (awakenedId: number) => api.setChampion({ awakenedId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["legends"] }); onChampionChange?.(); },
    onError: (e: any) => alert(e.message),
  });
  const attQ = useQuery({ queryKey: ["aspectAttunement"], queryFn: () => api.getAspectAttunement() });
  const [selectedRoom, setSelectedRoom] = useState<number>(0);
  // Feeding reports inline (browser alerts are clunky on iPad); a level-up
  // also pulses the resident card gold.
  const [feedNote, setFeedNote] = useState<{ text: string; tone: "plain" | "leveled" | "error" } | null>(null);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerPulse = () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulse(false);
    // Restart the animation even on back-to-back level-ups.
    requestAnimationFrame(() => requestAnimationFrame(() => setPulse(true)));
    pulseTimer.current = setTimeout(() => setPulse(false), 2000);
  };
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["hall"] }); queryClient.invalidateQueries({ queryKey: ["aspectAttunement"] }); onUpdate(); };
  const fundE = useMutation({ mutationFn: (amount: number) => api.fundHallEnergy({ amount }), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const fundEl = useMutation({ mutationFn: (v: { element: string; points: number }) => api.fundHallElement(v), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const begin = useMutation({ mutationFn: () => api.beginHallUpgrade(), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const house = useMutation({ mutationFn: (v: { roomIndex: number; awakenedId: number }) => api.houseAwoken(v), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const unhouse = useMutation({ mutationFn: (roomIndex: number) => api.unhouseAwoken({ roomIndex }), onSuccess: refresh, onError: (e: any) => alert(e.message) });
  const feed = useMutation({
    mutationFn: (v: { awakenedId: number; energy: number }) => api.feedEnergy(v),
    onSuccess: (r: any, v: any) => {
      refresh();
      const a = tenderItems.find(t => t.id === v.awakenedId);
      const name = a?.name ?? "Your champion";
      if (r.leveledUp) {
        setFeedNote({ tone: "leveled", text: `✦ ${name} rises to Lv ${r.newLevel}! (+${r.xpGain} XP${r.statPointsGained ? ` · +${r.statPointsGained} stat point${r.statPointsGained > 1 ? "s" : ""}` : ""})` });
        triggerPulse();
      } else {
        setFeedNote({ tone: "plain", text: `+${r.xpGain} XP — ${name} drinks deep.` });
      }
    },
    onError: (e: any) => setFeedNote({ tone: "error", text: e?.message ?? "Feeding failed." }),
  });

  if (hallQ.isPending) return <div className="champion-tab"><div className="celestial-title">Hall of Champions</div><img src={hallBanner} className="hall-banner" alt="The Hall of Champions" /><p className="quiet">Approaching the castle…</p></div>;
  const hall = hallQ.data?.hall;
  if (!hall) return (
    <div className="champion-tab">
      <div className="celestial-title">Hall of Champions</div>
      <img src={hallBanner} className="hall-banner" alt="The Hall of Champions" />
      <p className="quiet">No hall stands yet. Raise the 🏰 Hall of Champions from the build menu — a castle haunted by ancient Awoken, where your champions will dwell, be fed, and grow.</p>
    </div>
  );
  if (hall.status === "building") return (
    <div className="champion-tab">
      <div className="celestial-title">Hall of Champions</div>
      <img src={hallBanner} className="hall-banner" alt="The Hall of Champions" />
      <p className="quiet">The castle is rising from the stone… it will stand soon.</p>
    </div>
  );
  const housedIds = new Set(hall.rooms.map((r: any) => r.awakenedId).filter(Boolean));
  const room = hall.rooms[Math.min(selectedRoom, hall.rooms.length - 1)] ?? hall.rooms[0];
  const resident = room?.awakenedId ? tenderItems.find(t => t.id === room.awakenedId) : null;
  const cost = hall.nextCost;
  const fund = hall.fund;
  const elGlyph: Record<string, string> = { tide: "🌊", sky: "🌪️", stone: "🪨", root: "🌱" };
  const full = cost && fund.energy >= cost.energy && ["tide", "sky", "stone", "root"].every(el => fund[el] >= cost.elementalEach);
  const upgradeLeft = hall.upgradeReadyAt ? Math.max(0, new Date(hall.upgradeReadyAt).getTime() - Date.now()) : 0;

  return (
    <div className="champion-tab">
      <div className="celestial-title">🏰 Hall of Champions — Level {hall.level}</div>
      <img src={hallBanner} className="hall-banner" alt="The Hall of Champions" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {hall.rooms.map((r: any) => {
          const a = r.awakenedId ? tenderItems.find(t => t.id === r.awakenedId) : null;
          return (
            <button key={r.roomIndex} className="abtn small" style={room?.roomIndex === r.roomIndex ? { outline: "2px solid #d4af6a" } : { opacity: 0.85 }} onClick={() => { setSelectedRoom(r.roomIndex); setFeedNote(null); }} title={a ? a.name : "Empty room"}>
              {a ? <img src={a.image_url} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 4, verticalAlign: "middle" }} /> : <span style={{ fontSize: 20 }}>🕯️</span>}
              <span style={{ marginLeft: 4 }}>Room {r.roomIndex + 1}</span>
            </button>
          );
        })}
      </div>
      {room && (resident ? (
        <div className={`champion-tab-card${pulse ? " levelup-pulse" : ""}`}>
          <img src={resident.image_url} alt={resident.name} />
          <div className="champion-name">{championId === resident.id ? "⭐ " : ""}{resident.name}</div>
          <div className="champion-stats">{resident.power}⚔ {resident.toughness}🛡 · Lv {resident.level ?? 0} · ✦ {resident.experience ?? 0} XP</div>
          {(() => {
            const into = resident.xp_into_level ?? Math.max(0, (resident.experience ?? 0) - (resident.xp_current ?? 0));
            const forNext = resident.xp_for_next_level ?? Math.max(0, (resident.xp_next ?? 0) - (resident.xp_current ?? 0));
            const pct = forNext > 0 ? Math.min(100, Math.round((into / forNext) * 100)) : 100;
            return (
              <div className="hall-xp">
                <div className="hall-xp-bar"><div className="hall-xp-fill" style={{ width: `${pct}%` }} /></div>
                <div className="hall-xp-text">✦ {into}/{forNext} XP — {Math.max(0, forNext - into)} to Lv {(resident.level ?? 0) + 1}</div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {[1, 5, 10].map(amt => (
              <button key={amt} className="abtn small" disabled={feed.isPending} onClick={() => feed.mutate({ awakenedId: resident.id, energy: amt })} title={`Feed ${amt} energy → ${amt * 2} XP`}>
                Feed {amt}⚡ → {amt * 2} XP
              </button>
            ))}
            <button className="abtn small" onClick={() => unhouse.mutate(room.roomIndex)}>Leave room</button>
            {championId === resident.id
              ? <span className="quiet" style={{ alignSelf: "center" }}>Your champion — represents you in the Confluence.</span>
              : <button className="abtn small" disabled={makeChampion.isPending} onClick={() => makeChampion.mutate(resident.id)} title="Crown this Awoken as your champion">⭐ Make Champion</button>}
          </div>
          {feedNote && <div className={`hall-feed-note ${feedNote.tone}`}>{feedNote.text}</div>}
        </div>
      ) : (
        <div>
          <p className="quiet">Room {room.roomIndex + 1} stands empty. House an Awoken:</p>
          <div className="champion-field-list" style={{ maxHeight: 150 }}>
            {tenderItems.filter(a => !housedIds.has(a.id)).map(a => (
              <div key={a.id} className="champion-field-item">
                <img src={a.image_url} alt={a.name} />
                <div className="champion-field-info"><div>{a.name}</div><div className="quiet">Lv {a.level ?? 0} · {a.xp_into_level ?? 0}/{a.xp_for_next_level ?? 0} XP · {a.power}⚔ {a.toughness}🛡</div></div>
                <button className="abtn small" onClick={() => house.mutate({ roomIndex: room.roomIndex, awakenedId: a.id })}>House</button>
              </div>
            ))}
            {tenderItems.filter(a => !housedIds.has(a.id)).length === 0 && <p className="quiet">Every Awoken is housed or none remain.</p>}
          </div>
        </div>
      ))}
      {cost && !hall.upgrading && (
        <div style={{ marginTop: 12 }}>
          <div className="celestial-title" style={{ fontSize: 14 }}>Raise the Hall to Level {hall.level + 1}</div>
          <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <div>⚡ Energy: {fund.energy}/{cost.energy}
              <button className="abtn small" style={{ marginLeft: 8 }} disabled={fundE.isPending} onClick={() => fundE.mutate(10)}>+10</button>
              <button className="abtn small" style={{ marginLeft: 4 }} disabled={fundE.isPending} onClick={() => fundE.mutate(50)}>+50</button>
            </div>
            {(["tide", "sky", "stone", "root"] as const).map(el => (
              <div key={el}>{elGlyph[el]} {el}: {fund[el]}/{cost.elementalEach} <span className="quiet">(meter: {Math.floor(attQ.data?.levels?.[el] ?? 0)})</span>
                <button className="abtn small" style={{ marginLeft: 8 }} disabled={fundEl.isPending} onClick={() => fundEl.mutate({ element: el, points: 1 })}>+1</button>
                <button className="abtn small" style={{ marginLeft: 4 }} disabled={fundEl.isPending} onClick={() => fundEl.mutate({ element: el, points: 10 })}>+10</button>
              </div>
            ))}
          </div>
          {full ? <button className="abtn" style={{ marginTop: 8 }} disabled={begin.isPending} onClick={() => begin.mutate()}>Begin the raising ({cost.buildMinutes >= 1440 ? `${Math.round(cost.buildMinutes / 1440 * 10) / 10} days` : cost.buildMinutes >= 60 ? `${Math.round(cost.buildMinutes / 60 * 10) / 10} h` : `${cost.buildMinutes} min`})</button>
            : <p className="quiet" style={{ marginTop: 6 }}>Fill every reservoir, then begin. The spirits stir as the stores grow.</p>}
        </div>
      )}
      {hall.upgrading && <p className="quiet" style={{ marginTop: 10 }}>🛠️ The Hall is being raised — a new room opens in {Math.ceil(upgradeLeft / 3600000)}h {Math.ceil((upgradeLeft % 3600000) / 60000)}m. Housed champions rest undisturbed.</p>}
      {hall.level >= 10 && <p className="quiet" style={{ marginTop: 10 }}>Ten rooms stand. The Hall is complete — for now, the castle dreams no deeper.</p>}
    </div>
  );
}

/** Aspect attunement panel: hand-drawn element glyphs flowing into meters. Toggled by dock button. */
function AspectAttunement({ visible, onClose, tenderItems, placedIds, onUpdate, onApplyAspect }: { visible: boolean; onClose: () => void; tenderItems: any[]; placedIds: Set<number>; onUpdate: () => void; onApplyAspect: (aspect: any) => void }) {
  if (!visible) return null;
  const { data } = useQuery({
    queryKey: ["aspectAttunement"],
    queryFn: () => api.getAspectAttunement(),
    refetchInterval: 30000,
  });
  if (!data) return null;

  const elements = [
    { id: "tide", label: "Tide" },
    { id: "sky", label: "Sky" },
    { id: "stone", label: "Stone" },
    { id: "root", label: "Root" },
  ];
  // Fire appears only after discovering the first spark
  const showFire = typeof window !== "undefined" && localStorage.getItem("awoken-fire-found") === "1";
  if (showFire) {
    elements.push({ id: "fire", label: "Fire" });
  }

  return (
    <div className="aspect-attunement celestial">
      <button className="aspect-close" onClick={onClose} title="Close">✕</button>
      <div className="celestial-title">Aspect Attunement</div>
      {elements.map(el => {
        const points = data.levels[el.id] ?? 0;
        const pct = Math.min(100, (points / data.threshold) * 100);
        const aspectCount = (data.inventory || []).filter((i: any) => i.element === el.id).length;
        const rate = (data.rates && data.rates[el.id]) || 0;
        return (
          <div key={el.id} className="celestial-row" title={`${el.label}: ${points.toFixed(1)}/${data.threshold} · +${rate}/hr`}>
            <ElementGlyph element={el.id as GlyphElement} className="glyph-svg" width={60} height={24} />
            <div className="celestial-track"><div className="celestial-progress" style={{ width: `${pct}%` }} /></div>
            <span className="celestial-rate" style={{ fontSize: 11, opacity: rate > 0 ? 0.95 : 0.45, minWidth: 52, textAlign: "right", color: "#e8d5a0" }}>{rate > 0 ? `+${rate}/hr` : "—"}</span>
            <button
              className="celestial-orb"
              title={`${aspectCount} ${el.label} aspects ready — tap, then tap an Awoken`}
              onClick={() => {
                const aspects = (data.inventory || []).filter((i: any) => i.element === el.id);
                if (aspects.length > 0) {
                  onApplyAspect(aspects[0]);
                }
              }}
              disabled={aspectCount === 0}
            >
              {aspectCount}
            </button>
          </div>
        );
      })}
    </div>
  );
}

  return (
    <div className="territory-view">
      {territoryLoaded && tiles.length === 0 && (() => {
        // The first-tile step (fix list #3): a Tender with no ground
        // gathers the company that faces the Unraveler. The court stays
        // in hand, as everywhere — housed Awoken and the champion are
        // never offered for the company.
        const eligible = tenderItems.filter(a => !isCourt(a));
        const teamPower = firstTeam.reduce((sum, id) => sum + (tenderItems.find(a => a.id === id)?.power ?? 0), 0);
        const handPower = eligible.reduce((sum, a) => sum + a.power, 0);
        const toggleFirstTeam = (id: number) => setFirstTeam(prev =>
          prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 6 ? prev : [...prev, id]);
        const suggestFirstTeam = () => {
          const picked: number[] = [];
          let sum = 0;
          for (const a of [...eligible].sort((x, y) => y.power - x.power)) {
            if (picked.length >= 6 || sum >= 7) break;
            picked.push(a.id);
            sum += a.power;
          }
          setFirstTeam(picked);
        };
        return (
          <section className="first-claim" aria-live="polite">
            <p className="eyebrow">The Last Bastion</p>
            <h2>No ground is held — yet.</h2>
            <p>The Unraveler waits in the wilds at power 7. Gather a company of up to six of your Awoken whose combined power reaches 7, and face it together. The first four named will stand upon the bastion when the dark breaks — and a newborn follows every victory.</p>
            {eligible.length === 0 ? (
              <p className="quiet">Your deck is empty — wake Awoken at the spark first, then return to claim your ground.</p>
            ) : (
              <>
                <div className="first-claim-team">
                  {eligible.map(a => (
                    <button key={a.id} type="button" className={`first-claim-card ${firstTeam.includes(a.id) ? "in-pool" : ""}`} onClick={() => toggleFirstTeam(a.id)} aria-pressed={firstTeam.includes(a.id)}>
                      <img src={a.image_url} alt={a.name} />
                      <div className="first-claim-card-name">{a.name}</div>
                      <div className="quiet">{a.power}⚔ {a.toughness}🛡</div>
                    </button>
                  ))}
                </div>
                <div className="first-claim-actions">
                  <span>Company power: {teamPower} / 7</span>
                  <button type="button" className="abtn" onClick={suggestFirstTeam}>Gather the strongest</button>
                  <button type="button" className="abtn" disabled={teamPower < 7 || firstTeam.length === 0 || firstClaimBusy} onClick={() => void handleFirstClaim()}>
                    {firstClaimBusy ? "Facing…" : "Face the Unraveler"}
                  </button>
                </div>
                {teamPower < 7 && (handPower >= 7
                  ? <p className="quiet">Choose more of your Awoken — together they must reach 7.</p>
                  : <p className="quiet">Even together, your Awoken reach only {handPower}. Wake more at the spark, and return when the company is strong enough.</p>)}
                {firstClaimError && <p className="notice error" role="status">{firstClaimError}</p>}
              </>
            )}
          </section>
        );
      })()}
      {showChampionTab && (
        <>
        <div>
          <button className="aspect-close" onClick={() => setShowChampionTab(false)} title="Close">✕</button>
          <HallPanel tenderItems={tenderItems} onUpdate={onUpdate} onChampionChange={() => { api.getLegends().then(setLegends).catch(() => {}); }} />
        </div>
        <div className="champion-tab">
          <div className="celestial-title">Champion & Field</div>
          {legends.champion ? (
            <div className="champion-tab-card">
              <img src={legends.champion.image_url} alt={legends.champion.name} />
              <div className="champion-name">⭐ {legends.champion.name}</div>
              <div className="champion-stats">
                {legends.champion.power}⚔ {legends.champion.toughness}🛡 · Lv {legends.champion.level ?? 0}
              </div>
              <button
                className="abtn small"
                onClick={() => {
                  setShowChampionTab(false);
                  if (legends.champion) setApplyingToTarget(legends.champion.id);
                  setShowAspects(true);
                }}
                title="Apply an aspect to your champion"
              >
                Add Aspect
              </button>
              <button
                className="abtn small"
                onClick={() => {
                  setShowChampionTab(false);
                  setShowChampionPicker(true);
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <p className="quiet">No champion chosen yet.</p>
              <button className="abtn small" onClick={() => { setShowChampionTab(false); setShowChampionPicker(true); }}>
                Choose Champion
              </button>
            </div>
          )}
          <div className="celestial-title" style={{ marginTop: 12, fontSize: 14 }}>📜 Hall of Legends</div>
          <div className="champion-field-list" style={{ maxHeight: 120 }}>
            {legends.legends.length === 0 ? (
              <p className="quiet">No legends yet. Battle on.</p>
            ) : (
              legends.legends.map(l => (
                <div key={l.id} className="legend-entry">
                  <span className="legend-name">{l.awokenName}</span>
                  <span className="legend-deed">{deedLabel(l.deed)} ×{l.count}</span>
                </div>
              ))
            )}
          </div>
          <div className="celestial-title" style={{ marginTop: 12, fontSize: 14 }}>Field Awoken</div>
          <div className="champion-field-list">
            {tenderItems.filter(a => placedIds.has(a.id)).map(a => (
              <div key={a.id} className="champion-field-item">
                <img src={a.image_url} alt={a.name} />
                <div className="champion-field-info">
                  <div>{a.name}</div>
                  <div className="quiet">{a.power}⚔ {a.toughness}🛡</div>
                </div>
                <button
                  className="abtn small"
                  onClick={() => {
                    setShowChampionTab(false);
                    setApplyingToTarget(a.id);
                    setShowAspects(true);
                  }}
                >
                  Aspect
                </button>
              </div>
            ))}
            {tenderItems.filter(a => placedIds.has(a.id)).length === 0 && (
              <p className="quiet">No Awoken on the field.</p>
            )}
          </div>
        </div>
        </>
      )}
      <AspectAttunement visible={showAspects} onClose={() => { setShowAspects(false); setApplyingToTarget(null); }} tenderItems={tenderItems} placedIds={placedIds} onUpdate={onUpdate} onApplyAspect={async (aspect) => {
        setShowAspects(false);
        if (applyingToTarget) {
          try {
            const awoken = tenderItems.find(x => x.id === applyingToTarget);
            const oldP = awoken?.power ?? 0, oldT = awoken?.toughness ?? 0;
            const result: any = await api.call("applyAspect", { awakenedId: applyingToTarget, inventoryAspectId: aspect.id });
            await onUpdate();
            setCelebration({
              awoken: awoken,
              aspect: aspect,
              element: result.element,
              newLevel: result.newLevel,
              oldPower: oldP, oldToughness: oldT,
              newPower: oldP + 1, newToughness: oldT + 1,
            });
          } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to apply");
          }
          setApplyingToTarget(null);
        } else {
          setApplyingAspect(aspect);
        }
      }} />
      {celebration && (
        <AspectCelebration
          awoken={celebration.awoken}
          aspect={celebration.aspect}
          element={celebration.element}
          newLevel={celebration.newLevel}
          oldPower={celebration.oldPower}
          oldToughness={celebration.oldToughness}
          newPower={celebration.newPower}
          newToughness={celebration.newToughness}
          onDone={() => setCelebration(null)}
        />
      )}
      {applyingAspect && (
        <div className="applying-aspect-banner" onClick={() => setApplyingAspect(null)}>
          Tap an Awoken to apply {applyingAspect.name} — tap here to cancel
        </div>
      )}
      <button
        className="champion-fab"
        onClick={() => setShowChampionTab(!showChampionTab)}
        title="Champion"
      >
        <svg viewBox="0 0 32 32" width="28" height="28">
          <path d="M16,2 L20,12 L30,12 L22,18 L25,28 L16,22 L7,28 L10,18 L2,12 L12,12 Z"
            fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
        </svg>
      </button>
      <button
        className="aspect-fab"
        onClick={() => setShowAspects(!showAspects)}
        title="Aspect Attunement"
      >
        <svg viewBox="0 0 32 32" width="28" height="28">
          <path d="M16,4 C16,4 10,10 10,16 C10,22 14,26 16,28 C18,26 22,22 22,16 C22,10 16,4 16,4 Z"
            fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
          <path d="M16,8 C13,12 13,18 16,24" fill="none" stroke="#d4af6a" strokeWidth="1" opacity="0.6"/>
          <circle cx="16" cy="16" r="2.5" fill="#e8d5a0" opacity="0.9"/>
        </svg>
      </button>
      {/* Left panel: Champion + Hall of Legends (collapsable) */}

      {showChampionPicker && (
        <div className="champion-picker-overlay" onClick={() => setShowChampionPicker(false)}>
          <div className="champion-picker" onClick={e => e.stopPropagation()}>
            <h3>Choose your champion</h3>
            <p className="quiet">Any of your Awoken can bear the title, wherever they stand. The champion's pieces pass into confluence victory births. The Hall is where champions are trained — fed and leveled.</p>
            <div className="champion-grid">
              {tenderItems.map(a => (
                <button key={a.id} className="champion-option"
                  onClick={async () => {
                    try {
                      await api.setChampion({ awakenedId: a.id });
                      const updated = await api.getLegends();
                      setLegends(updated);
                      setShowChampionPicker(false);
                    } catch (e: any) { alert(e.message); }
                  }}>
                  <img src={a.image_url} alt={a.name} />
                  <div>{a.name}</div>
                  <div className="champion-option-stats">{a.power}/{a.toughness} · Lv {a.level ?? 0}</div>
                </button>
              ))}
            </div>
            <button className="abtn small" onClick={() => setShowChampionPicker(false)}>Close</button>
          </div>
        </div>
      )}
      {returnReport && (
        <div className="return-report-overlay" onClick={() => setReturnReport(null)}>
          <div className="return-report" onClick={e => e.stopPropagation()}>
            <div className="return-report-label">Upon your return, an Awoken speaks:</div>
            <div className="return-report-text">"{returnReport.text}"</div>
            <button className="abtn small" onClick={() => setReturnReport(null)}>Tend on</button>
          </div>
        </div>
      )}
      {mood && (
        <div className="world-mood" title={mood.description}>
          🌙 {mood.mood.charAt(0).toUpperCase() + mood.mood.slice(1)}
        </div>
      )}
      {showFriends && <Friends onClose={() => setShowFriends(false)} hand={hand} />}
      {!legends.champion && (
        <button className="champion-fab" onClick={() => setShowChampionPicker(true)} title="Choose your champion">
          🏆
        </button>
      )}
      <button className="friends-btn" onClick={() => setShowFriends(true)} title="Friends">
        🤝
      </button>
      {wave && (
        <div className="wave-panel">
          <div className="wave-comp">
            {wave.frayCount} Fray{wave.unravelers > 0 && ` + ${wave.unravelers} Unraveler${wave.unravelers > 1 ? "s" : ""}`}
            {" "}· Power {wave.totalPower}
          </div>

          {waveResult && (
            <div className={`wave-result ${waveResult.victory ? "victory" : "defeat"}`}>
              {waveResult.victory
                ? `Victory! The Unraveling breaks. (${waveResult.defensePower} vs ${waveResult.wavePower})`
                : `The line bends... (${waveResult.defensePower} vs ${waveResult.wavePower})`}
            </div>
          )}
        </div>
      )}
      {selectedAwoken !== null && (() => {
        const placement = placements.find(p => p.awakenedId === selectedAwoken);
        const awoken = tenderItems.find(a => a.id === selectedAwoken);
        if (!placement || !awoken) return null;
        // Position the picker over the Awoken in the field
        const tile = tiles.find(t => t.id === placement.tileId);
        if (!tile) return null;
        const size = 24 * zoom;
        const HEIGHT_PX = 22 * zoom;
        const { px, py } = isoOffset(tile.q, tile.r, size);
        const cx = 250 + px + pan.x;
        const cy = 170 + py + pan.y - (tile.height || 0) * HEIGHT_PX;
        // Render as HTML overlay positioned over the Awoken
        return (
          <div 
            className={`stance-picker-field ${stanceMinimized ? "minimized" : ""}`} 
            style={{
              left: `${(cx / 500) * 100}%`,
              top: `${(cy / 340) * 100}%`,
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setSelectedAwoken(null);
              setAttackTargeting(false);
              setMoveTargeting(false);
              setStanceMinimized(false);
            }}
          >
            {stanceMinimized && (
              <button 
                className="stance-minimized-badge"
                onClick={() => setStanceMinimized(false)}
                title="Expand stance options"
              >
                {placement.stance === "attack" ? "⚔" : placement.stance === "defense" ? "🛡" : placement.stance === "binding" ? "✦" : "○"}
              </button>
            )}
            {!stanceMinimized && (<>
            <div className="stance-picker-name">{awoken.name}</div>
            <div className="stance-picker-stats">
              <span title="Power">⚔ {awoken.power}</span>
              <span title="Toughness">🛡 {awoken.toughness}</span>
              <span title="Health">❤ {awokenHp.get(awoken.id) ?? awoken.toughness}/{awoken.toughness}</span>
              <span title="Level">Lv {awoken.level ?? Math.floor(Math.sqrt((awoken.experience ?? 0) / 100))}</span>
              <span title="Experience">✦ {awoken.experience ?? 0} XP{typeof awoken.xp_into_level === "number" && typeof awoken.xp_for_next_level === "number" ? ` (${awoken.xp_into_level}/${awoken.xp_for_next_level} to Lv ${(awoken.level ?? 0) + 1})` : ""}</span>
            </div>
            <div className="stance-picker-elements">
              {(() => {
                // Elemental points: pieces = 1 pt; aspects = 1 pt per level (I/II/III).
                // Feeds the stronger-element calc for terraforming.
                const pts: Record<string, number> = {};
                for (const l of (awoken.layers || [])) {
                  const el = elementForPiece(l.name || "", (l as any).element);
                  const w = l.category === "aspect" ? ((l as any).aspectLevel ?? 1) : 1;
                  pts[el] = (pts[el] ?? 0) + w;
                }
                return Object.entries(pts).map(([el, n]) => (
                  <span key={el} className={`element-tag ${el}`} title={`${n} ${el} point${n === 1 ? "" : "s"}`}>
                    {el === "tide" ? "🌊" : el === "sky" ? "🌪️" : el === "stone" ? "🪨" : el === "root" ? "🌱" : "🔥"} {el} {n}
                  </span>
                ));
              })()}
            </div>
            <div className="stance-buttons">
              <button
                className={`stance-btn ${placement.stance === "attack" ? "active" : ""}`}
                onClick={() => handleSetStance(selectedAwoken, "attack")}
                title="Focus all power on one tile. Attack an adjacent cursed tile to purify it.">
                ⚔ Attack
              </button>
              <button
                className={`stance-btn ${placement.stance === "defense" ? "active" : ""}`}
                onClick={() => handleSetStance(selectedAwoken, "defense")}
                title="Hold ground. Generates 1 energy. Protects your purified land.">
                🛡 Defense
              </button>
              <button
                className={`stance-btn ${placement.stance === "binding" ? "active" : ""}`}
                onClick={() => handleSetStance(selectedAwoken, "binding")}
                title="Channel power into the land. +3 to own tile, +1 to neighbors. Costs 2 energy.">
                ✦ Binding
              </button>
              {(() => {
                // Check if this Awoken has Fire III aspect
                const layers = awoken.layers || [];
                const aspect = layers.find((l: any) => l.category === "aspect");
                const isFireIII = aspect && 
                  (/fire/i.test(aspect.name || "") || (aspect as any).aspectElement === "fire") && 
                  ((aspect as any).aspectLevel === 3 || /III/.test(aspect.name || ""));
                if (!isFireIII) return null;
                return (
                  <button
                    className="stance-btn ignite"
                    onClick={async () => {
                      try {
                        const result = await api.igniteWildfire({ awakenedId: selectedAwoken, tileId: placement.tileId });
                        alert(`Wildfire ignited! ${result.ignitedTileIds.length} tiles burning.`);
                        const refreshed = await api.getTerritory();
                        setTiles(refreshed.tiles);
                        onUpdate();
                      } catch (e) {
                        alert((e as Error).message || "Ignition failed");
                      }
                    }}
                    title="Ignite wildfire (13 energy). Requires Fire III aspect.">
                    🔥 Ignite (13⚡)
                  </button>
                );
              })()}
              <button
                className="stance-btn dissipate"
                onClick={async () => {
                  if (confirm("Dissipate this Awoken? It will enter 8h re-coalescence.")) {
                    try {
                      await api.dissipateAwoken({ awakenedId: selectedAwoken });
                      setSelectedAwoken(null);
                      onUpdate();
                    } catch (e) {
                      console.error("Dissipate failed", e);
                    }
                  }
                }}
                title="Voluntarily dissipate. 8h re-coalescence (double the 4h).">
                🌫 Dissipate
              </button>
            </div>
            <div className="feed-energy-row" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Feed energy → XP (×2):</span>
              {[1, 5, 10].map(amt => (
                <button
                  key={amt}
                  className="stance-btn"
                  disabled={energy < amt}
                  title={`Give ${amt} energy, ${awoken.name} gains ${amt * 2} XP`}
                  onClick={async () => {
                    try {
                      const r = await api.feedEnergy({ awakenedId: selectedAwoken, energy: amt });
                      setEnergy(e => Math.max(0, e - amt));
                      onUpdate();
                      alert(r.leveledUp ? `${awoken.name} fed ${amt}⚡ → +${r.xpGain} XP. Level ${r.newLevel}!${r.statPointsGained ? ` +${r.statPointsGained} stat point${r.statPointsGained > 1 ? "s" : ""}.` : ""}` : `${awoken.name} fed ${amt}⚡ → +${r.xpGain} XP.`);
                    } catch (e) {
                      alert((e as Error).message || "Feeding failed");
                    }
                  }}
                >
                  {amt}⚡ → {amt * 2} XP
                </button>
              ))}
            </div>
            {attackTargeting && placement.stance === "attack" && (
              <div className="attack-hint">Tap an adjacent cursed tile to attack (1 energy)</div>
            )}
            {moveTargeting && (
              <div className="attack-hint">Tap an adjacent purified tile to move ({moveCost(awoken.power)} energy)</div>
            )}
            {!attackTargeting && !moveTargeting && (
              <button
                className="stance-btn"
                onClick={() => { setMoveTargeting(true); setStanceMinimized(true); }}
                title={`Move to an adjacent tile. Costs ${moveCost(awoken.power)} energy.`}>
                ➤ Move ({moveCost(awoken.power)}⚡)
              </button>
            )}
            <button className="stance-close" onClick={() => { setSelectedAwoken(null); setAttackTargeting(false); setMoveTargeting(false); setTargetHexId(null); clearHexConfirm(); setStanceMinimized(false); }}>
              ✕
            </button>
            </>)}
          </div>
        );
      })()}
      <div className="territory-battle-trigger">
        {wavesCleared >= 3 && (
          <button className="abtn battle-cta" onClick={() => {
            setIsBossFight(true);
            // Boss level = how many bosses beaten + 1
            const bl = (parseInt(localStorage.getItem("awoken-bosses-beaten") || "0") + 1);
            setBossLevel(bl);
            handleDefend(true, bl);
          }} style={{ borderColor: "#ffd700" }}>
            👑 BOSS FIGHT
          </button>
        )}
        {battleActive && (
          <span style={{ marginLeft: 8 }}>
            <button className="abtn small" onClick={() => setBattlePaused(p => !p)} title={battlePaused ? "Resume" : "Pause"}>
              {battlePaused ? "▶" : "⏸"}
            </button>
            <button className={`abtn small ${battleManual ? "active" : ""}`} onClick={() => setBattleManual(m => !m)} title={battleManual ? "Auto battle" : "Manual step-through"} style={{ marginLeft: 4 }}>
              {battleManual ? "⏭ Manual" : "▶ Auto"}
            </button>
            {battleManual && (
              <button className="abtn small" onClick={() => doInitiativePhase()} title="Next attack" style={{ marginLeft: 4 }}>
                → Step
              </button>
            )}
            <button className="abtn small" onClick={() => setBattleSpeed(s => s === 1.3 ? 0.6 : s === 0.6 ? 2.5 : 1.3)} title="Battle speed" style={{ marginLeft: 4 }}>
              {battleSpeed === 0.6 ? "2x" : battleSpeed === 2.5 ? "0.5x" : "1x"}
            </button>
          </span>
        )}

        {!battleActive && wavesCleared < 3 && wave && (() => {
          // Wave recovery (fix list #4): after a victory the next wave
          // gathers for a while — show the wait instead of inviting a
          // fight the server would refuse.
          const readyMs = wave.nextWaveAt ? new Date(wave.nextWaveAt).getTime() - Date.now() : 0;
          if (readyMs > 0) {
            const mins = Math.ceil(readyMs / 60000);
            const label = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
            return (
              <button className="abtn" disabled style={{ marginLeft: 8, borderColor: "#666", opacity: 0.75 }}>
                🌑 Next Unraveling in {label}
              </button>
            );
          }
          return (
            <button className="abtn" onClick={startBattle} style={{ marginLeft: 8, borderColor: "#ff4444" }}>
              ⚔ Face the Next Unraveling ({wavesCleared + 1}/3)
            </button>
          );
        })()}
        {wavesCleared >= 3 && wave && (
          <span style={{ marginLeft: 12, color: "#ffd700", fontWeight: "bold" }}>
            All Unravelings broken — Boss awaits!
          </span>
        )}
        {battleActive && (
          <span style={{ marginLeft: 12, color: "#ff6666", fontWeight: "bold" }}>
            Unraveling {battleWave}/3 — Turn {turnNumber} ({turnPhase === "towers" ? "Towers" : turnPhase === "initiative" ? "Initiative" : "..."})
          </span>
        )}
        {simActive && (
          <button className="abtn small" onClick={stopSim} style={{ marginLeft: 8 }}>
            ⏹ Stop Sim
          </button>
        )}
      </div>

      <div className="territory-map"
        onPointerDown={(e) => {
          // Modality follows the actual input (#13 refined): a touch
          // raises mist + confirm; a mouse glows on hover and commits
          // on click. Pens count as touch — they tap like fingers.
          setTouchMode(e.pointerType !== "mouse");
        }}
        onClick={() => {
        // Clicking empty map dismisses the stance box
        setSelectedAwoken(null);
        setAttackTargeting(false);
        setMoveTargeting(false);
        setTargetHexId(null);
        clearHexConfirm();
      }}>
        <svg viewBox="0 0 500 340" className="territory-svg" style={{ width: "100%", height: "100%" }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            if (e.button === 2) { // Right click
              dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
            }
          }}
          onMouseMove={(e) => {
            if (dragRef.current) {
              const dx = e.clientX - dragRef.current.x;
              const dy = e.clientY - dragRef.current.y;
              setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
            }
          }}
          onMouseUp={(e) => {
            if (e.button === 2) dragRef.current = null;
          }}
          onMouseLeave={() => { dragRef.current = null; }}>
          {renderGrid()}
          {/* Simulation units */}
          {battleUnits.map(u => {
            const imgSrc = enemyImage(u.type) || ENEMY_IMGS[u.type] || "";
            return (
            <g key={`battle-${u.id}`} transform={`translate(${u.x},${u.y})`}>
              {imgSrc ? (
                <image href={imgSrc} x="-12" y="-12" width="24" height="24" />
              ) : (
                <circle r="8" fill="#3a1a1a" stroke="#ff4444" strokeWidth="1.5" />
              )}
              <rect x="-10" y="-14" width="20" height="3" fill="#333" />
              <rect x="-10" y="-14" width={20 * (u.hp / u.maxHp)} height="3" fill="#ff4444" />
            </g>
            );
          })}
          {simUnits.map(u => (
            <g key={`sim-${u.id}`} transform={`translate(${u.x},${u.y})`}>
              <circle r={8} fill={u.type === "unraveler" ? "#1a0a2a" : "#2a1a0a"} stroke="#ff4444" strokeWidth={1.5} opacity={0.9} />
              <text textAnchor="middle" dy={3} fontSize={8}>{u.type === "unraveler" ? "🌀" : "💥"}</text>
              {/* HP bar */}
              <rect x={-10} y={-14} width={20} height={3} fill="#333" />
              <rect x={-10} y={-14} width={20 * (u.hp / u.maxHp)} height={3} fill={u.hp / u.maxHp > 0.5 ? "#4f4" : "#f44"} />
            </g>
          ))}
        </svg>
      </div>
      {hexNotice && (
        <div className="hex-notice" role="alert" aria-live="polite">
          <p>{hexNotice}</p>
        </div>
      )}
      {hexConfirm && (() => {
        // The touch confirm (fix list #13 refined): the misted hex is
        // only a promise until the Tender speaks here.
        const tile = tiles.find(t => t.id === hexConfirm.tileId);
        const actor = selectedAwoken !== null ? tenderItems.find(a => a.id === selectedAwoken) : undefined;
        let text = "";
        let confirmLabel = "Confirm";
        if (hexConfirm.kind === "attack") {
          text = `${actor?.name ?? "Your Awoken"} will strike this cursed hex — its thorns answer back.`;
          confirmLabel = "Strike";
        } else if (hexConfirm.kind === "move") {
          text = `${actor?.name ?? "Your Awoken"} will move to this hex — ${actor ? moveCost(actor.power) : 1}⚡.`;
          confirmLabel = "Move";
        } else {
          const names = battlePool.map(i => hand[i]).filter(Boolean).map(a => a.name).join(", ");
          const cost = battlePool.map(i => hand[i]).filter(Boolean).reduce((sum, a) => sum + deployCost(a.power), 0);
          text = tile?.cursed
            ? `${names || "The readied company"} will assault this hex — if their combined power breaks the corruption, the land becomes yours. ${cost}⚡.`
            : `${names || "The readied company"} will take position on this hex. ${cost}⚡.`;
          confirmLabel = "Send them";
        }
        return (
          <div className="hex-confirm" role="dialog" aria-live="polite">
            <p>{text}</p>
            <div className="hex-confirm-actions">
              <button type="button" className="abtn" onClick={runHexConfirm}>{confirmLabel}</button>
              <button type="button" className="abtn ghost" onClick={clearHexConfirm}>Not yet</button>
            </div>
          </div>
        );
      })()}
      {/* Bottom dock: energy orb + hand */}
      <div className="energy-orb-fixed">
        <EnergyTimer />
      </div>
      <div className="bottom-dock">
        <div className="hand-label">Tap cards to ready them for battle — then tap a purified hex to deploy</div>
        <div className="dock-row">
        {battlePool.length > 0 && (
          <div className="battle-pool">
            <div className="battle-pool-label">Ready for battle ({battlePool.length}/4)</div>
            <div className="battle-pool-cards">
              {battlePool.map(i => {
                const a = hand[i];
                if (!a) return null;
                const el = dominantElement(a);
                return (
                  <button key={a.id} className="battle-pool-card" onClick={() => toggleBattlePool(i)} title="Remove">
                    <Corner element={el} className="hcorner tl" />
                    <Corner element={el} className="hcorner br" />
                    <img src={a.image_url} alt={a.name} />
                    <div className="battle-pool-card-name">{a.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="dock-hand">
          {hand.map((a, i) => {
            const el = dominantElement(a);
            const level = a.level ?? 0;
            const xp = a.experience ?? 0;
            const progress = a.xp_progress ?? 0;
            return (
            <button key={a.id} className={`dock-card ${battlePool.includes(i) ? "in-pool" : ""} ${applyingAspect ? "apply-target" : ""} ${courtMarks.championId === a.id ? "dock-court-champion" : courtMarks.housedIds.has(a.id) ? "dock-court-housed" : ""}`}
              title={courtMarks.championId === a.id ? "Your champion — the court stays in hand for battles" : courtMarks.housedIds.has(a.id) ? "Housed in the Hall — the court stays in hand for battles" : undefined}
              onClick={async () => {
                if (applyingAspect) {
                  try {
                    const oldP = a.power ?? 0, oldT = a.toughness ?? 0;
                    const result: any = await api.call("applyAspect", { awakenedId: a.id, inventoryAspectId: applyingAspect.id });
                    setApplyingAspect(null);
                    await onUpdate();
                    setCelebration({
                      awoken: a,
                      aspect: applyingAspect,
                      element: result.element,
                      newLevel: result.newLevel,
                      oldPower: oldP, oldToughness: oldT,
                      newPower: oldP + 1, newToughness: oldT + 1,
                    });
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Failed to apply");
                  }
                  return;
                }
                toggleBattlePool(i);
              }}>
              <Corner element={el} className="hcorner tl" />
              <Corner element={el} className="hcorner br" />
              <img src={a.image_url} alt={a.name} />
              <div className="dock-card-name">{a.name}</div>
              <div className="dock-card-stats">{a.power}/{a.toughness}</div>
              <div className="dock-xp" title={`Level ${level} — ${xp} XP`}>
                <div className="dock-xp-bar" style={{ width: `${progress * 100}%` }} />
                <span className="dock-xp-text">Lv {level}</span>
              </div>
              {(a.stat_points ?? 0) > 0 && (
                <div className="dock-stat-points" onClick={(e) => {
                  e.stopPropagation();
                  const stat = window.confirm("Add to Power? (Cancel = Toughness)") ? "power" : "toughness";
                  api.assignStatPoint({ awakenedId: a.id, stat }).then(() => onUpdate()).catch(console.error);
                }}>
                  +{a.stat_points} point!
                </div>
              )}
            </button>
            );
          })}
          {hand.length === 0 && <div className="dock-empty">All Awoken stand on the field.</div>}
        </div>
        </div>
      </div>
      <div className="nav-compass">
        <button className="compass-btn north" onClick={() => setPan(p => ({ ...p, y: p.y + 40 }))} aria-label="Pan up">▲</button>
        <button className="compass-btn west" onClick={() => setPan(p => ({ ...p, x: p.x + 40 }))} aria-label="Pan left">◀</button>
        <button className="compass-btn east" onClick={() => setPan(p => ({ ...p, x: p.x - 40 }))} aria-label="Pan right">▶</button>
        <button className="compass-btn south" onClick={() => setPan(p => ({ ...p, y: p.y - 40 }))} aria-label="Pan down">▼</button>
        <button className="compass-btn zoom-in" onClick={() => setZoom(z => Math.min(z + 0.2, 3))} aria-label="Zoom in">＋</button>
        <button className="compass-btn zoom-out" onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))} aria-label="Zoom out">－</button>
        <button className="compass-btn" onClick={() => {
          if (!tracksRef.current.length) {
            tracksRef.current = [{ name: "Aurora", url: "/music/aurora.mp3" }];
            setLibraryTracks(tracksRef.current);
          }
          const sounding = !!audioRef.current && !audioRef.current.paused;
          if (musicOn && sounding) {
            audioRef.current!.pause();
            setMusicOn(false);
          } else {
            // First tap (or resume): start the mood's playlist.
            if (audioRef.current && audioRef.current.src) {
              audioRef.current.play().catch(() => {});
            } else {
              playSongAt(trackIdxRef.current);
            }
            setMusicOn(true);
          }
        }} aria-label="Toggle music" title={(libraryTracks[trackIdx]?.name) ?? "Music"}>
          {musicOn ? "🎶" : "🎵"}
        </button>
      </div>
      {showTargetMap && waveTarget && wave && (
        <div className="target-map-overlay">
          <div className="target-map-modal">
            <h2 style={{ color: "#ff6666", fontFamily: "Georgia, serif" }}>⚠ The Unraveling Comes</h2>
            <p style={{ color: "#aaa" }}>Wave {wave.waveNumber} targets this territory:</p>
            <div className="target-minimap" style={{ position: "relative", width: "280px", height: "200px", margin: "16px auto" }}>
              {(() => {
                // Find bounds to center the territory
                const qs = tiles.map(t => t.q);
                const rs = tiles.map(t => t.r);
                const minQ = Math.min(...qs), maxQ = Math.max(...qs);
                const minR = Math.min(...rs), maxR = Math.max(...rs);
                const centerQ = (minQ + maxQ) / 2;
                const centerR = (minR + maxR) / 2;
                const scale = 22; // hex size
                return tiles.map(t => {
                  const isTarget = waveTarget.tile ? t.id === waveTarget.tile.id : false;
                  // Hex positioning from the shared iso basis, scaled down
                  const { px, py } = isoOffset(t.q - centerQ, t.r - centerR, scale);
                  return (
                    <div
                      key={t.id}
                      className={`target-hex ${isTarget ? "targeted" : ""} ${t.cursed ? "cursed" : ""}`}
                      title={isTarget ? "Under attack!" : t.cursed ? "Cursed wilds" : "Purified"}
                      style={{
                        position: "absolute",
                        left: `calc(50% + ${px}px)`,
                        top: `calc(50% + ${py}px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  );
                });
              })()}
            </div>
            <p style={{ color: waveTarget.defenderIds.length > 0 ? "#8f8" : "#fa0", fontSize: 14 }}>
              {waveTarget.defenderIds.length > 0
                ? `${waveTarget.defenderIds.length} defender(s) hold this land.`
                : "No defenders! You must play Awoken from hand (costs energy)."}
            </p>
            <button className="abtn battle-cta" onClick={handleTargetConfirmed}>
              ⚔ Defend
            </button>
            <button className="abtn small" onClick={() => setShowTargetMap(false)} style={{ marginLeft: 8, color: "#ffeebb", borderColor: "#b89b5e" }}>
              Retreat
            </button>
          </div>
        </div>
      )}
      {showBattleground && wave && (() => {
        // Use waveTarget tile if available, else pick any non-bastion purified tile.
        // Bastion (center) is the last resort — only if no other targets exist.
        const fallbackTile = (() => {
          const nonBastion = tiles.filter(t => !(t.q === 0 && t.r === 0) && !t.cursed);
          if (nonBastion.length > 0) {
            return nonBastion[Math.floor(Math.random() * nonBastion.length)];
          }
          return tiles.find(t => t.q === 0 && t.r === 0);
        })();
        const targetTileId = waveTarget?.tile?.id ?? fallbackTile?.id;
        const defs = placements
          .filter(p => p.tileId === targetTileId)
          .map(p => {
            const aw = tenderItems.find(a => a.id === p.awakenedId);
            return aw ? { placementId: p.id, awoken: aw, stance: p.stance, tileId: p.tileId } : null;
          })
          .filter(Boolean) as { placementId: number; awoken: Awakened; stance: string }[];
        return (
          <Battleground
            defenders={defs}
            thornWallTiles={buildings.filter(b => b.buildingType === "thorn-wall" && b.status === "active").map(b => b.tileId)}
            watchtowerTiles={buildings.filter(b => b.buildingType === "watchtower" && b.status === "active").map(b => b.tileId)}
            towerDamage={gameConfig?.buildings?.["watchtower"]?.damage ?? 3}
            thornDamage={gameConfig?.buildings?.["thorn-wall"]?.damage ?? 1}
            towerPowerBonus={gameConfig?.buildings?.["watchtower"]?.powerBonus ?? 2}
            enemyConfig={gameConfig?.enemies}
            towerAuraTiles={(() => {
              const towers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
              const aura = new Set<number>();
              const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
              for (const t of towers) {
                aura.add(t.tileId);
                const tile = tiles.find(tl => tl.id === t.tileId);
                if (!tile) continue;
                for (const [dq, dr] of dirs) {
                  const adj = tiles.find(tl => tl.q === tile.q + dq && tl.r === tile.r + dr);
                  if (adj) aura.add(adj.id);
                }
              }
              return [...aura];
            })()}
            wave={wave}
            hand={hand}
            assets={assets}
            energy={energy}
            maxEnergy={maxEnergy}
            onBattleEnd={handleBattleEnd}
            onClose={() => setShowBattleground(false)}
            bonusTiles={bonusTiles}
            onVictoryDetected={handleVictoryDetected}
          />
        );
      })()}
      {/* Castle button - toggles building menu (disabled during battle) */}
      <button
        className={`castle-toggle ${showBuildingMenu ? "open" : ""}`}
        onClick={() => { if (!battleActive) setShowBuildingMenu(v => !v); }}
        title={battleActive ? "Cannot build during battle" : "Buildings"}
        disabled={battleActive}
        style={battleActive ? { opacity: 0.4, cursor: "not-allowed" } : {}}
      >
        🏰
      </button>

      {/* Right-side building panel */}
      {!tutorialDone && !objectivesMet && (
        <Tutorial onComplete={() => setTutorialDone(true)} />
      )}
      {showTutorial && (
        <Tutorial onComplete={() => setShowTutorial(false)} />
      )}
      {/* Question mark to reopen tutorial */}
      <button
        className="tutorial-help-btn"
        onClick={() => setShowTutorial(true)}
        title="Show tutorial"
        aria-label="Show tutorial"
      >
        ?
      </button>
      {objectivesMet && !tutorialDone && (
        <div className="tutorial-complete-banner">
          <p>✦ Training complete — 7 tiles purified, shrine raised. The land is yours.</p>
          <button className="abtn small" onClick={() => {
            localStorage.setItem("awoken-tutorial-done", "1");
            setTutorialDone(true);
          }}>Begin →</button>
        </div>
      )}
      {showBuildingMenu && (
        <div className="building-side-panel">
          <button
            className={`abtn small demo-toggle ${demoMode ? "active" : ""}`}
            onClick={() => setDemoMode(v => !v)}
            style={demoMode ? { background: "#aa3333", borderColor: "#ff6666" } : {}}
            title="Demolish mode: tap buildings to remove them"
          >
            {demoMode ? "🔨 Demolishing… (tap to exit)" : "🔨 Demolish"}
          </button>
          <BuildingMenu
            onSelect={(b) => { setSelectedBuilding(b); }}
            selected={selectedBuilding}
            energy={energy}
            alwaysOpen
          />
        </div>
      )}

      {/* Builder selection popup */}
      {pendingTile !== null && selectedBuilding && (() => {
        const tileAwoken = placements
          .filter(p => p.tileId === pendingTile)
          .map(p => {
            const aw = tenderItems.find(a => a.id === p.awakenedId);
            return aw ? { ...aw, placement: p } : null;
          })
          .filter(Boolean);
        const helperCount = selectedBuilders.length;
        const timeDivisor = Math.pow(2, helperCount);
        const baseMinutes = selectedBuilding.buildMinutes;
        const actualMinutes = Math.max(1, Math.floor(baseMinutes / timeDivisor));
        return (
          <div className="admin-popup" onClick={() => { setPendingTile(null); setSelectedBuilders([]); }}>
            <div className="admin-popup-inner" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <h3>🗼 {selectedBuilding.name}</h3>
              <p className="quiet">Tap Awoken on this tile to assign as builders. Each halves the build time.</p>
              <div className="builder-grid">
                {tileAwoken.map((aw: any) => {
                  const isSelected = selectedBuilders.includes(aw.id);
                  const isBuilding = aw.placement.stance === "building";
                  return (
                    <button
                      key={aw.id}
                      className={`builder-card ${isSelected ? "selected" : ""}`}
                      disabled={isBuilding}
                      onClick={() => {
                        setSelectedBuilders(prev =>
                          isSelected ? prev.filter(id => id !== aw.id) : [...prev, aw.id]
                        );
                      }}
                    >
                      <span className="builder-name">{aw.name}</span>
                      <span className="builder-stance">{isBuilding ? "🔨 building" : aw.placement.stance}</span>
                      {isSelected && <span className="builder-check">✓</span>}
                    </button>
                  );
                })}
                {tileAwoken.length === 0 && <p className="quiet">No Awoken on this tile. The build will take full time.</p>}
              </div>
              <div className="builder-summary">
                <span>⏱ {baseMinutes >= 60 ? `${baseMinutes/60}h` : `${baseMinutes}m`} → <strong>{actualMinutes >= 60 ? `${(actualMinutes/60).toFixed(1)}h` : `${actualMinutes}m`}</strong></span>
                <span>🂠 {helperCount} helper{helperCount === 1 ? "" : "s"}</span>
              </div>
              {buildError && <p className="notice error">{buildError}</p>}
              <div className="wave-edit-actions">
                <button className="abtn" onClick={async () => {
                  try {
                    setBuildError(null);
                    await api.placeBuilding({
                      tileId: pendingTile,
                      buildingType: selectedBuilding.type,
                      builderIds: selectedBuilders,
                    });
                    setPendingTile(null);
                    setSelectedBuilders([]);
                    setSelectedBuilding(null);
                    const r = await api.getBuildings();
                    setBuildings(r.buildings);
                    onUpdate();
                  } catch (e) {
                    setBuildError((e as Error).message || "Build failed");
                  }
                }}>Begin Build</button>
                <button className="abtn small" onClick={() => { setPendingTile(null); setSelectedBuilders([]); }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Spark claim animation */}
      {sparkAnimation && (
        <div className={`spark-animation ${sparkAnimation.phase}`}>
          <svg className="glyph-svg large" viewBox="0 0 60 24" width="120" height="48">
            <path d="M14,20 Q10,14 14,8 Q16,4 14,2 Q20,4 22,10 Q24,6 22,2 Q28,6 26,12 Q25,16 28,18 L60,18" fill="none" stroke="#ff6600" strokeWidth="2" opacity="0.95"/>
            <path d="M18,20 Q16,16 18,12 Q20,14 19,17" fill="none" stroke="#ff6600" strokeWidth="1.2" opacity="0.7"/>
            <circle cx="22" cy="14" r="2" fill="#ff6600" opacity="0.6"/>
          </svg>
          <div className="spark-text">Fire found!</div>
        </div>
      )}
    </div>
  );
}
