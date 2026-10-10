import { useState } from "react";

interface Page {
  title: string;
  body: string[];
  diagram?: "curse" | "attune";
}

const PAGES: Page[] = [
  {
    title: "Welcome, Tender",
    body: [
      "The Awoken are matter held together by attention — your attention is the binding force.",
      "You wake them, you name them, you place them on the land. Each one is drawn by a human hand, layer upon layer.",
      "This packet holds what you need to begin. Take your time — there is no hurry here.",
    ],
  },
  {
    title: "Your Land",
    body: [
      "Your deck is not a pile of cards. It is a territory — hexes adrift in the void.",
      "Your HAND holds Awoken not yet placed. Tap a card, then tap a purified tile to deploy them.",
      "Awoken in hand grant energy: stronger ones grant more. Deploying costs energy based on their power.",
      "Once placed, an Awoken cannot return to hand. They are committed to the land.",
    ],
  },
  {
    title: "Curses & Attacks",
    body: [
      "The wilds around your land are cursed. Each cursed tile shows a ♥ number — its curse HP.",
      "Set an Awoken to attack stance (1 energy), then tap an adjacent cursed tile to strike (1 energy per attack).",
      "Each attack dwindles the curse by the Awoken's power. At 0, the curse breaks and the tile turns neutral.",
      "Curses grow stronger farther from your center. You will need more Awoken — or stronger ones — to push outward.",
    ],
    diagram: "curse",
  },
  {
    title: "Stances & Energy",
    body: [
      "Every stance costs 1 energy to enter. Choose well — energy is precious.",
      "⚔ Attack: strike adjacent cursed tiles. 🛡 Defense: hold ground and guard.",
      "✦ Binding: heals wounded defenders in battle and shields the tile from falling. Costs 3 energy per hour to maintain.",
      "Buildings cost 2 energy to raise. Watchtowers volley at waves, thorn walls wound attackers, wheat harvests energy.",
    ],
  },
  {
    title: "The Unraveling",
    body: [
      "Waves of the Unraveling assault your territory. Survive, and the wave breaks.",
      "Victory brings a spinning golden hex — and a choice. Pick one new territory from the map as your reward.",
      "Then decide: ✦ Raise Binding to bank your progress and rest, or Continue → for +6 energy, fresh cards, and a harder wave.",
      "An Awoken's presence slowly attunes neutral land toward its element — 13 minutes to take root.",
    ],
    diagram: "attune",
  },
];

function CurseDiagram() {
  return (
    <svg viewBox="0 0 300 100" width="300" height="100" style={{ display: "block", margin: "12px auto" }}>
      <polygon points="60,10 110,35 110,75 60,95 10,75 10,35" fill="#2a1a2a" stroke="#a04a4a" strokeWidth="2" />
      <text x="60" y="55" textAnchor="middle" fill="#ff6666" fontSize="14" fontWeight="bold">♥ 10</text>
      <text x="150" y="55" textAnchor="middle" fill="#b89b5e" fontSize="20">→</text>
      <polygon points="240,10 290,35 290,75 240,95 190,75 190,35" fill="#2a3a2a" stroke="#4a9a4a" strokeWidth="2" />
      <text x="240" y="55" textAnchor="middle" fill="#8f8" fontSize="12">Pure</text>
      <text x="150" y="85" textAnchor="middle" fill="#999" fontSize="10">Attacks dwindle ♥ to 0</text>
    </svg>
  );
}

function AttuneDiagram() {
  return (
    <svg viewBox="0 0 300 100" width="300" height="100" style={{ display: "block", margin: "12px auto" }}>
      <rect x="20" y="25" width="70" height="50" fill="#2a2a2a" stroke="#666" rx="4" />
      <text x="55" y="48" textAnchor="middle" fill="#aaa" fontSize="11">Neutral</text>
      <text x="55" y="63" textAnchor="middle" fill="#888" fontSize="10">13 min</text>
      <text x="110" y="55" textAnchor="middle" fill="#b89b5e" fontSize="18">→</text>
      <rect x="130" y="25" width="70" height="50" fill="#1e3a4a" stroke="#4a9acc" strokeWidth="2" rx="4" />
      <text x="165" y="48" textAnchor="middle" fill="#cce" fontSize="11">Tide</text>
      <text x="165" y="63" textAnchor="middle" fill="#888" fontSize="10">attuned</text>
      <text x="225" y="55" textAnchor="middle" fill="#666" fontSize="10">presence</text>
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
          <div className="packet-dots">
            {PAGES.map((_, i) => (
              <span key={i} className={`packet-dot ${i === page ? "active" : ""} ${i < page ? "done" : ""}`}
                onClick={() => setPage(i)} />
            ))}
          </div>
          <button className="packet-close" onClick={onClose}>✕</button>
        </div>
        <h2 className="packet-title">{p.title}</h2>
        <div className="packet-body">
          {p.body.map((para, i) => <p key={i}>{para}</p>)}
          {p.diagram === "curse" && <CurseDiagram />}
          {p.diagram === "attune" && <AttuneDiagram />}
        </div>
        <div className="packet-nav">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>← Back</button>
          <button onClick={onClose} className="packet-skip-link">Skip all →</button>
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
