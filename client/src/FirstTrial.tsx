import { useState } from "react";
import type { Awakened } from "./api";
import cursedImg from "./assets/terrain/cursed.jpg";
import neutralImg from "./assets/terrain/neutral.jpg";

interface Props {
  hand: Awakened[];
  onVictory: (teamIds: number[]) => void;
}

export default function FirstTrial({ hand, onVictory }: Props) {
  const [placed, setPlaced] = useState<Map<number, Awakened>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const [purifying, setPurifying] = useState(false);
  // Energy: 5 base + 1 per Awoken in hand (burst at start)
  const maxEnergy = 5 + hand.length;
  const [energy, setEnergy] = useState(maxEnergy);

  const baseSize = 32, tilt = 0.62;
  const cx = 250, cy = 150;

  const hexPoints = (x: number, y: number, s: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      pts.push(`${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a) * tilt).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // Full field with parallax: rows scale by distance (top smaller, bottom larger)
  // Center hex (0,0) is the trial hex, highlighted. Surrounding 6 are cursed previews.
  const tiles: { q: number; r: number; x: number; y: number; s: number; isCenter: boolean }[] = [];
  const coords = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1], [2, -1], [-1, 2]];
  coords.forEach(([q, r], idx) => {
    // Parallax: scale by row (r). Higher r (lower on screen) = larger.
    const ps = 0.75 + ((r + 2) / 4) * 0.5; // 0.75 to 1.25
    const s = baseSize * ps * (idx === 0 ? 1.4 : 1); // Center is larger
    const W = Math.sqrt(3) * s;
    const x = cx + q * (W * 0.92) + (r % 2 ? W * 0.46 : 0);
    const y = cy + r * (s * 1.1 * tilt);
    tiles.push({ q, r, x, y, s, isCenter: idx === 0 });
  });

  // 6 surrounding hexes are the placement targets (indices 1-6)
  const center = tiles[0];

  const combinedPower = Array.from(placed.values()).reduce((sum, a) => sum + a.power, 0);
  const canBegin = combinedPower >= 7 && placed.size > 0;

  const handleBegin = () => {
    setPurifying(true);
    setTimeout(() => {
      onVictory(Array.from(placed.values()).map(a => a.id));
    }, 1800);
  };

  const handleHexClick = (tileIdx: number) => {
    if (purifying || tileIdx === 0) return; // center not placeable
    if (selected === null) {
      // Tap placed Awoken to remove it (refund energy)
      if (placed.has(tileIdx)) {
        const next = new Map(placed);
        next.delete(tileIdx);
        setPlaced(next);
        setEnergy(e => Math.min(e + 2, maxEnergy));
      }
      return;
    }
    if (energy < 2) return;
    const awoken = hand[selected];
    if (!awoken) return;
    // Check not already placed elsewhere
    for (const [, a] of placed) if (a.id === awoken.id) return;
    const next = new Map(placed);
    next.set(tileIdx, awoken);
    setPlaced(next);
    setSelected(null);
    setEnergy(e => e - 2);
  };

  return (
    <div className="first-trial">
      <div className="territory-hud">
        <div className="energy-meter">
          <span className="energy-label">Energy</span>
          <div className="energy-bar">
            <div className="energy-fill" style={{ width: `${(energy / maxEnergy) * 100}%` }} />
          </div>
          <span className="energy-value">{energy}/{maxEnergy}</span>
        </div>
      </div>
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
        {/* Tiles — surrounding hexes are clickable to place Awoken */}
        {tiles.map((t, i) => {
          const placedAwoken = placed.get(i);
          return (
          <g key={`t-${i}`} onClick={() => handleHexClick(i)}
            style={{ cursor: !t.isCenter && !purifying ? "pointer" : "default" }}>
            <g clipPath={`url(#ft-${i})`}>
              <image href={cursedImg}
                x={t.x - t.s * 1.3} y={t.y - t.s * 1.3 * tilt}
                width={t.s * 2.6} height={t.s * 2.6 * tilt}
                preserveAspectRatio="xMidYMid slice"
                opacity={t.isCenter ? 1 : 0.7} />
            </g>
            <polygon points={hexPoints(t.x, t.y, t.s)} fill="none"
              stroke={t.isCenter ? "#b89b5e" : placedAwoken ? "#5aaa5a" : "#6a1a1a"}
              strokeWidth={t.isCenter ? 3 : placedAwoken ? 2 : 1.2}
              opacity={t.isCenter ? 1 : 0.6} />
            {placedAwoken && (
              <image href={placedAwoken.image_url}
                x={t.x - t.s * 0.45} y={t.y - t.s * 0.6}
                width={t.s * 0.9} height={t.s * 1.15}
                preserveAspectRatio="xMidYMid meet" />
            )}
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
            <circle cx={center.x} cy={center.y} r="20" fill="#1a0a0a" stroke="#aa2a2a" strokeWidth="3" />
            <text x={center.x} y={center.y + 7} textAnchor="middle" fill="#cc5555" fontSize="18">✕</text>
            <text x={center.x} y={center.y + 38} textAnchor="middle" fill="#aa5555" fontSize="11">Power 7</text>
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
        {/* Text under hex */}
        <text x={center.x} y={center.y + center.s * tilt + 28} textAnchor="middle" fill="#555" fontSize="14" fontStyle="italic" opacity="0.85">
          Purify the dark to begin
        </text>
      </svg>
      <div className="trial-hand">
        <div className="hand-label">Tap a card, then tap a surrounding hex — combined power must reach 7</div>
        <div className="hand-cards">
          {hand.map((a, i) => {
            const used = Array.from(placed.values()).some(p => p.id === a.id);
            return (
              <button key={a.id} className={`hand-card ${selected === i ? "selected" : ""} ${used ? "used" : ""}`}
                disabled={used || purifying}
                onClick={() => setSelected(selected === i ? null : i)}>
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
          {purifying ? "Purifying..." : "Begin the Purification"}
        </button>
      </div>
    </div>
  );
}
