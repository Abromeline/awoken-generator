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
  onUpdate: () => void;
}

export default function Territory({ tenderItems, onUpdate }: Props) {
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

  // Render hex grid with parallax
  const renderGrid = () => {
    if (!tiles.length) {
      return <FirstTrial hand={hand} onVictory={handleFirstVictory} />;
    }
    // Simple grid layout for now; parallax via row scaling
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
      const awoken = placement ? tenderItems.find(a => a.id === placement.awakenedId) : null;
      return (
        <g key={t.id}>
          <polygon points={pts.join(" ")} fill="#000" opacity="0.4" transform="translate(0,6)" />
          <g clipPath={`url(#terr-${t.id})`}>
            <image href={TERRAIN[tex]} x={cx - s * 1.2} y={cy - s * 1.2 * tilt} width={s * 2.4} height={s * 2.4 * tilt} preserveAspectRatio="xMidYMid slice" />
          </g>
          <polygon points={pts.join(" ")} fill="none" stroke={t.cursed ? "#6a1a1a" : "#b89b5e"} strokeWidth="1" opacity="0.7"
            style={{ cursor: selectedHand !== null && !t.cursed ? "pointer" : "default" }}
            onClick={() => selectedHand !== null && !t.cursed && handleDeploy(t.id)} />
          {awoken && (
            <image href={awoken.image_url} x={cx - 20 * ps} y={cy - 42 * ps} width={40 * ps} height={52 * ps} />
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
