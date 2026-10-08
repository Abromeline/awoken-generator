import { useState } from "react";
import type { Awakened } from "./api";
import FieldAwoken from "./FieldAwoken";
import cursedImg from "./assets/terrain/cursed.jpg";
import neutralImg from "./assets/terrain/neutral.jpg";
import unravelerImg from "./assets/adversaries/unraveler.png";
import debrisDark from "./assets/debris-dark.jpg";
import { Corner, elementForPiece, type Element } from "./App";

interface Props {
  hand: Awakened[];
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
  onVictory: (teamIds: number[]) => void;
}


// Dominant element of an Awoken, for corner motifs.
function dominantElement(a: Awakened): Element {
  const counts: Record<Element, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0 };
  for (const layer of (a as any).layers ?? []) {
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

export default function FirstTrial({ hand, assets, onVictory }: Props) {
  const [pool, setPool] = useState<number[]>([]); // hand indices waiting in the cosmic pool, max 4
  const [purifying, setPurifying] = useState(false);
  // Energy: 5 base + power-scaled bonus per Awoken in hand.
  const energyBonus = (power: number) => 1 + Math.floor((power - 1) / 3);
  const deployCost = (power: number) => 2 + Math.floor((power - 1) / 3);
  const maxEnergy = 5 + hand.reduce((sum, a) => sum + energyBonus(a.power), 0);
  const [energy, setEnergy] = useState(maxEnergy);

  const baseSize = 32, tilt = 0.62;
  const cx = 250, cy = 150;

  const hexPoints = (x: number, y: number, s: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      // Pointy-top: 30° offset so vertices align with the axial grid.
      const a = Math.PI / 180 * (60 * i + 30);
      pts.push(`${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a) * tilt).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // Full field with parallax — proper pointy-top axial layout
  // Center hex (0,0) is the trial hex, highlighted. Surrounding 6 are cursed previews.
  const tiles: { q: number; r: number; x: number; y: number; s: number; isCenter: boolean }[] = [];
  const coords = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  coords.forEach(([q, r], idx) => {
    // Pointy-top axial to pixel
    const px = baseSize * Math.sqrt(3) * (q + r / 2);
    const py = baseSize * 1.5 * tilt * r;
    const x = cx + px;
    const y = cy + py;
    // All hexes the same size — the center tiles naturally with its neighbors.
    const s = baseSize;
    tiles.push({ q, r, x, y, s, isCenter: idx === 0 });
  });

  // 4 keystone positions ON the center hex (invisible — auto-place)
  const center = tiles[0];
  const keystones = [
    { dx: 0, dy: 0.35 },      // middle-front (default, first placed)
    { dx: -0.35, dy: 0.1 },   // front-left
    { dx: 0.35, dy: 0.1 },    // front-right
    { dx: 0, dy: -0.3 },      // back-center
  ].map(({ dx, dy }) => ({
    x: center.x + dx * center.s * 1.6,
    y: center.y + dy * center.s * 1.6 * tilt,
  }));

  const pooled = pool.map(i => hand[i]).filter(Boolean);
  const combinedPower = pooled.reduce((sum, a) => sum + a.power, 0);
  const canBegin = combinedPower >= 7 && pool.length > 0;

  const handleBegin = async () => {
    setPurifying(true);
    // Let the animation breathe, then ask the server. If it refuses,
    // come back — don't leave the Tender staring at "Purifying..." forever.
    await new Promise(r => setTimeout(r, 1800));
    try {
      await onVictory(pooled.map(a => a.id));
    } catch (e) {
      console.error("[Trial] Purification refused", e);
      setPurifying(false);
    }
  };

  // Pool: tap a card → waits in the cosmic pool (max 4). Tap again to pull it back.
  const handleCardTap = (index: number) => {
    if (purifying) return;
    const awoken = hand[index];
    if (!awoken) return;
    if (pool.includes(index)) {
      setPool(pool.filter(i => i !== index));
      setEnergy(e => Math.min(e + deployCost(awoken.power), maxEnergy));
      return;
    }
    if (pool.length >= 4) return;
    const cost = deployCost(awoken.power);
    if (energy < cost) return;
    setPool([...pool, index]);
    setEnergy(e => e - cost);
  };

  const hasPlaced = pool.length > 0;

  return (
    <div className="first-trial">
      <div className={`trial-title-large ${hasPlaced ? "faded" : ""}`}>Purify the dark to begin</div>
      <div className="trial-hand trial-hand-top">
        <div className="hand-label">Tap cards to send them into the dark — combined power must reach 7</div>
        <div className="hand-cards">
          {hand.map((a, i) => {
            const inPool = pool.includes(i);
            const el = dominantElement(a);
            return (
              <button key={a.id} className={`hand-card ${inPool ? "in-pool" : ""}`}
                disabled={purifying}
                onClick={() => handleCardTap(i)}>
                <Corner element={el} className="hcorner tl" />
                <Corner element={el} className="hcorner tr" />
                <Corner element={el} className="hcorner bl" />
                <Corner element={el} className="hcorner br" />
                <img src={a.image_url} alt={a.name} />
                <div className="hand-card-name">{a.name}</div>
                <div className="hand-card-stats">{a.power} power</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="trial-actions">
        <div className="trial-power">Combined Power: <b>{combinedPower}</b> / 7</div>
        <button className="abtn" disabled={!canBegin || purifying} onClick={handleBegin}>
          {purifying ? "Purifying..." : "Begin the Ritual"}
        </button>
        <div className="energy-meter trial-energy">
          <span className="energy-label">Energy</span>
          <div className="energy-bar">
            <div className="energy-fill" style={{ width: `${(energy / maxEnergy) * 100}%` }} />
          </div>
          <span className="energy-value">{energy}/{maxEnergy}</span>
        </div>
      </div>
      {pool.length > 0 && (
        <div className="cosmic-pool" style={{ backgroundImage: `url(${debrisDark})` }}>
          <div className="cosmic-pool-label">Waiting in the void — {pool.length}/4</div>
          <div className="cosmic-pool-cards">
            {pooled.map(a => (
              <div key={a.id} className="cosmic-pool-card field-drifter"
                style={{ "--drift-dur": `${(6 + (a.id % 5)).toFixed(1)}s`, "--drift-delay": `${(-(a.id % 7)).toFixed(1)}s` } as React.CSSProperties}>
                <img src={a.image_url} alt={a.name} className="cosmic-pool-img" />
                <div className="cosmic-pool-card-name">{a.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="trial-field-wrap">
        <svg viewBox="0 0 500 340" className="trial-svg">
        <defs>
          {tiles.map((t, i) => (
            <clipPath key={i} id={`ft-${i}`}>
              <polygon points={hexPoints(t.x, t.y, t.s)} />
            </clipPath>
          ))}
          <filter id="ft-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000" floodOpacity="0.7" />
          </filter>
        </defs>
        {/* Drop shadows */}
        {tiles.map((t, i) => (
          <polygon key={`sh-${i}`} points={hexPoints(t.x, t.y + 8, t.s)} fill="#000" opacity="0.5" filter="url(#ft-shadow)" />
        ))}
        {/* Tiles — surrounding hexes are visual only; battle happens on center */}
        {tiles.map((t, i) => {
          return (
          <g key={`t-${i}`}>
            <g clipPath={`url(#ft-${i})`}>
              <image href={cursedImg}
                x={t.x - t.s * 1.3} y={t.y - t.s * 1.3 * tilt}
                width={t.s * 2.6} height={t.s * 2.6 * tilt}
                preserveAspectRatio="xMidYMid slice"
                opacity={t.isCenter ? 1 : 0.7} />
            </g>
            <polygon points={hexPoints(t.x, t.y, t.s)} fill="rgba(0,0,0,0)"
              stroke={t.isCenter ? "#b89b5e" : "#6a1a1a"}
              strokeWidth={t.isCenter ? 3 : 1.2}
              opacity={t.isCenter ? 1 : 0.6}
              style={{ pointerEvents: "all" }} />
            {t.isCenter && purifying && (
              <>
                <polygon points={hexPoints(t.x, t.y, t.s)} fill="#fff8e8" className="purify-flash" />
                <g clipPath={`url(#ft-${i})`} className="purify-reveal" opacity="0">
                  <image href={neutralImg}
                    x={t.x - t.s * 1.3} y={t.y - t.s * 1.3 * tilt}
                    width={t.s * 2.6} height={t.s * 2.6 * tilt}
                    preserveAspectRatio="xMidYMid slice" />
                </g>
              </>
            )}
          </g>
          );
        })}
        {/* Unraveler on center */}
        {!purifying && (
          <g>
            <image href={unravelerImg} x={center.x - 30} y={center.y - 36}
              width="60" height="72" className="adversary-unraveler" />
            <text x={center.x} y={center.y + 42} textAnchor="middle" fill="#aa5555" fontSize="11">Power 7</text>
          </g>
        )}
        {/* Purification particles */}
        {purifying && Array.from({ length: 14 }).map((_, i) => {
          const angle = (i / 14) * Math.PI * 2;
          const dist = 90 + Math.random() * 50;
          return (
            <circle key={i} cx={center.x} cy={center.y} r="4" fill="#b89b5e"
              className="purify-particle"
              style={{ "--px": `${Math.cos(angle) * dist}px`, "--py": `${Math.sin(angle) * dist}px` } as React.CSSProperties} />
          );
        })}
      </svg>
      </div>
    </div>
  );
}
