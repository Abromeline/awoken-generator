// MarginGuide: Awoken sprites that pop up in the page margins
// offering game hints and welcoming the Tender back.
import { useState, useEffect } from "react";
import FieldAwoken from "./FieldAwoken";
import type { Awakened } from "./api";

interface Props {
  awoken: Awakened[];
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
}

const MESSAGES = [
  "Thank you for coming back, Tender. The Awoken have been dreaming of you.",
  "Tap an Awoken on your territory to set its stance — ⚔ Attack, 🛡 Defense, or ✦ Binding.",
  "Defense stance Awoken gain +2 toughness in battle. Attack stance gains +2 power.",
  "A Binding Awoken heals all wounded Awoken on its tile with its power.",
  "Waves grow stronger every 3 waves. Territory rewards come every 3rd victory.",
  "Have you named your Awoken? A name is the first binding.",
  "Your Awoken blend elements — Tide, Sky, Stone, Root. Balance them to grow.",
  "The Unraveling comes in waves. Defend your purified land, Tender.",
  "An Awoken in Defense generates energy for you. What will you build with it?",
  "Share a story of your Awoken to the Confluence — it grows stronger (+1/+1).",
  "What does your Awoken dream of? Ask them, Tender.",
  "The grey fog rolls, but your Awoken stand bright against the dark.",
  "Every 3rd victory purifies new land. Patience, Tender. Growth takes time.",
  "Your deck is a lineage. What will you birth into it next?",
];

export default function MarginGuide({ awoken, assets }: Props) {
  const [visible, setVisible] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Pick up to 2 Awoken for the margins
  const guides = awoken.slice(0, 2);
  if (guides.length === 0 || dismissed) return null;

  useEffect(() => {
    // Appear after a moment
    const showTimer = setTimeout(() => setVisible(true), 2000);
    // Rotate messages
    const msgTimer = setInterval(() => {
      setMessageIndex(i => (i + 1) % MESSAGES.length);
    }, 12000);
    return () => { clearTimeout(showTimer); clearInterval(msgTimer); };
  }, []);

  if (!visible) return null;

  return (
    <>
      {guides.map((a, idx) => (
        <div
          key={a.id}
          className={`margin-guide ${idx === 0 ? "left" : "right"}`}
          style={{ animationDelay: `${idx * 0.5}s` }}
        >
          <div className="margin-guide-sprite">
            <svg viewBox="0 0 100 130" style={{ width: "100%", height: "auto", display: "block" }}>
              <FieldAwoken awoken={a} assets={assets} x={0} y={0} width={100} height={130} showFieldBornMarker={false} />
            </svg>
          </div>
          {idx === 0 && (
            <div className="margin-guide-bubble">
              <p>{MESSAGES[messageIndex]}</p>
              <button 
                className="margin-guide-next"
                onClick={() => setMessageIndex(i => (i + 1) % MESSAGES.length)}
                title="Another whisper"
              >
                ⋯
              </button>
              <button
                className="margin-guide-dismiss"
                onClick={() => setDismissed(true)}
                title="Rest now"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
