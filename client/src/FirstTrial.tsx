import { useState } from "react";
import type { Awakened } from "./api";
import FieldAwoken from "./FieldAwoken";
import cursedImg from "./assets/terrain/cursed.jpg";
import neutralImg from "./assets/terrain/neutral.jpg";
import unravelerImg from "./assets/adversaries/unraveler.png";

interface Props {
  hand: Awakened[];
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
  onVictory: (teamIds: number[]) => void;
}

export default function FirstTrial({ hand, assets, onVictory }: Props) {
  const [placed, setPlaced] = useState<Map<number, Awakened>>(new Map());
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

  const combinedPower = Array.from(placed.values()).reduce((sum, a) => sum + a.power, 0);
  const canBegin = combinedPower >= 7 && placed.size > 0;

  const handleBegin = async () => {
    setPurifying(true);
    // Let the animation breathe, then ask the server. If it refuses,
    // come back — don't leave the Tender staring at "Purifying..." forever.
    await new Promise(r => setTimeout(r, 1800));
    try {
      await onVictory(Array.from(placed.values()).map(a => a.id));
    } catch (e) {
      console.error("[Trial] Purification refused", e);
      setPurifying(false);
    }
  };

  // Auto-place: tap a card → goes to next available keystone on center
  const handleCardTap = (index: number) => {
    if (purifying) return;
    const awoken = hand[index];
    if (!awoken) return;
    // If already placed, remove it
    for (const [posIdx, a] of placed) {
      if (a.id === awoken.id) {
        const next = new Map(placed);
        next.delete(posIdx);
        setPlaced(next);
        setEnergy(e => Math.min(e + deployCost(a.power), maxEnergy));
        return;
      }
    }
    // Find next available keystone
    const usedPositions = new Set(placed.keys());
    let posIdx = -1;
    for (let i = 0; i < 4; i++) {
      if (!usedPositions.has(i)) { posIdx = i; break; }
    }
    if (posIdx === -1) return; // All 4 filled
    const cost = deployCost(awoken.power);
    if (energy < cost) return;
    const next = new Map(placed);
    next.set(posIdx, awoken);
    setPlaced(next);
    setEnergy(e => e - cost);
  };

  return (
    <div className="first-trial">
      <div className="trial-title">Purify the dark to begin</div>
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
        {/* Placed Awoken on center hex (no visible positions — auto-placed) */}
        {!purifying && Array.from(placed.entries()).map(([posIdx, awoken]) => {
          const p = keystones[posIdx];
          return (
            <g key={`placed-${posIdx}`} onClick={() => handleCardTap(hand.findIndex(h => h.id === awoken.id))}
              style={{ cursor: "pointer" }}>
              <FieldAwoken awoken={awoken} assets={assets}
                x={p.x - 14} y={p.y - 18} width={28} height={36}
                showFieldBornMarker={false} />
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
      <div className="trial-hand">
        <div className="hand-label">Tap cards to send them into the dark — combined power must reach 7</div>
        <div className="hand-cards">
          {hand.map((a, i) => {
            const used = Array.from(placed.values()).some(p => p.id === a.id);
            return (
              <button key={a.id} className={`hand-card ${used ? "used" : ""}`}
                disabled={purifying}
                onClick={() => handleCardTap(i)}>
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
