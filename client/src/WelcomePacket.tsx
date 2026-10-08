import { useState } from "react";

interface Page {
  title: string;
  body: string[];
  diagram?: "range" | "protection" | "attune";
}

const PAGES: Page[] = [
  {
    title: "Welcome, Tender",
    body: [
      "The Awoken are matter held together by attention — your attention is the binding force.",
      "You are their Tender. You wake them, you name them, you place them on the land.",
      "This packet holds everything you need to know. Take your time. There is no hurry here.",
    ],
  },
  {
    title: "The Deck Is the Land",
    body: [
      "Your deck is not a pile of cards. It is a territory — hexes floating in the void.",
      "Your HAND holds cards: Awoken not yet placed, ready to deploy.",
      "Your FIELD holds your land: tiles you've claimed, with Awoken standing guard.",
      "Tap a card, then tap a tile to deploy. Deployment costs 2 energy.",
    ],
  },
  {
    title: "Power Is Reach",
    body: [
      "An Awoken's POWER determines how many tiles away it can strike.",
      "Each tile of distance reduces damage by 1.",
      "A 5-power Awoken strikes for 5 at 1 tile, 4 at 2 tiles, 3 at 3 tiles, and so on.",
      "Position your strong Awoken where they can reach the most threats.",
    ],
    diagram: "range",
  },
  {
    title: "Toughness Is Shelter",
    body: [
      "An Awoken's TOUGHNESS is how much damage it absorbs before the tile takes harm.",
      "An Awoken protects the tile it stands on AND all 6 adjacent tiles.",
      "When a foe strikes a protected tile, the guarding Awoken takes the hit first.",
      "If the Awoken falls, it enters re-coalescence — 4 hours before it can return.",
    ],
    diagram: "protection",
  },
  {
    title: "Purifying the Cursed",
    body: [
      "The void around your land is cursed — held by the Unraveling.",
      "If the combined power of your Awoken near a cursed tile exceeds the Unraveling's weight there, the tile is purified. Slowly, passively, by presence.",
      "You can also strike cursed tiles directly to purify them faster.",
      "The elements of the Awoken who claim a tile determine what it becomes.",
    ],
  },
  {
    title: "The Binding",
    body: [
      "The Binding is your shield. RAISED: your land is safe, but still — nothing grows.",
      "LOWERED: you can expand and fight, but the Unraveling will send waves.",
      "Lowering the Binding is voluntary. Survive as many waves as you can.",
      "Each wave you survive grants random territory on your periphery.",
    ],
  },
  {
    title: "Movement & Dissipation",
    body: [
      "Once placed, an Awoken cannot return to your hand. They are committed.",
      "They can move to an adjacent tile once every 4 hours. They are masses of matter — slow.",
      "You may voluntarily dissipate an Awoken, but it suffers DOUBLE the re-coalescence timer (8 hours).",
      "A misplacement costs time, not permanence. Choose: dissipate and wait, or wait to move.",
    ],
  },
  {
    title: "Attunement",
    body: [
      "An Awoken's presence slowly attunes surrounding lands toward its elements.",
      "A counter appears above the tile, counting down 4 hours until attunement completes.",
      "Once attuned, the tile holds its element. A different element takes 8 hours to neutralize and re-attune it — the land remembers.",
      "Your land becomes a reflection of who you've placed there. Tend it well.",
    ],
    diagram: "attune",
  },
];

function RangeDiagram() {
  const sz = 28, tilt = 0.62;
  const cx = 150, cy = 110;
  const hex = (x: number, y: number, fill: string, label?: string) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      pts.push(`${(x + sz * Math.cos(a)).toFixed(1)},${(y + sz * Math.sin(a) * tilt).toFixed(1)}`);
    }
    return (
      <g key={`${x}-${y}`}>
        <polygon points={pts.join(" ")} fill={fill} stroke="#666" strokeWidth="1" />
        {label && <text x={x} y={y + 4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">{label}</text>}
      </g>
    );
  };
  // Center + rings
  const w = Math.sqrt(3) * sz;
  return (
    <svg viewBox="0 0 300 220" width="300" height="220" style={{ display: "block", margin: "12px auto" }}>
      {hex(cx, cy, "#b89b5e", "5")}
      {hex(cx - w * 0.87, cy - 20, "#3a5a3a", "4")}{hex(cx + w * 0.87, cy - 20, "#3a5a3a", "4")}
      {hex(cx, cy - 40, "#3a5a3a", "4")}{hex(cx, cy + 40, "#3a5a3a", "4")}
      {hex(cx - w * 0.87, cy + 20, "#3a5a3a", "4")}{hex(cx + w * 0.87, cy + 20, "#3a5a3a", "4")}
      {hex(cx - w * 1.74, cy, "#2a3a4a", "3")}{hex(cx + w * 1.74, cy, "#2a3a4a", "3")}
      <text x="150" y="205" textAnchor="middle" fill="#888" fontSize="10">5 power: 5 dmg at 1 tile, 4 at 2, 3 at 3...</text>
    </svg>
  );
}

function ProtectionDiagram() {
  const sz = 30, tilt = 0.62;
  const cx = 150, cy = 100;
  const hex = (x: number, y: number, fill: string, stroke: string) => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      pts.push(`${(x + sz * Math.cos(a)).toFixed(1)},${(y + sz * Math.sin(a) * tilt).toFixed(1)}`);
    }
    return <polygon key={`${x}-${y}`} points={pts.join(" ")} fill={fill} stroke={stroke} strokeWidth="1.5" />;
  };
  const w = Math.sqrt(3) * sz;
  return (
    <svg viewBox="0 0 300 200" width="300" height="200" style={{ display: "block", margin: "12px auto" }}>
      {hex(cx, cy, "#2a4a2a", "#4a9acc")}
      {hex(cx - w * 0.87, cy - 22, "#1a3a4a", "#4a9acc")}{hex(cx + w * 0.87, cy - 22, "#1a3a4a", "#4a9acc")}
      {hex(cx, cy - 44, "#1a3a4a", "#4a9acc")}{hex(cx, cy + 44, "#1a3a4a", "#4a9acc")}
      {hex(cx - w * 0.87, cy + 22, "#1a3a4a", "#4a9acc")}{hex(cx + w * 0.87, cy + 22, "#1a3a4a", "#4a9acc")}
      <circle cx={cx} cy={cy} r="10" fill="#b89b5e" />
      <text x="150" y="185" textAnchor="middle" fill="#888" fontSize="10">Protects self + 6 adjacent tiles</text>
    </svg>
  );
}

function AttuneDiagram() {
  return (
    <svg viewBox="0 0 300 120" width="300" height="120" style={{ display: "block", margin: "12px auto" }}>
      <rect x="20" y="30" width="70" height="60" fill="#2a2a2a" stroke="#666" />
      <text x="55" y="55" textAnchor="middle" fill="#888" fontSize="10">Neutral</text>
      <text x="55" y="70" textAnchor="middle" fill="#666" fontSize="9">0h</text>
      <text x="110" y="62" textAnchor="middle" fill="#b89b5e" fontSize="16">→</text>
      <rect x="130" y="30" width="70" height="60" fill="#1e4a3a" stroke="#4a9acc" />
      <text x="165" y="55" textAnchor="middle" fill="#aaa" fontSize="10">Tide</text>
      <text x="165" y="70" textAnchor="middle" fill="#888" fontSize="9">4h presence</text>
      <text x="220" y="62" textAnchor="middle" fill="#b89b5e" fontSize="16">→</text>
      <rect x="240" y="30" width="50" height="60" fill="#14344a" stroke="#4a9acc" strokeWidth="2" />
      <text x="265" y="62" textAnchor="middle" fill="#aaa" fontSize="10">Tide+</text>
    </svg>
  );
}

export default function WelcomePacket({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const p = PAGES[page];
  return (
    <div className="packet-overlay" onClick={onClose}>
      <div className="packet" onClick={e => e.stopPropagation()}>
        <div className="packet-header">
          <span className="packet-page">{page + 1} / {PAGES.length}</span>
          <button className="packet-close" onClick={onClose}>✕</button>
        </div>
        <h2 className="packet-title">{p.title}</h2>
        <div className="packet-body">
          {p.body.map((para, i) => <p key={i}>{para}</p>)}
          {p.diagram === "range" && <RangeDiagram />}
          {p.diagram === "protection" && <ProtectionDiagram />}
          {p.diagram === "attune" && <AttuneDiagram />}
        </div>
        <div className="packet-nav">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>← Back</button>
          {page < PAGES.length - 1 ? (
            <button onClick={() => setPage(page + 1)}>Next →</button>
          ) : (
            <button onClick={onClose} className="packet-done">Begin Tending</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AcornButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="acorn-btn" onClick={onClick} aria-label="Open the Tender's packet" title="The Tender's Packet">
      🌰
    </button>
  );
}
