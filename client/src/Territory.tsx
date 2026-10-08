import { useEffect, useMemo, useState } from "react";
import { api, type Awakened, type TerritoryTile, type FieldPlacement } from "./api";
import FirstTrial from "./FirstTrial";
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
  assets: { sourceId: string; imageUrl: string; category: string }[];
  onUpdate: () => void;
}

// Renders an Awoken's layers stacked, WITHOUT the background.
// Layers draw back-to-front: body → arms → aura → head.
// Field-born Awoken get a small gold tree symbol.
function FieldAwoken({ awoken, assets, x, y, width, height }: {
  awoken: Awakened; assets: Props["assets"]; x: number; y: number; width: number; height: number;
}) {
  const assetMap = useMemo(() => {
    const m = new Map<string, string>();
    assets.forEach(a => m.set(a.sourceId, a.imageUrl));
    return m;
  }, [assets]);
  const layers = awoken.layers
    .filter(l => l.category !== "background")
    .sort((a, b) => {
      const order = ["body", "arms", "aura", "head"];
      return order.indexOf(a.category) - order.indexOf(b.category);
    });
  return (
    <g>
      {layers.map((l, i) => {
        const url = assetMap.get(l.source_id);
        if (!url) return null;
        return <image key={i} href={url} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid meet" />;
      })}
      {awoken.field_born === 1 && (
        <g transform={`translate(${x + width - 10}, ${y + 4})`}>
          <circle r="8" fill="#1a1a1a" stroke="#b89b5e" strokeWidth="1.5" />
          <text textAnchor="middle" dy="4" fontSize="10" fill="#b89b5e">🌳</text>
        </g>
      )}
    </g>
  );
}

export default function Territory({ tenderItems, assets, onUpdate }: Props) {
  const [tiles, setTiles] = useState<TerritoryTile[]>([]);
  const [placements, setPlacements] = useState<FieldPlacement[]>([]);
  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    api.getTerritory().then(({ tiles, placements }) => {
      setTiles(tiles); setPlacements(placements);
    }).catch(() => {});
  }, []);

  // Hand = Awoken not on the field
  const placedIds = useMemo(() => new Set(placements.map(p => p.awakenedId)), [placements]);
  const hand = useMemo(() => tenderItems.filter(a => !placedIds.has(a.id)), [tenderItems, placedIds]);

  const handleDeploy = async (tileId: number) => {
    if (selectedHand === null) return;
    const awoken = hand[selectedHand];
    if (!awoken) return;
    try {
      await api.deployAwoken({ awakenedId: awoken.id, tileId });
      const { tiles, placements } = await api.getTerritory();
      setTiles(tiles); setPlacements(placements);
      setSelectedHand(null);
      onUpdate();
    } catch (e) {
      console.error("Deploy failed", e);
    }
  };

  const handleFirstVictory = async (teamIds: number[]) => {
    try {
      await api.claimFirstTile({ teamIds });
      const { tiles, placements } = await api.getTerritory();
      setTiles(tiles); setPlacements(placements);
      onUpdate();
    } catch (e) {
      console.error("Claim failed", e);
    }
  };

  // Helper: get dominant element from Awoken layers (simplified)
  const getDominantElement = (awoken: Awakened): string => {
    // TODO: detect from piece names; default to neutral for now
    return "neutral";
  };

  // Helper: attunement time remaining in ms
  const getAttuneRemaining = (tile: TerritoryTile, placement: FieldPlacement, awoken: Awakened): number | null => {
    const awokenEl = getDominantElement(awoken);
    if (tile.element === awokenEl) return null; // already attuned
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
      return <FirstTrial hand={hand} onVictory={handleFirstVictory} />;
    }
    // Simple grid layout for now; parallax via row scaling
  // Render hex grid with parallax
  const renderGrid = () => {
    const size = 34, tilt = 0.62;
    const elements = tiles.map((t, i) => {
      const col = t.q + 5, row = t.r + 5;
      const ps = 0.7 + (row / 10) * 0.5;
      const s = size * ps;
      const cx = 60 + col * (Math.sqrt(3) * s * 0.92) + pan.x;
      const cy = 60 + row * (2 * s * 0.78 * tilt) + pan.y;
      const pts: string[] = [];
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 180 * (60 * k);
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
          <polygon points={pts.join(" ")} fill="none" stroke={t.cursed ? "#6a1a1a" : "#b89b5e"} strokeWidth="1" opacity="0.7"
            style={{ cursor: selectedHand !== null && !t.cursed ? "pointer" : "default" }}
            onClick={() => selectedHand !== null && !t.cursed && handleDeploy(t.id)} />
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
                const ws = 30 * ps, hs = 40 * ps;
                const kx = cx + ks.dx * s * 2;
                const ky = cy + ks.dy * s * 2 * tilt;
                return (
                  <FieldAwoken key={a.id} awoken={a} assets={assets}
                    x={kx - ws / 2} y={ky - hs / 2}
                    width={ws} height={hs} />
                );
              })}
              {(() => {
                const placement = tilePlacements[0];
                if (!placement || !awoken) return null;
                const remaining = getAttuneRemaining(t, placement, awoken);
                if (remaining === null || remaining <= 0) return null;
                return (
                  <g>
                    <rect x={cx - 28 * ps} y={cy - 58 * ps} width={56 * ps} height={14 * ps} rx={7 * ps} fill="#000" opacity="0.7" />
                    <text x={cx} y={cy - 48 * ps} textAnchor="middle" fill="#b89b5e" fontSize={10 * ps}>
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
        <div className="hand-label">Hand — tap a card, then a tile to deploy</div>
        <div className="hand-cards">
          {hand.map((a, i) => (
            <button key={a.id} className={`hand-card ${selectedHand === i ? "selected" : ""}`}
              onClick={() => setSelectedHand(selectedHand === i ? null : i)}>
              <img src={a.image_url} alt={a.name} />
              <div className="hand-card-name">{a.name}</div>
              <div className="hand-card-stats">{a.power} / {a.toughness}</div>
            </button>
          ))}
          {hand.length === 0 && <div className="hand-empty">All Awoken stand on the field.</div>}
        </div>
      </div>
    </div>
  );
}
