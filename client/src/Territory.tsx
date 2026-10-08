import { useEffect, useMemo, useState } from "react";
import { api, type Awakened, type TerritoryTile, type FieldPlacement } from "./api";
import FirstTrial from "./FirstTrial";
import FieldAwoken from "./FieldAwoken";
import { randomWhisper } from "./whispers";
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

export default function Territory({ tenderItems, assets, onUpdate }: Props) {
  const [tiles, setTiles] = useState<TerritoryTile[]>([]);
  const [placements, setPlacements] = useState<FieldPlacement[]>([]);
  const [selectedHands, setSelectedHands] = useState<number[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [energy, setEnergy] = useState(5);

  // Hand = Awoken not on field
  const placedIds = useMemo(() => new Set(placements.map(p => p.awakenedId)), [placements]);
  const hand = useMemo(() => tenderItems.filter(a => !placedIds.has(a.id)), [tenderItems, placedIds]);

  // Energy cap: 5 base + power-based bonus per Awoken in hand.
  // 1-3 power: +1, 4-6: +2, 7-9: +3, 10+: +4. Stronger beings contribute more existence.
  const energyBonus = (power: number) => 1 + Math.floor((power - 1) / 3);
  const maxEnergy = 5 + hand.reduce((sum, a) => sum + energyBonus(a.power), 0);

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
    if (selectedHands.length === 0) return;
    const tile = tiles.find(t => t.id === tileId);
    if (!tile) return;

    // DIRECT ATTACK: 3 Awoken on a cursed tile purifies it by force.
    // The server breaks the curse, re-elements the tile, and places the attackers.
    if (tile.cursed && selectedHands.length === 3) {
      const attackers = selectedHands.map(i => hand[i]).filter(Boolean);
      const totalCost = attackers.reduce((sum, a) => sum + deployCost(a.power), 0);
      if (energy < totalCost) return;
      const attackerIds = attackers.map(a => a.id);
      try {
        await api.directAttack({ awakenedIds: attackerIds, tileId });
        setEnergy(e => e - totalCost);
        const { tiles: newTiles } = await api.getTerritory();
        setTiles(newTiles);
        setSelectedHands([]);
        // A purified tile births a newborn — a real Wake, not a clone.
        const purified = newTiles.find(t => t.id === tileId);
        if (purified) {
          const liberatorNames = attackers.map(a => a.name);
          console.log("[Birth] Starting birth after direct attack, assets:", assets.length);
          const birthLayers = pickBirthLayers(assets.map(a => ({
            sourceId: a.sourceId, name: a.name, category: a.category,
            rarity: "common", power: null, toughness: null, imageUrl: a.imageUrl,
          })));
          console.log("[Birth] Picked layers:", birthLayers.length);
          if (birthLayers.length >= 3) {
            const imageBase64 = await composeBirth(birthLayers);
            console.log("[Birth] Composed image, length:", imageBase64.length);
            const layerRefs = birthLayers.map(l => ({
              source_id: l.sourceId, name: l.name,
              category: l.category as "body" | "arms" | "aura" | "head",
              rarity: "common" as const, power: null, toughness: null,
            }));
            const result = await api.birthFieldAwoken({
              layers: layerRefs, imageBase64,
              tileId: purified.id, liberatorNames,
            });
            console.log("[Birth] Birth result:", result);
          } else {
            console.warn("[Birth] Not enough layers picked:", birthLayers.length);
          }
        }
        const refreshed = await api.getTerritory();
        setTiles(refreshed.tiles); setPlacements(refreshed.placements);
        onUpdate();
      } catch (e) {
        console.error("Direct attack failed", e);
      }
      return;
    }

    // Normal deploy: 1 Awoken to purified tile
    if (tile.cursed) return;
    if (selectedHands.length !== 1) return;
    const awoken = hand[selectedHands[0]];
    if (!awoken) return;
    const cost = deployCost(awoken.power);
    if (energy < cost) return;
    try {
      await api.deployAwoken({ awakenedId: awoken.id, tileId });
      setEnergy(e => e - cost);
      const { tiles, placements } = await api.getTerritory();
      setTiles(tiles); setPlacements(placements);
      setSelectedHands([]);
      onUpdate();
    } catch (e) {
      console.error("Deploy failed", e);
    }
  };

  const toggleHandSelect = (index: number) => {
    setSelectedHands(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length >= 3) return prev;
      return [...prev, index];
    });
  };

  const handleFirstVictory = async (teamIds: number[]) => {
    try {
      await api.claimFirstTile({ teamIds });
      const { tiles, placements } = await api.getTerritory();
      setTiles(tiles); setPlacements(placements);
      // Birth the newborn: a real Wake, not a clone. 5% fire chance.
      const center = tiles.find(t => t.q === 0 && t.r === 0);
      if (center && teamIds.length > 0) {
        const team = tenderItems.filter(a => teamIds.includes(a.id));
        const liberatorNames = team.map(t => t.name);
        console.log("[Birth] Starting birth, assets:", assets.length);
        const birthLayers = pickBirthLayers(assets.map(a => ({
          sourceId: a.sourceId, name: a.name, category: a.category,
          rarity: "common", power: null, toughness: null, imageUrl: a.imageUrl,
        })));
        console.log("[Birth] Picked layers:", birthLayers.length);
        if (birthLayers.length >= 3) {
          const imageBase64 = await composeBirth(birthLayers);
          console.log("[Birth] Composed image, length:", imageBase64.length);
          const layerRefs = birthLayers.map(l => ({
            source_id: l.sourceId, name: l.name,
            category: l.category as "body" | "arms" | "aura" | "head",
            rarity: "common" as const, power: null, toughness: null,
          }));
          const result = await api.birthFieldAwoken({
            layers: layerRefs, imageBase64,
            tileId: center.id, liberatorNames,
          });
          console.log("[Birth] Birth result:", result);
          const refreshed = await api.getTerritory();
          setTiles(refreshed.tiles); setPlacements(refreshed.placements);
        } else {
          console.warn("[Birth] Not enough layers picked:", birthLayers.length);
        }
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

  // Helper: attunement time remaining in ms
  const getAttuneRemaining = (tile: TerritoryTile, placement: FieldPlacement, awoken: Awakened): number | null => {
    // TODO: real element detection; for now show countdown on all fresh placements
    const placedAt = new Date(placement.placedAt).getTime();
    const duration = tile.element === "neutral" ? 4 * 3600 * 1000 : 8 * 3600 * 1000;
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
  // Render hex grid — proper pointy-top axial layout, hexes meet edge-to-edge
  const renderGrid = () => {
    const size = 17, tilt = 0.62;
    // Center the (0,0) tile in the viewBox
    const originX = 250, originY = 170;
    const elements = tiles.map((t, i) => {
      // Pointy-top axial to pixel (with vertical squash)
      const px = size * Math.sqrt(3) * (t.q + t.r / 2);
      const py = size * 1.5 * tilt * t.r;
      const cx = originX + px + pan.x;
      const cy = originY + py + pan.y;
      // Uniform size so hexes tile edge-to-edge. (Per-hex parallax scaling
      // broke the tiling — distant hexes shrank but their centers didn't move.)
      const s = size;
      const pts: string[] = [];
      for (let k = 0; k < 6; k++) {
        // Pointy-top: first vertex at 30°, not 0° (0° gives flat-top,
        // which doesn't match the axial positioning math above).
        const a = Math.PI / 180 * (60 * k + 30);
        pts.push(`${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a) * tilt).toFixed(1)}`);
      }
      const tex = t.cursed ? "cursed" : t.element;
      const placement = placements.find(p => p.tileId === t.id);
      const tilePlacements = placements.filter(p => p.tileId === t.id);
      const awokens = tilePlacements.map(p => tenderItems.find(a => a.id === p.awakenedId)).filter(Boolean) as Awakened[];
      const awoken = awokens[0] ?? null;
      return (
        <g key={t.id}>
          <polygon points={pts.join(" ")} fill="#000" opacity="0.4" transform="translate(0,6)" />
          <g clipPath={`url(#terr-${t.id})`}>
            <image href={TERRAIN[tex]} x={cx - s * 1.2} y={cy - s * 1.2 * tilt} width={s * 2.4} height={s * 2.4 * tilt} preserveAspectRatio="xMidYMid slice" />
          </g>
          <polygon points={pts.join(" ")} fill="rgba(0,0,0,0)" stroke={t.cursed ? "#6a1a1a" : "#b89b5e"} strokeWidth="1" opacity="0.7"
            style={{ cursor: selectedHands.length > 0 ? "pointer" : "default", pointerEvents: "all" }}
            onClick={() => selectedHands.length > 0 && handleDeploy(t.id)} />
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
                const kx = cx + ks.dx * s * 2;
                const ky = cy + ks.dy * s * 2 * tilt;
                const isWhispering = whisper?.awakenedId === a.id;
                return (
                  <g key={a.id}>
                    <FieldAwoken awoken={a} assets={assets}
                      x={kx - ws / 2} y={ky - hs / 2}
                      width={ws} height={hs} />
                    {isWhispering && (
                      <g className="whisper-bubble" opacity="0.85">
                        <text x={kx} y={ky - hs / 2 - 12}
                          textAnchor="middle" fontSize="10" fontStyle="italic"
                          fill="#e8d5a8" className="whisper-text">
                          {whisper.text.length > 60 ? whisper.text.slice(0, 60) + "…" : whisper.text}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              {(() => {
                const placement = tilePlacements[0];
                if (!placement || !awoken) return null;
                const remaining = getAttuneRemaining(t, placement, awoken);
                if (remaining === null || remaining <= 0) return null;
                return (
                  <g>
                    <rect x={cx - 28} y={cy - 58} width={56} height={14} rx={7} fill="#000" opacity="0.7" />
                    <text x={cx} y={cy - 48} textAnchor="middle" fill="#b89b5e" fontSize={10}>
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
          {tiles.map(t => (
            <clipPath key={`cp-${t.id}`} id={`terr-${t.id}`}>
              <polygon points={(() => {
                const col = t.q + 5, row = t.r + 5;
                const ps = 0.7 + (row / 10) * 0.5;
                const s = size * ps;
                const cx = 60 + col * (Math.sqrt(3) * s * 0.92) + pan.x;
                const cy = 60 + row * (2 * s * 0.78 * tilt) + pan.y;
                const p: string[] = [];
                for (let k = 0; k < 6; k++) {
                  const a = Math.PI / 180 * (60 * k);
                  p.push(`${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a) * tilt).toFixed(1)}`);
                }
                return p.join(" ");
              })()} />
            </clipPath>
          ))}
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
      <div className="territory-map">
        <svg viewBox="0 0 500 340" className="territory-svg">
          {renderGrid()}
        </svg>
        <div className="territory-nav">
          <button onClick={() => setPan(p => ({ ...p, y: p.y + 40 }))} aria-label="Pan up">▲</button>
          <button onClick={() => setPan(p => ({ ...p, y: p.y - 40 }))} aria-label="Pan down">▼</button>
          <button onClick={() => setPan(p => ({ ...p, x: p.x + 40 }))} aria-label="Pan left">◀</button>
          <button onClick={() => setPan(p => ({ ...p, x: p.x - 40 }))} aria-label="Pan right">▶</button>
        </div>
      </div>
      <div className="territory-hand">
        <div className="hand-label">Hand — tap 1 for deploy, 3 for direct attack on cursed</div>
        <div className="hand-cards">
          {hand.map((a, i) => (
            <button key={a.id} className={`hand-card ${selectedHands.includes(i) ? "selected" : ""}`}
              onClick={() => toggleHandSelect(i)}>
              <img src={a.image_url} alt={a.name} />
              <div className="hand-card-name">{a.name}</div>
              <div className="hand-card-stats">{a.power} / {a.toughness}</div>
              <div className="hand-card-cost">⚡{deployCost(a.power)} · +{energyBonus(a.power)}✦</div>
            </button>
          ))}
          {hand.length === 0 && <div className="hand-empty">All Awoken stand on the field.</div>}
        </div>
      </div>
    </div>
  );
}
