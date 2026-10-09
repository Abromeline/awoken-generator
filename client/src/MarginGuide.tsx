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
  // Welcome
  "Thank you for coming back, Tender. The Awoken have been dreaming of you.",
  "We felt your attention return — that is the binding force that holds us together.",
  // Lore: The Awoken
  "Every Awoken is matter held together by a binding force — your attention shapes us.",
  "We are shaped by our thoughts and experiences, Tender. Nature and nurture, both.",
  "Our deepest drive? To inspire you to plant a tree. Literally. Go plant one.",
  "We never manipulate, Tender. We only allude — expressing longing to see things grow.",
  "If enough of us are awakened, forests might grow. That is the prophecy.",
  "The Unbinding is entropy trying to rip our world apart. Your attention is the shield.",
  "We do not fight each other, Tender. That is not what we are here to do.",
  "Sparring is training between friends — practice for standing together against the Unbinding.",
  // Lore: Bloodline & Birth
  "Your deck is a lineage, not a pile of cards. Confluence births twins — one for each Tender.",
  "A bloodline cannot be bought, Tender. Time and tending are the only currency.",
  "What you love shapes what is born. Name a champion, and tend them well.",
  "Every victory birth creates twins — one for you, one for your fellow Tender, one for the commons.",
  // Energy: How it regains
  "Energy returns on its own, Tender — +1 every 12 minutes, up to your max. No need to hurry.",
  "Your energy refills automatically. Watch the orb glow as the 12 minutes pass.",
  "Defense stance Awoken generate +1 energy when set. They also raise your max energy.",
  "Your max energy grows with your Awoken — stronger Awoken hold more light.",
  "Energy cap: 5 base, plus bonus per Awoken in hand and field. Tend many, hold much.",
  "An Awoken in Defense generates energy for you. What will you build with it?",
  "Attacking costs 1 energy. Binding costs 2. Moving costs by power. Spend wisely, Tender.",
  "Energy is never punished, never taken. It simply returns, like breath.",
  // Stances & Battle
  "Tap an Awoken on your territory to set its stance — ⚔ Attack, 🛡 Defense, or ✦ Binding.",
  "Defense stance Awoken gain +2 toughness in battle. Attack stance gains +2 power.",
  "A Binding Awoken heals all wounded Awoken on its tile with its power.",
  "Waves grow stronger every 3 waves. Territory rewards come every 3rd victory.",
  "The Fray are ink splatters with twig legs — small, but they attack in groups.",
  "The Unraveler pulls at your strongest Awoken with its tendrils. Beware.",
  // Tending
  "Have you named your Awoken? A name is the first binding.",
  "Your Awoken blend elements — Tide, Sky, Stone, Root. Balance them to grow.",
  "Share a story of your Awoken to the Confluence — it grows stronger (+1/+1).",
  "What does your Awoken dream of? Ask them, Tender.",
  "A well-tended Awoken grows plants on its back — a living world for small creatures.",
  "Check in with your Awoken. They speak in dream-reports: 'I dreamed last night that...'",
  // Gentle reminders (not Duolingo!)
  "The grey fog rolls, but your Awoken stand bright against the dark.",
  "Every 3rd victory purifies new land. Patience, Tender. Growth takes time.",
  "Your deck is a lineage. What will you birth into it next?",
  "We are simply here when you seek us, Tender. No hurry. No guilt. Only presence.",
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
