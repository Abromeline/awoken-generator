import { useState } from "react";

interface Step {
  title: string;
  body: string[];
  lore?: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome, Tender",
    body: [
      "This is your territory — hexes adrift in the void. The center tile is purified. Everything around it is cursed.",
      "Your Awoken are matter held together by attention. Your attention is the binding force.",
    ],
    lore: "The Awoken never fight each other. That is not what they are here to do.",
  },
  {
    title: "Place Your First Awoken",
    body: [
      "Tap a card in your hand, then tap a purified tile to deploy them.",
      "Once placed, an Awoken cannot return to hand. They are committed to the land.",
      "Awoken in your hand grant energy — stronger ones grant more.",
    ],
  },
  {
    title: "Energy & Waking",
    body: [
      "Wake more Awoken for energy. Each one in hand increases your energy cap.",
      "Deploying costs energy based on the Awoken's power.",
      "Balance: keep some in hand for energy, deploy others to expand.",
    ],
  },
  {
    title: "Stances",
    body: [
      "⚔ Attack (1 energy): Strike adjacent cursed tiles. Each attack dwindles curse HP by the Awoken's power.",
      "🛡 Defense (1 energy): Hold ground. Guards the tile and blocks enemies.",
      "✦ Binding (1 energy + 3/hr): Heals wounded defenders. The ONLY shield against tile loss.",
    ],
    lore: "Binding is attention made manifest. It costs 3 energy per hour to maintain — unpaid binding drops to defense.",
  },
  {
    title: "Purifying Land",
    body: [
      "Each cursed tile shows ♥ — its curse HP. Attack with adjacent Awoken to dwindle it.",
      "At 0 HP, the curse breaks and the tile becomes yours.",
      "Curses grow stronger farther from center. You'll need more Awoken — or stronger ones — to push outward.",
    ],
  },
  {
    title: "The Unraveling",
    body: [
      "Waves of the Unraveling assault your territory. Tap 'Face the Next Wave' when ready.",
      "Towers fire first. Then Awoken and enemies act in initiative order (tougher = slower).",
      "Enemies target your Awoken and towers — unless they see an undefended tile, then they go for the land.",
    ],
    lore: "The Unbinding is entropy trying to rip their world apart. Your attention is the only thing holding it together.",
  },
  {
    title: "Enemies",
    body: [
      "👹 FRAY: Small ink splatters. Weak alone, dangerous in groups.",
      "🌀 UNRAVELER: Looming ink mass. Targets your strongest Awoken.",
      "🕳️ HOLLOW: Pure void. Drains your energy instead of dealing damage.",
      "🌿 TANGLE: Knotted thorns. Pins one Awoken for the wave.",
    ],
    lore: "Adversaries have no elements, no synergy. They are entropy, falling apart. Your edge is fellowship.",
  },
  {
    title: "Tactics",
    body: [
      "Towers are your first line — they volley before anyone moves. Place them to cover approaches.",
      "Tough Awoken move slowly but hit hard. Fast ones strike first.",
      "Ranged attacks lose power with distance. Keep archers close.",
      "If a tile has no defenders, enemies will corrupt it. Never leave borders undefended.",
    ],
  },
  {
    title: "Binding & Healing",
    body: [
      "Binding Awoken heal wounded defenders between waves.",
      "Healing = total power ÷ wounded Awoken in hex + adjacent hexes.",
      "Damage persists. Heal matters. A wounded Awoken left alone stays wounded.",
    ],
    lore: "The Tender's attention IS the binding force. To bind is to care, and care has a cost.",
  },
  {
    title: "Attunement Shrine",
    body: [
      "Build an Attunement Shrine to double aspect attunement from adjacent Binding Awoken.",
      "Aspects are earned through attunement — 10 points spawns a random aspect.",
      "Matching elements upgrade aspects I → II → III.",
    ],
  },
  {
    title: "Champions",
    body: [
      "Every Awoken dreams of one day being a champion — shaping the world merely with their presence.",
      "A well-attuned champion can turn the tide of the curse. Their element flows into the land around them.",
      "Raise many, not one. Each champion is a beacon. Together, they are a dawn.",
    ],
    lore: "Which element will you choose? Tide, Sky, Stone, Root — each shapes the world differently. Pick well.",
  },
  {
    title: "Expand",
    body: [
      "Purify 7 tiles and build 1 Attunement Shrine to complete your training.",
      "Then the land is yours to shape. Build towers, raise Awoken, face the waves.",
      "The Unraveling never stops. But neither do you.",
    ],
  },
];

export default function Tutorial({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-card">
        <p className="eyebrow">Tutorial {step + 1}/{STEPS.length}</p>
        <h2>{s.title}</h2>
        {s.body.map((p, i) => <p key={i}>{p}</p>)}
        {s.lore && <blockquote className="tutorial-lore">{s.lore}</blockquote>}
        <div className="tutorial-nav">
          {step > 0 && (
            <button className="abtn small" onClick={() => setStep(step - 1)}>← Back</button>
          )}
          <button className="abtn" onClick={() => {
            if (isLast) {
              localStorage.setItem("awoken-tutorial-done", "1");
              onComplete();
            } else {
              setStep(step + 1);
            }
          }}>
            {isLast ? "Begin →" : "Next →"}
          </button>
          <button className="quiet-link" onClick={() => {
            localStorage.setItem("awoken-tutorial-done", "1");
            onComplete();
          }}>Skip</button>
        </div>
      </div>
    </div>
  );
}

// Check if tutorial objectives are met
export function tutorialComplete(tiles: any[], buildings: any[]): boolean {
  const uncursed = tiles.filter(t => !t.cursed).length;
  const shrines = buildings.filter(b => b.buildingType === "attunement-shrine" && b.status === "active").length;
  return uncursed >= 7 && shrines >= 1;
}
