import { useState } from "react";
import type { Awakened } from "./api";
import cursedImg from "./assets/terrain/cursed.jpg";
import neutralImg from "./assets/terrain/neutral.jpg";

interface Props {
  hand: Awakened[];
  onVictory: (teamIds: number[]) => void;
}

export default function FirstTrial({ hand, onVictory }: Props) {
  const [slots, setSlots] = useState<(Awakened | null)[]>([null, null, null, null, null, null]);
  const [selected, setSelected] = useState<number | null>(null);
  const [purifying, setPurifying] = useState(false);

  const size = 70, tilt = 0.62;
  const cx = 250, cy = 140;

  const hexPoints = (x: number, y: number, s: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      pts.push(`${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a) * tilt).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // 6 slots around the center
  const slotPos = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 90);
    const sx = cx + (size * 1.9) * Math.cos(a);
    const sy = cy + (size * 1.9) * Math.sin(a) * tilt + 10;
    slotPos.push({ x: sx, y: sy });
  }

  const combinedPower = slots.filter(Boolean).reduce((sum, a) => sum + (a?.power ?? 0), 0);
  const canBegin = combinedPower >= 7 && slots.some(Boolean);

  const handleBegin = () => {
    setPurifying(true);
    // Animation sequence: shake (0.4s) → shatter (0.6s) → flash (0.8s) → reveal (0.8s)
    setTimeout(() => {
      onVictory(slots.filter(Boolean).map(a => a!.id));
    }, 1800);
  };

  const placeInSlot = (slotIdx: number) => {
    if (selected === null) return;
    const awoken = hand[selected];
    if (!awoken || slots.some(s => s?.id === awoken.id)) return;
    const next = [...slots];
    next[slotIdx] = awoken;
    setSlots(next);
    setSelected(null);
  };

  const removeFromSlot = (slotIdx: number) => {
    const next = [...slots];
    next[slotIdx] = null;
    setSlots(next);
  };

  return (
    <div className="first-trial">
      <svg viewBox="0 0 500 320" className="trial-svg">
        <defs>
          <clipPath id="trial-center">
            <polygon points={hexPoints(cx, cy, size)} />
          </clipPath>
          <filter id="trial-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000" floodOpacity="0.8" />
          </filter>
        </defs>
        {/* Shadow under hex */}
        <polygon points={hexPoints(cx, cy + 12, size)} fill="#000" opacity="0.6" filter="url(#trial-shadow)" />
        {/* Cursed center hex — shatters when purifying */}
        <g clipPath="url(#trial-center)" className={purifying ? "purifying" : ""}>
          <g className="trial-hex">
            <image href={cursedImg} x={cx - size * 1.3} y={cy - size * 1.3 * tilt} width={size * 2.6} height={size * 2.6 * tilt} preserveAspectRatio="xMidYMid slice" />
          </g>
        </g>
        <polygon points={hexPoints(cx, cy, size)} fill="none" stroke="#8a1a1a" strokeWidth="2.5" />
        {/* Unraveler — fades when purifying */}
        {!purifying && (
          <g>
            <circle cx={cx} cy={cy} r="22" fill="#1a0a0a" stroke="#aa2a2a" strokeWidth="3" />
            <text x={cx} y={cy + 7} textAnchor="middle" fill="#cc5555" fontSize="20">✕</text>
            <text x={cx} y={cy + 42} textAnchor="middle" fill="#aa5555" fontSize="12">Power 7</text>
          </g>
        )}
        {/* Purification particles */}
        {purifying && Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const dist = 80 + Math.random() * 40;
          return (
            <circle key={i} cx={cx} cy={cy} r="4" fill="#b89b5e"
              className="purify-particle"
              style={{ "--px": `${Math.cos(angle) * dist}px`, "--py": `${Math.sin(angle) * dist}px` } as React.CSSProperties} />
          );
        })}
        {/* Flash of light */}
        {purifying && (
          <polygon points={hexPoints(cx, cy, size)} fill="#fff8e8" className="purify-flash" />
        )}
        {/* Neutral tile revealed */}
        {purifying && (
          <g clipPath="url(#trial-center)" className="purify-reveal" opacity="0">
            <image href={neutralImg} x={cx - size * 1.3} y={cy - size * 1.3 * tilt} width={size * 2.6} height={size * 2.6 * tilt} preserveAspectRatio="xMidYMid slice" />
          </g>
        )}
        {/* Slots */}
        {slotPos.map((p, i) => (
          <g key={i} onClick={() => slots[i] ? removeFromSlot(i) : placeInSlot(i)} style={{ cursor: "pointer" }}>
            <circle cx={p.x} cy={p.y} r="26" fill={slots[i] ? "#1a2a1a" : "#111"} stroke={slots[i] ? "#5aaa5a" : "#444"} strokeWidth="1.5" strokeDasharray={slots[i] ? "none" : "4,4"} />
            {slots[i] ? (
              <image href={slots[i]!.image_url} x={p.x - 18} y={p.y - 24} width="36" height="48" />
            ) : (
              <text x={p.x} y={p.y + 5} textAnchor="middle" fill="#444" fontSize="11">+</text>
            )}
          </g>
        ))}
        {/* Shadow text */}
        <text x={cx} y={cy + 95} textAnchor="middle" fill="#555" fontSize="14" fontStyle="italic" opacity="0.8">
          Purify the dark to begin
        </text>
      </svg>
      <div className="trial-hand">
        <div className="hand-label">Choose your team — combined power must reach 7</div>
        <div className="hand-cards">
          {hand.map((a, i) => {
            const used = slots.some(s => s?.id === a.id);
            return (
              <button key={a.id} className={`hand-card ${selected === i ? "selected" : ""} ${used ? "used" : ""}`}
                disabled={used}
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
