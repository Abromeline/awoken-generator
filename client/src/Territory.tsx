import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Awakened, type TerritoryTile, type FieldPlacement } from "./api";
import EnergyTimer from "./EnergyTimer";

import FieldAwoken from "./FieldAwoken";
import { Corner, elementForPiece, type Element } from "./App";
import { randomWhisper, pickReturnReport } from "./whispers";
import Friends from "./Friends";
import { trackPlayer, type TrackData } from "./trackPlayer";
import Battleground from "./Battleground";
import BuildingMenu, { buildingImage, wheatStageImage } from "./BuildingMenu";
import Tutorial, { tutorialComplete } from "./Tutorial";
import { pickBirthLayers, composeBirth } from "./birth";
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

interface Props {
  tenderItems: Awakened[];
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
  onUpdate: () => void;
}


// Dominant element of an Awoken, for corner motifs.
function dominantElement(a: Awakened): Element {
  const counts: Record<Element, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
  for (const layer of a.layers ?? []) {
    const el = elementForPiece(layer.name);
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
  const [selectedBuilding, setSelectedBuilding] = useState<any>(null);
  const [showBuildingMenu, setShowBuildingMenu] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialDone, setTutorialDone] = useState(() => localStorage.getItem("awoken-tutorial-done") === "1");
  const [objectivesMet, setObjectivesMet] = useState(false);
  const [buildings, setBuildings] = useState<any[]>([]);

  const [gameConfig, setGameConfig] = useState<any>(null);
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [selectedBuilders, setSelectedBuilders] = useState<number[]>([]);
  const [tiles, setTiles] = useState<TerritoryTile[]>([]);

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
  // Load enabled tracks for the territory page and auto-start music
  useEffect(() => {
    api.listBattleTracks().then(({ tracks }) => {
      const forTerritory = tracks.filter(t => t.enabled && (t.pages || ["territory"]).includes("territory"));
      Promise.all(forTerritory.map(async t => {
        const { trackData } = await api.getBattleTrack({ id: t.id });
        if (trackData.startsWith("data:audio") || trackData.startsWith("/music/")) {
          return { name: t.name, url: trackData };
        }
        return null;
      })).then(results => {
        const valid = results.filter(Boolean) as { name: string; url: string }[];
        if (valid.length) {
          setLibraryTracks(valid);
          // Auto-start music
          setMusicOn(true);
          setTrackIdx(0);
        }
      });
    }).catch(() => {});
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
  const [attackTargeting, setAttackTargeting] = useState(false); // true when attack stance Awoken awaits target
  const [stanceMinimized, setStanceMinimized] = useState(false); // bubble collapses after stance pick
  const [moveTargeting, setMoveTargeting] = useState(false); // true when move mode awaits target tile
  const [wave, setWave] = useState<{ waveNumber: number; wavesDefeated: number; frayCount: number; unravelers: number; totalPower: number } | null>(null);
  // Wave simulation (preview only, no DB changes)
  const [simActive, setSimActive] = useState(false);
  const [battleActive, setBattleActive] = useState(false);
  const [battleWave, setBattleWave] = useState(0);
  const [battleUnits, setBattleUnits] = useState<typeof simUnits>([]);
  const [betweenWaves, setBetweenWaves] = useState(false);
  const [turnPhase, setTurnPhase] = useState<"towers" | "initiative" | "enemies" | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [wavesCleared, setWavesCleared] = useState(0);
  const [tileHp, setTileHp] = useState<Map<number, number>>(new Map());
  const [awokenHp, setAwokenHp] = useState<Map<number, number>>(new Map());
  const [battlePaused, setBattlePaused] = useState(false);
  const [battleSpeed, setBattleSpeed] = useState(1.3);
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
  const [showLegends, setShowLegends] = useState(false);
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

  // Energy cap: 5 base + power-based bonus per Awoken (hand AND field).
  // 1-3 power: +1, 4-6: +2, 7-9: +3, 10+: +4. Stronger beings contribute more existence.
  // Defenders generate +1 max energy each — they hold the line and gather strength.
  const energyBonus = (power: number) => 1 + Math.floor((power - 1) / 3);
  const fieldAwoken = placements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
  const defenderCount = placements.filter(p => p.stance === "defense").length;
  const maxEnergy = 10
    + hand.reduce((sum, a) => sum + energyBonus(a.power), 0)
    + fieldAwoken.reduce((sum, a) => sum + energyBonus(a.power), 0)
    + defenderCount;

  // Deploy cost scales with power: 2 base + 1 per 3 power.
  // 1-3: 2, 4-6: 3, 7-9: 4, 10+: 5.
  const deployCost = (power: number) => 2 + Math.floor((power - 1) / 3);

  // Timed birth: every 4 hours, a new Awoken joins the hand
  const [birthStatus, setBirthStatus] = useState<{ ready: boolean; msUntil: number } | null>(null);

  // Whisper state: which field Awoken is speaking
  const [whisper, setWhisper] = useState<{ awakenedId: number; text: string } | null>(null);

  useEffect(() => {
    api.getBirthStatus().then(setBirthStatus).catch(() => {});
    const timer = setInterval(() => {
      api.getBirthStatus().then(setBirthStatus).catch(() => {});
    }, 60000); // Check every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api.getLegends().then(setLegends).catch(() => {});
    // Return report: an Awoken speaks of buildings and needs
    api.getTerritory().then(t => {
      if (t.mood) setMood(t.mood);
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

  const handleTimedBirth = async () => {
    try {
      const birthLayers = pickBirthLayers(assets.map(a => ({
        sourceId: a.sourceId, name: a.name, category: a.category,
        rarity: "common", power: null, toughness: null, imageUrl: a.imageUrl,
      })));
      if (birthLayers.length < 3) return;
      const imageBase64 = await composeBirth(birthLayers);
      const layerRefs = birthLayers.map(l => ({
        source_id: l.sourceId, name: l.name,
        category: l.category as "body" | "arms" | "aura" | "head",
        rarity: "common" as const, power: null, toughness: null,
      }));
      await api.claimTimedBirth({ layers: layerRefs, imageBase64 });
      const status = await api.getBirthStatus();
      setBirthStatus(status);
      onUpdate();
    } catch (e) {
      console.error("Timed birth failed", e);
    }
  };

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
    });
  }, []);

  // Hand = Awoken not on field (defined above for energy calc)

  const handleDeploy = async (tileId: number) => {
    if (battlePool.length === 0) return;
    const tile = tiles.find(t => t.id === tileId);
    if (!tile) return;
    const fighters = battlePool.map(i => hand[i]).filter(Boolean);
    if (fighters.length === 0) return;
    const totalCost = fighters.reduce((sum, a) => sum + deployCost(a.power), 0);
    if (energy < totalCost) return;
    const fighterIds = fighters.map(a => a.id);
    try {
      const result = await api.deployBattle({ awakenedIds: fighterIds, tileId });
      await refreshEnergy();
      const after = await api.getTerritory();
      setTiles(after.tiles);
      setPlacements(after.placements);
      setBattlePool([]);
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
    if (energy < 1) return; // Attacks cost 1 energy
    try {
      const result = await api.attackTile({ awakenedId: selectedAwoken, tileId }) as any;
      await refreshEnergy();
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
      onUpdate();
    } catch (e) {
      console.error("Attack failed", e);
      setAttackTargeting(false);
    }
  };

  // Move cost: 1 energy for small Awoken, up to 4 for fully powered.
  const moveCost = (power: number) => 1 + Math.floor((power - 1) / 3);

  const handleMove = async (tileId: number) => {
    if (selectedAwoken === null) return;
    const awoken = tenderItems.find(a => a.id === selectedAwoken);
    if (!awoken) return;
    const cost = moveCost(awoken.power);
    if (energy < cost) return;
    try {
      await api.moveAwoken({ awakenedId: selectedAwoken, tileId });
      await refreshEnergy();
      const refreshed = await api.getTerritory();
      setPlacements(refreshed.placements);
      setSelectedAwoken(null);
      setMoveTargeting(false);
      onUpdate();
    } catch (e) {
      console.error("Move failed", e);
      setMoveTargeting(false);
    }
  };

  const handleDefend = async () => {
    // Always ensure wave data — create a default if fetch fails
    let w = wave;
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
    const k = size / 796;
    const px = t.q * 1292 * k + t.r * 13 * k;
    const py = t.q * 475 * k + t.r * 946 * k;
    return { cx: originX + px + pan.x, cy: originY + py + pan.y - (t.height || 0) * HEIGHT_PX };
  };
  const startSim = () => {
    if (!wave || !tiles.length) return;
    // Find cursed perimeter tiles (cursed tiles adjacent to purified)
    const cursed = tiles.filter(t => t.cursed);
    const purified = tiles.filter(t => !t.cursed);
    if (!cursed.length || !purified.length) return;
    
    // Spawn unravelers on random cursed tiles
    const units: typeof simUnits = [];
    let id = 0;
    // Fray: power 1-2, hp 3. Unraveler: power 4, hp 6.
    for (let i = 0; i < wave.frayCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "fray", tileId: tile.id, hp: 3, maxHp: 3, power: 2, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    for (let i = 0; i < wave.unravelers; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "unraveler", tileId: tile.id, hp: 6, maxHp: 6, power: 4, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    
    setSimUnits(units);
    setSimActive(true);
    
    // Get tower/defender info
    const watchtowers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
    const thornWalls = buildings.filter(b => b.buildingType === "thorn-wall" && b.status === "active");
    
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
                hp -= 3;
              }
            }
            // Thorn Wall: 1 damage when entering tile
            const wall = thornWalls.find(w => w.tileId === closestTile.id);
            if (wall && u.tileId !== closestTile.id) {
              hp -= 1;
            }
            // Defenders: Awoken on tile deal power as damage
            const defenders = placements.filter(p => p.tileId === closestTile.id && p.stance === "defense");
            for (const d of defenders) {
              const aw = tenderItems.find(a => a.id === d.awakenedId);
              if (aw) {
                // Simplified: power = sum of piece powers (approx from awoken data)
                const power = (aw.power || 3);
                hp -= power * 0.1; // Small chip damage per tick
              }
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
    const frayCount = wave!.frayCount + (waveNum - 1) * 2;
    const unravelerCount = wave!.unravelers + (waveNum - 1);
    for (let i = 0; i < frayCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "fray", tileId: tile.id, hp: 3, maxHp: 3, power: 2, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    for (let i = 0; i < unravelerCount; i++) {
      const tile = cursed[Math.floor(Math.random() * cursed.length)];
      const { cx, cy } = simTilePos(tile);
      units.push({ id: id++, type: "unraveler", tileId: tile.id, hp: 6 + waveNum * 2, maxHp: 6 + waveNum * 2, power: 4, x: cx, y: cy, targetX: cx, targetY: cy });
    }
    setBattleUnits(units);
    setTurnPhase("towers");
    // Auto-advance through phases with delays for readability
    setTimeout(() => doTowerPhase(), 800);
  };

  /** Phase 1: All towers fire at range 3. */
  const doTowerPhase = () => {
    const watchtowers = buildings.filter(b => b.buildingType === "watchtower" && b.status === "active");
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
          updated = updated.map(u => u.id === best!.id ? { ...u, hp: u.hp - 3 } : u).filter(u => u.hp > 0);
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

    // Initialize Awoken HP if not set (HP = power + toughness)
    setAwokenHp(prev => {
      const next = new Map(prev);
      for (const f of fighters) {
        if (!next.has(f.awakenedId)) {
          next.set(f.awakenedId, (f.aw.power || 3) + (f.aw.toughness || 3));
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
            const dmg = Math.max(1, Math.round((c.aw.power || 3) * Math.pow(0.65, d)));
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
              updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id } : u);
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
                updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id } : u);
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
                  updated = updated.map(u => u.id === c.id ? { ...u, x: cx, y: cy, tileId: next.id } : u);
                }
              }
            }
          }
        }
      }
      return updated;
    });

    setTimeout(() => endTurn(), battleSpeed * 1000);
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
            const maxHp = (aw?.power || 3) + (aw?.toughness || 3);
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
    battleResolvedRef.current = false; // reset for next battle
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
      if (result.victory) {
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

  const toggleBattlePool = (index: number) => {
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
    // Tutorial handles the empty state now (no separate FirstTrial)
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
    // Isometric tiling vectors (measured from tile art, source px: E=(1292,475), SE=(13,946))
    // Scaled by s/796 where 796 = hex half-width in source px
    const tilePos = (t: any) => {
      const k = size / 796;
      const px = t.q * 1292 * k + t.r * 13 * k;
      const py = t.q * 475 * k + t.r * 946 * k;
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
                  if (b.buildingType !== "dream-wheat" || b.status !== "active") return;
                  const readyAt = b.readyAt ? new Date(b.readyAt).getTime() : Date.now();
                  const lastHarvest = b.lastHarvestAt ? new Date(b.lastHarvestAt).getTime() : readyAt;
                  const isReady = Date.now() - lastHarvest >= 4 * 60 * 60 * 1000;
                  if (isReady) {
                    try {
                      const r: any = await api.call("harvestWheat", { buildingId: b.id });
                      const rb = await api.getBuildings();
                      setBuildings(rb.buildings);
                      onUpdate();
                    } catch (err) { console.error("Harvest failed", err); }
                  }
                }}
                style={{ cursor: demoMode ? "pointer" : (pendingTile !== null || moveTargeting) ? "default" : b.buildingType === "dream-wheat" ? "pointer" : "default" }}>
                <image
                  href={b.buildingType === "dream-wheat" ? wheatStageImage(b) : buildingImage(b.buildingType)}
                  x={bpx.x - s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" ? 1 : 0.5)}
                  y={bpx.y - s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" ? 1 : 0.5)}
                  width={s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" ? 2 : 1)}
                  height={s * (b.buildingType === "dream-tree" || b.buildingType === "watchtower" ? 2 : 1)}
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
                    onClick={(e) => {
                      if (selectedBuilding) return; // Let tile handle it in build mode
                      if (moveTargeting || attackTargeting) return; // Only tiles selectable in move/attack mode
                      e.stopPropagation();
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
      // Flat-top hexagon points for click hit area
      const pts: string[] = [];
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 180 * (60 * k);
        const vx = cx + s * Math.cos(a);
        const vy = cy + s * Math.sin(a);
        pts.push(`${vx.toFixed(1)},${vy.toFixed(1)}`);
      }

      const placement = placements.find(p => p.tileId === t.id);
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5; // Purified land hovers above the cursed
      return (
        <g key={t.id} transform={`translate(0,${lift})`}>
          {/* Isometric tile: 1920x1280 PNG, hex face ~1345px wide. Scale to hex radius s. */}
          <image href={TERRAIN[t.cursed ? "cursed" : (TERRAIN[t.element] ? t.element : "neutral")]}
            x={cx - s * 1.289} y={cy - s * 0.687} width={s * 2.41} height={s * 1.608}
            preserveAspectRatio="xMidYMid meet"
            style={auraTiles.has(t.id) ? { filter: "drop-shadow(0 0 12px rgba(255,215,0,0.9)) brightness(1.15)" } : undefined} />
          {/* Curse HP on cursed tiles */}
          {t.cursed && (() => {
            const ring = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r));
            const maxHp = (t as any).curseMaxHp ?? (4 + ring * 6);
            const hp = (t as any).curseHp ?? maxHp;
            return (
              <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8}
                fill="#ff6666" opacity="0.95" fontWeight="bold">
                ♥ {hp}
              </text>
            );
          })()}
          <polygon points={pts.join(" ")} fill="rgba(0,0,0,0)"
            stroke={t.cursed && battlePool.length > 0 ? "#ff4444" : "transparent"}
            strokeWidth={2}
            opacity={t.cursed && battlePool.length > 0 ? 0.9 : 0}
            style={{
              cursor: (battlePool.length > 0 || attackTargeting) ? "pointer" : "default",
              filter: auraTiles.has(t.id) ? "drop-shadow(0 0 6px rgba(100,255,100,0.6))" : undefined,
              pointerEvents: "all"
            }}
            onClick={async () => {
              if (selectedBuilding && !t.cursed) {
                // Open builder selection for this tile
                setPendingTile(t.id);
                setSelectedBuilders([]);
              } else if (attackTargeting && selectedAwoken !== null) {
                handleAttack(t.id);
              } else if (moveTargeting && selectedAwoken !== null) {
                handleMove(t.id);
              } else if (battlePool.length > 0) {
                handleDeploy(t.id);
              }
            }} />

          {/* Awoken render in entity layer */}
        </g>
      );
    });
    return (
      <>
        {elements}
        {buildingElements}
        {awokenElements}
      </>
    );
  };

  const deedLabel = (deed: string) => {
    switch (deed) {
      case "wave_survived": return "Waves survived";
      case "curse_broken": return "Curses broken";
      case "battle_won": return "Battles won";
      case "level_10": return "Reached level 10";
      case "level_20": return "Reached level 20";
      case "level_30": return "Reached level 30";
      default: return deed;
    }
  };

/** Aspect attunement panel: hand-drawn element glyphs flowing into meters. Toggled by dock button. */
function AspectAttunement({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  const { data } = useQuery({
    queryKey: ["aspectAttunement"],
    queryFn: () => api.getAspectAttunement(),
    refetchInterval: 30000,
  });
  if (!data) return null;

  const glyphs: Record<string, React.ReactElement> = {
    tide: (
      <svg className="glyph-svg" viewBox="0 0 60 24" width="60" height="24">
        <path d="M2,12 Q10,4 18,12 T34,12 T50,12" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M2,17 Q10,9 18,17 T34,17 T50,17" fill="none" stroke="#d4af6a" strokeWidth="1" opacity="0.5"/>
        <path d="M50,12 L60,12" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
        <circle cx="50" cy="12" r="2" fill="#e8d5a0" opacity="0.8"/>
      </svg>
    ),
    sky: (
      <svg className="glyph-svg" viewBox="0 0 60 24" width="60" height="24">
        <path d="M28,12 m-8,0 a8,8 0 1,1 8,8 a6,6 0 1,0 -6,-6 a4,4 0 1,1 4,4" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M36,12 Q44,12 50,12 L60,12" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
        <circle cx="36" cy="12" r="1.5" fill="#e8d5a0" opacity="0.8"/>
      </svg>
    ),
    stone: (
      <svg className="glyph-svg" viewBox="0 0 60 24" width="60" height="24">
        <path d="M6,18 L18,4 L26,12" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M18,4 L18,14 M12,11 L24,11" fill="none" stroke="#d4af6a" strokeWidth="0.8" opacity="0.5"/>
        <path d="M26,12 Q36,12 44,12 L60,12" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
        <path d="M26,12 L32,18" fill="none" stroke="#d4af6a" strokeWidth="1" opacity="0.4"/>
      </svg>
    ),
    root: (
      <svg className="glyph-svg" viewBox="0 0 60 24" width="60" height="24">
        <path d="M10,18 Q10,6 22,6 Q34,6 34,14" fill="none" stroke="#d4af6a" strokeWidth="1.5" opacity="0.9"/>
        <path d="M34,14 Q38,14 42,14 L60,14" fill="none" stroke="#d4af6a" strokeWidth="1.5"/>
        <path d="M22,6 Q26,2 30,4" fill="none" stroke="#d4af6a" strokeWidth="1" opacity="0.6"/>
        <ellipse cx="30" cy="4" rx="3" ry="1.5" fill="#d4af6a" opacity="0.35" transform="rotate(-25 30 4)"/>
        <path d="M14,14 Q18,12 20,14" fill="none" stroke="#d4af6a" strokeWidth="0.8" opacity="0.4"/>
      </svg>
    ),
  };

  const elements = [
    { id: "tide", label: "Tide" },
    { id: "sky", label: "Sky" },
    { id: "stone", label: "Stone" },
    { id: "root", label: "Root" },
  ];

  return (
    <div className="aspect-attunement celestial">
      <button className="aspect-close" onClick={onClose} title="Close">✕</button>
      <div className="celestial-title">Aspect Attunement</div>
      {elements.map(el => {
        const points = data.levels[el.id] ?? 0;
        const pct = Math.min(100, (points / data.threshold) * 100);
        return (
          <div key={el.id} className="celestial-row" title={`${el.label}: ${points}/${data.threshold}`}>
            {glyphs[el.id]}
            <div className="celestial-track"><div className="celestial-progress" style={{ width: `${pct}%` }} /></div>
            <div className="celestial-orb" title={`${points} ${el.label} aspects saved`}>{points}</div>
          </div>
        );
      })}
      {data.inventory && data.inventory.length > 0 && (
        <div className="aspect-inventory-list">
          {data.inventory.map((item: any) => (
            <div key={item.id} className="aspect-inventory-item" title={item.name}>
              <span className="aspect-inv-element">{item.element}</span>
              <span className="aspect-inv-name">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

  return (
    <div className="territory-view">
      <AspectAttunement visible={showAspects} onClose={() => setShowAspects(false)} />
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
      {!showLegends && (
        <button className="legends-fab" onClick={() => setShowLegends(true)} title="Champions & Legends">
          🏆
        </button>
      )}
      {showLegends && (
      <div className="legends-panel">
        <button className="panel-close" onClick={() => setShowLegends(false)} title="Collapse">−</button>
        <div className="champion-section">
          <h3>🏆 Champion</h3>
          {legends.champion ? (
            <div className="champion-card" onClick={() => setShowChampionPicker(true)}>
              <img src={legends.champion.image_url} alt={legends.champion.name} />
              <div className="champion-name">{legends.champion.name}</div>
              <div className="champion-stats">
                {legends.champion.power}⚔ {legends.champion.toughness}🛡 · Lv {legends.champion.level ?? 0}
              </div>
              {legends.champion.flavor_text && (
                <div className="champion-story">"{legends.champion.flavor_text}"</div>
              )}
              <div className="champion-change">tap to change</div>
            </div>
          ) : null}
        </div>
        <div className="hall-of-legends">
          <h3>📜 Hall of Legends</h3>
          {legends.legends.length === 0 ? (
            <div className="legends-empty">No legends yet. Battle on.</div>
          ) : (
            legends.legends.map(l => (
              <div key={l.id} className="legend-entry">
                <span className="legend-name">{l.awokenName}</span>
                <span className="legend-deed">{deedLabel(l.deed)} ×{l.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
      )}
      {showChampionPicker && (
        <div className="champion-picker-overlay" onClick={() => setShowChampionPicker(false)}>
          <div className="champion-picker" onClick={e => e.stopPropagation()}>
            <h3>Choose your champion</h3>
            <div className="champion-grid">
              {tenderItems.map(a => (
                <button key={a.id} className="champion-option"
                  onClick={async () => {
                    await api.setChampion({ awakenedId: a.id });
                    const updated = await api.getLegends();
                    setLegends(updated);
                    setShowChampionPicker(false);
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
      <div className="territory-hud">
        {birthStatus?.ready ? (
          <button className="abtn birth-ready" onClick={handleTimedBirth}>
            ✨ A new Awoken awaits
          </button>
        ) : birthStatus && (
          <div className="birth-countdown">
            Next birth in {Math.floor(birthStatus.msUntil / 3600000)}h {Math.floor((birthStatus.msUntil % 3600000) / 60000)}m
          </div>
        )}
      </div>

      {wave && (
        <div className="wave-panel">
          <div className="wave-comp">
            {wave.frayCount} Fray{wave.unravelers > 0 && ` + ${wave.unravelers} Unraveler${wave.unravelers > 1 ? "s" : ""}`}
            {" "}· Power {wave.totalPower}
          </div>

          {waveResult && (
            <div className={`wave-result ${waveResult.victory ? "victory" : "defeat"}`}>
              {waveResult.victory
                ? `Victory! The wave breaks. (${waveResult.defensePower} vs ${waveResult.wavePower})`
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
        const k = size / 796;
        const px = tile.q * 1292 * k + tile.r * 13 * k;
        const py = tile.q * 475 * k + tile.r * 946 * k - (tile.height || 0) * HEIGHT_PX;
        const cx = 250 + px + pan.x;
        const cy = 170 + py + pan.y;
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
            {attackTargeting && placement.stance === "attack" && (
              <div className="attack-hint">Tap an adjacent cursed tile to attack (1 energy)</div>
            )}
            {moveTargeting && (
              <div className="attack-hint">Tap an adjacent purified tile to move ({moveCost(awoken.power)} energy)</div>
            )}
            {!attackTargeting && !moveTargeting && (
              <button
                className="stance-btn"
                onClick={() => setMoveTargeting(true)}
                title={`Move to an adjacent tile. Costs ${moveCost(awoken.power)} energy.`}>
                ➤ Move ({moveCost(awoken.power)}⚡)
              </button>
            )}
            <button className="stance-close" onClick={() => { setSelectedAwoken(null); setAttackTargeting(false); setMoveTargeting(false); setStanceMinimized(false); }}>
              ✕
            </button>
            </>)}
          </div>
        );
      })()}
      <div className="territory-battle-trigger">
        {wavesCleared >= 3 && (
          <button className="abtn battle-cta" onClick={handleDefend} style={{ borderColor: "#ffd700" }}>
            👑 BOSS FIGHT
          </button>
        )}
        {battleActive && (
          <span style={{ marginLeft: 8 }}>
            <button className="abtn small" onClick={() => setBattlePaused(p => !p)} title={battlePaused ? "Resume" : "Pause"}>
              {battlePaused ? "▶" : "⏸"}
            </button>
            <button className="abtn small" onClick={() => setBattleSpeed(s => s === 1.3 ? 0.6 : s === 0.6 ? 2.5 : 1.3)} title="Battle speed" style={{ marginLeft: 4 }}>
              {battleSpeed === 0.6 ? "2x" : battleSpeed === 2.5 ? "0.5x" : "1x"}
            </button>
          </span>
        )}

        {!battleActive && wavesCleared < 3 && wave && (
          <button className="abtn" onClick={startBattle} style={{ marginLeft: 8, borderColor: "#ff4444" }}>
            ⚔ Face the Next Wave ({wavesCleared + 1}/3)
          </button>
        )}
        {wavesCleared >= 3 && wave && (
          <span style={{ marginLeft: 12, color: "#ffd700", fontWeight: "bold" }}>
            All waves cleared — Boss awaits!
          </span>
        )}
        {battleActive && (
          <span style={{ marginLeft: 12, color: "#ff6666", fontWeight: "bold" }}>
            Wave {battleWave}/3 — Turn {turnNumber} ({turnPhase === "towers" ? "Towers" : turnPhase === "initiative" ? "Initiative" : "..."})
          </span>
        )}
        {simActive && (
          <button className="abtn small" onClick={stopSim} style={{ marginLeft: 8 }}>
            ⏹ Stop Sim
          </button>
        )}
      </div>

      <div className="territory-map" onClick={() => {
        // Clicking empty map dismisses the stance box
        setSelectedAwoken(null);
        setAttackTargeting(false);
        setMoveTargeting(false);
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
          {battleUnits.map(u => (
            <g key={`battle-${u.id}`} transform={`translate(${u.x},${u.y})`}>
              <circle r="8" fill={u.type === "fray" ? "#3a1a1a" : "#1a0a0a"} stroke="#ff4444" strokeWidth="1.5" />
              <text y="4" textAnchor="middle" fontSize="10" fill="#ff6666">{u.type === "fray" ? "◊" : "⬢"}</text>
              <rect x="-10" y="-14" width="20" height="3" fill="#333" />
              <rect x="-10" y="-14" width={20 * (u.hp / u.maxHp)} height="3" fill="#ff4444" />
            </g>
          ))}
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
            <button key={a.id} className={`dock-card ${battlePool.includes(i) ? "in-pool" : ""}`}
              onClick={() => toggleBattlePool(i)}>
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
          const tracks = libraryTracks.length ? libraryTracks : [{ name: "Aurora", url: "/music/aurora.mp3" }];
          if (!audioRef.current) {
            audioRef.current = new Audio(tracks[trackIdx % tracks.length].url);
            audioRef.current.loop = false;
            audioRef.current.volume = 0.4;
            audioRef.current.onended = () => {
              const next = (trackIdx + 1) % tracks.length;
              setTrackIdx(next);
              if (audioRef.current) {
                audioRef.current.src = tracks[next].url;
                audioRef.current.play();
              }
            };
          }
          if (musicOn) {
            audioRef.current.pause();
          } else {
            audioRef.current.play();
          }
          setMusicOn(!musicOn);
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
                  // Hex positioning (isometric vectors, same as main map, scaled down)
                  const k = scale / 796;
                  const px = (t.q - centerQ) * 1292 * k + (t.r - centerR) * 13 * k;
                  const py = (t.q - centerQ) * 475 * k + (t.r - centerR) * 946 * k;
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
    </div>
  );
}
