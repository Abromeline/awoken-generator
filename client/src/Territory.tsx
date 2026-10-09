import { useEffect, useMemo, useState } from "react";
import { api, type Awakened, type TerritoryTile, type FieldPlacement } from "./api";
import FirstTrial from "./FirstTrial";
import FieldAwoken from "./FieldAwoken";
import { Corner, elementForPiece, type Element } from "./App";
import { randomWhisper } from "./whispers";
import { trackPlayer, type TrackData } from "./trackPlayer";
import Battleground from "./Battleground";
import { pickBirthLayers, composeBirth } from "./birth";
import tideImg from "./assets/terrain/tide.jpg";
import skyImg from "./assets/terrain/sky.jpg";
import stoneImg from "./assets/terrain/stone.jpg";
import rootImg from "./assets/terrain/root.jpg";
import neutralImg from "./assets/terrain/neutral.jpg";

import cursedImg from "./assets/terrain/cursed.jpg";

const TERRAIN: Record<string, string> = {
  tide: tideImg, sky: skyImg, stone: stoneImg,
  root: rootImg, neutral: neutralImg, cursed: cursedImg,
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
  const [tiles, setTiles] = useState<TerritoryTile[]>([]);
  const [placements, setPlacements] = useState<FieldPlacement[]>([]);
  const [battlePool, setBattlePool] = useState<number[]>([]); // hand indices staged for battle, max 4
  const [pan, setPan] = useState({ x: 0, y: 0 });
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
  const [moveTargeting, setMoveTargeting] = useState(false); // true when move mode awaits target tile
  const [wave, setWave] = useState<{ waveNumber: number; wavesDefeated: number; frayCount: number; unravelers: number; totalPower: number } | null>(null);
  const [waveResult, setWaveResult] = useState<{ victory: boolean; wavePower: number; defensePower: number } | null>(null);
  const [showBindingPrompt, setShowBindingPrompt] = useState(false);
  const [showBattleground, setShowBattleground] = useState(false);

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
      }).catch(() => {});
    }
    return () => window.removeEventListener("focus", onFocus);
  }, [tiles.length]);

  // Passive purification: the Awoken's power stirs adjacent cursed tiles.
  // Check on load and every 5 minutes — the server enforces the 48h rest.
  useEffect(() => {
    const checkPassive = async () => {
      if (!tiles.length) return;
      const cursed = tiles.filter(t => t.cursed);
      let changed = false;
      for (const tile of cursed) {
        try {
          const result = await api.passivePurify({ tileId: tile.id });
          if (result.ok && result.purified) {
            changed = true;
            // A newborn joins the hand for each passive purification
            api.birthNewbornToHand({ tileId: tile.id, liberatorNames: [] }).catch(() => {});
          }
        } catch {
          // Not ready, too weak, or already purified — silent
        }
      }
      if (changed) {
        const refreshed = await api.getTerritory();
        setTiles(refreshed.tiles);
        setPlacements(refreshed.placements);
        onUpdate();
      }
    };
    checkPassive();
    const timer = setInterval(checkPassive, 5 * 60 * 1000);
    return () => clearInterval(timer);
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
    }).catch(() => {});
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
      const result = await api.deployBattle({ awakenedIds: fighterIds, tileId, energyCost: totalCost });
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
      const result = await api.attackTile({ awakenedId: selectedAwoken, tileId });
      await refreshEnergy();
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements);
      if (result.purified) {
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
      await api.moveAwoken({ awakenedId: selectedAwoken, tileId, energyCost: cost });
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
    // Open the interactive battleground overlay
    setShowBattleground(true);
  };

  const handleBattleEnd = async (result: { victory: boolean; survivors: number[] }) => {
    setShowBattleground(false);
    if (!wave) return;
    try {
      // Calculate energy spent (simplified: track during battle)
      await api.resolveBattle({
        victory: result.victory,
        waveNumber: wave.waveNumber,
        survivorIds: result.survivors,
        energySpent: 0, // TODO: track actual spend
      });
      const refreshed = await api.getTerritory();
      setTiles(refreshed.tiles);
      setPlacements(refreshed.placements);
      const w = await api.getWave();
      setWave(w);
      await refreshEnergy();
      if (result.victory) {
        api.birthNewbornToHand({ tileId: 0, liberatorNames: [] }).catch(() => {});
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

  const handleFirstVictory = async (teamIds: number[]) => {
    try {
      await api.claimFirstTile({ teamIds });
      const { tiles, placements } = await api.getTerritory();
      setTiles(tiles); setPlacements(placements);
      // Newborn joins the hand — server-side, fire-and-forget. Cannot hang the ritual.
      const center = tiles.find(t => t.q === 0 && t.r === 0);
      if (center && teamIds.length > 0) {
        const team = tenderItems.filter(a => teamIds.includes(a.id));
        const liberatorNames = team.map(t => t.name);
        api.birthNewbornToHand({ tileId: center.id, liberatorNames }).catch(e =>
          console.error("[Birth] Newborn failed — ritual complete", e)
        );
      }
      onUpdate();
    } catch (e) {
      console.error("[Birth] Claim failed", e);
      throw e;
    }
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
    if (!tiles.length) {
      return <FirstTrial hand={hand} assets={assets} onVictory={handleFirstVictory} />;
    }
    // Simple grid layout for now; parallax via row scaling
  // Project a point from the tilted map plane to screen coordinates.
  // The map container has: perspective(900px) rotateX(32deg), origin at center 60%.
  const projectTilted = (cx: number, cy: number, viewW: number, viewH: number) => {
    const theta = 32 * Math.PI / 180;
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

  // Render hex grid with mathematical perspective tilt.
  // Hex tiles are tilted (landscape view), Awoken are projected to the tilted
  // positions but drawn upright (not skewed).
  const renderGrid = () => {
    const size = 17 * zoom;
    const viewW = 500, viewH = 340;
    const tiltPoint = (x: number, y: number) => {
      const p = projectTilted(x, y, viewW, viewH);
      return p;
    };
    // Center the (0,0) tile in the viewBox
    const originX = 250, originY = 170;
    // Depth-sort by TILTED screen Y: further (higher on screen) drawn first.
    // This ensures front tiles always overlap back tiles, regardless of lift.
    const sortedTiles = [...tiles].sort((a, b) => {
      const cya = originY + size * 1.5 * a.r + pan.y;
      const cyb = originY + size * 1.5 * b.r + pan.y;
      const tya = tiltPoint(0, cya).y;
      const tyb = tiltPoint(0, cyb).y;
      return tya - tyb;
    });
    const elements = sortedTiles.map((t, i) => {
      // Pointy-top axial to pixel
      const px = size * Math.sqrt(3) * (t.q + t.r / 2);
      const py = size * 1.5 * t.r;
      const cx = originX + px + pan.x;
      const cy = originY + py + pan.y;
      const s = size;
      const pts: string[] = [];
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 180 * (60 * k + 30);
        const vx = cx + s * Math.cos(a);
        const vy = cy + s * Math.sin(a);
        // Apply perspective tilt to each vertex
        const tp = tiltPoint(vx, vy);
        pts.push(`${tp.x.toFixed(1)},${tp.y.toFixed(1)}`);
      }
      // Project the center for Awoken positioning (but Awoken drawn upright)
      const tc = tiltPoint(cx, cy);
      const tex = t.cursed ? "cursed" : (TERRAIN[t.element] ? t.element : "neutral");
      const placement = placements.find(p => p.tileId === t.id);
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      const lift = t.cursed ? 0 : -5; // Purified land hovers above the cursed
      return (
        <g key={t.id} transform={`translate(0,${lift})`}>
          <polygon points={pts.join(" ")} fill="#000" opacity="0.4" transform="translate(0,6)" />
          <g clipPath={`url(#terr-${t.id})`}>
            <image href={TERRAIN[t.cursed ? "cursed" : (TERRAIN[t.element] ? t.element : "neutral")]} x={tc.x - s * 1.2} y={tc.y - s * 1.2} width={s * 2.4} height={s * 2.4} preserveAspectRatio="xMidYMid slice" />
          </g>
          <polygon points={pts.join(" ")} fill="rgba(0,0,0,0)"
            stroke={t.cursed ? (battlePool.length > 0 ? "#ff4444" : "#5a2a2a") : "#b89b5e"}
            strokeWidth={t.cursed && battlePool.length > 0 ? 2 : 1}
            opacity={t.cursed ? (battlePool.length > 0 ? 0.9 : 0.35) : 0.7}
            style={{
              cursor: (battlePool.length > 0 || attackTargeting) ? "pointer" : "default",
              pointerEvents: "all"
            }}
            onClick={() => {
              if (attackTargeting && selectedAwoken !== null) {
                handleAttack(t.id);
              } else if (moveTargeting && selectedAwoken !== null) {
                handleMove(t.id);
              } else if (battlePool.length > 0) {
                handleDeploy(t.id);
              }
            }} />

          {awokens.length > 0 && (
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
                // Position on the tilted plane, but draw upright
                const rawKx = cx + ks.dx * s * 2;
                const rawKy = cy + ks.dy * s * 2;
                const tk = tiltPoint(rawKx, rawKy);
                const kx = tk.x, ky = tk.y;
                // Scale by perspective (further = smaller), but don't skew
                const awScale = tk.scale;
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
                      cursor: "pointer",
                    } as React.CSSProperties}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAwoken(isSelected ? null : a.id);
                      setAttackTargeting(false);
                      setMoveTargeting(false);
                    }}>
                    {isSelected && (
                      <circle cx={kx} cy={ky} r={14 * awScale} fill="none" stroke="#ffd700" strokeWidth="1.5" opacity="0.9" />
                    )}
                    <FieldAwoken awoken={a} assets={assets}
                      x={kx - aws / 2} y={ky - ahs / 2}
                      width={aws} height={ahs} />
                    {placement && placement.stance !== "defense" && (
                      <text x={kx} y={ky - ahs / 2 - 4} textAnchor="middle" fontSize={7}
                        fill={placement.stance === "attack" ? "#ff6666" : "#66aaff"}>
                        {placement.stance === "attack" ? "⚔" : "✦"}
                      </text>
                    )}
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
          )}
        </g>
      );
    });
    return (
      <>
        <defs>
          {tiles.map(t => {
            const px = size * Math.sqrt(3) * (t.q + t.r / 2);
            const py = size * 1.5 * t.r;
            const cx = 250 + px + pan.x;
            const cy = 170 + py + pan.y;
            const pts: string[] = [];
            for (let k = 0; k < 6; k++) {
              const a = Math.PI / 180 * (60 * k + 30);
              const vx = cx + size * Math.cos(a);
              const vy = cy + size * Math.sin(a);
              const tp = tiltPoint(vx, vy);
              pts.push(`${tp.x.toFixed(1)},${tp.y.toFixed(1)}`);
            }
            return (
              <clipPath key={`cp-${t.id}`} id={`terr-${t.id}`}>
                <polygon points={pts.join(" ")} />
              </clipPath>
            );
          })}
        </defs>
        {elements}
      </>
    );
  };

  return (
    <div className="territory-view">
      <div className="territory-hud">
        <div className="energy-meter">
          <span className="energy-label">Energy</span>
          <div className="energy-bar">
            <div className="energy-fill" style={{ width: `${(energy / maxEnergy) * 100}%` }} />
          </div>
          <span className="energy-value">{energy}/{maxEnergy}</span>
        </div>
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
      {showBindingPrompt && (
        <div className="binding-prompt">
          <div className="binding-prompt-title">✦ The Binding awaits</div>
          <div className="binding-prompt-text">
            You hold three territories. Set an Awoken to <b>Binding stance</b> — 
            while they hold a tile, the waves cannot take it.
          </div>
          <button className="abtn" onClick={() => {
            localStorage.setItem("bindingPromptSeen", "1");
            setShowBindingPrompt(false);
          }}>
            I understand
          </button>
        </div>
      )}
      {wave && (
        <div className="wave-panel">
          <div className="wave-title">🌊 Wave {wave.waveNumber} approaches</div>
          <div className="wave-comp">
            {wave.frayCount} Fray{wave.unravelers > 0 && ` + ${wave.unravelers} Unraveler${wave.unravelers > 1 ? "s" : ""}`}
            {" "}· Power {wave.totalPower}
          </div>
          <button className="abtn wave-defend" onClick={handleDefend}>
            🛡 Defend the Bastion
          </button>
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
        return (
          <div className="stance-picker">
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
            <button className="stance-close" onClick={() => { setSelectedAwoken(null); setAttackTargeting(false); setMoveTargeting(false); }}>
              ✕
            </button>
          </div>
        );
      })()}
      <div className="territory-battle-trigger">
        <button className="abtn battle-cta" onClick={handleDefend} disabled={!wave}>
          ⚔ {wave ? `Fight the Unraveling — Wave ${wave.waveNumber}` : "Loading..."}
        </button>
      </div>
      <div className="territory-hand">
        <div className="hand-label">Tap cards to ready them for battle — then tap a hex to send them</div>
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
        <div className="hand-cards">
          {hand.map((a, i) => {
            const el = dominantElement(a);
            return (
            <button key={a.id} className={`hand-card ${battlePool.includes(i) ? "in-pool" : ""}`}
              onClick={() => toggleBattlePool(i)}>
              <Corner element={el} className="hcorner tl" />
              <Corner element={el} className="hcorner tr" />
              <Corner element={el} className="hcorner bl" />
              <Corner element={el} className="hcorner br" />
              <img src={a.image_url} alt={a.name} />
              <div className="hand-card-name">{a.name}</div>
              <div className="hand-card-stats">{a.power} / {a.toughness}</div>
              <div className="hand-card-cost">⚡{deployCost(a.power)} · +{energyBonus(a.power)}✦</div>
            </button>
            );
          })}
          {hand.length === 0 && <div className="hand-empty">All Awoken stand on the field.</div>}
        </div>
      </div>
      <div className="territory-map">
        <svg viewBox="0 0 500 340" className="territory-svg">
          {renderGrid()}
        </svg>
        <div className="territory-nav">
          <button onClick={() => setPan(p => ({ ...p, y: p.y + 40 }))} aria-label="Pan up">▲</button>
          <button onClick={() => setPan(p => ({ ...p, y: p.y - 40 }))} aria-label="Pan down">▼</button>
          <button onClick={() => setPan(p => ({ ...p, x: p.x + 40 }))} aria-label="Pan left">◀</button>
          <button onClick={() => setPan(p => ({ ...p, x: p.x - 40 }))} aria-label="Pan right">▶</button>
          <button onClick={() => setZoom(z => Math.min(z + 0.2, 3))} aria-label="Zoom in">＋</button>
          <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))} aria-label="Zoom out">－</button>
        </div>
      </div>
      {showBattleground && wave && (() => {
        const center = tiles.find(t => t.q === 0 && t.r === 0);
        if (!center) return null;
        const defs = placements
          .filter(p => p.tileId === center.id)
          .map(p => {
            const aw = tenderItems.find(a => a.id === p.awakenedId);
            return aw ? { placementId: p.id, awoken: aw } : null;
          })
          .filter(Boolean) as { placementId: number; awoken: Awakened }[];
        return (
          <Battleground
            defenders={defs}
            wave={wave}
            hand={hand}
            assets={assets}
            energy={energy}
            maxEnergy={maxEnergy}
            onBattleEnd={handleBattleEnd}
            onClose={() => setShowBattleground(false)}
          />
        );
      })()}
    </div>
  );
}
