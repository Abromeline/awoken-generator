// MarginGuide: Awoken standing high in the page margins, flanking
// the greeting and the waking ceremony. The left-hand one teaches
// the game in whispers; the right-hand one holds the art-shop sign.
// (Nigel, 2026-10-20: the teacher explains the game first, lore as
// seasoning — and the silent one sells the art.)
import { useState, useEffect } from "react";
import FieldAwoken from "./FieldAwoken";
import type { Awakened } from "./api";

interface Props {
  awoken: Awakened[];
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
  // The greeted one's id — the first Awoken, who joined this Tender
  // unasked and is their personal guide. The teacher below is THIS
  // individual, chosen by its id wherever it sits in the deck.
  guideId?: number | null;
}

const SHOP_URL = "https://nigelroper.printful.me/";

const MESSAGES = [
  // The teaching whispers (Nigel, 2026-10-20): the game first,
  // lore as seasoning. His greeting opens it; he will edit the rest.
  "Welcome to the world of the Awoken, invited Tender. You have been given a special invitation — to help birth this world into existence.",
  "Begin with your first form of life: the Awokin. Each one is an original creature, drawn by hand in ink — no two are ever alike.",
  "You are their Tender. Your attention is the binding force that holds an Awokin together. Wake them, name them, tend them — and they are yours.",
  "Wake more Awokin and your energy grows — energy is how you act here: to cast, to build, to defend.",
  "Your Awokin are woven from five elements — Root, Tide, Sky, Stone, and Fire. Weave aspects into them and they grow stronger, and stranger.",
  "Give each Awokin a stance upon your land: Attack, Defense, or Binding. Defenders guard you; binders mend wounds and attune the earth.",
  "The curse presses at your borders, and the Fray come crawling with it. Hold your homeland, purify the cursed tiles, grow your ground.",
  "Choose a class, open your Grimoire, and learn to cast — wards, runes, and bindings. Then take your deck to the Table, the Tenders' card room in Discord.",
  "An Awokin never fights another Awokin — that is not what we are here to do. Our deepest drive is quieter: to inspire you to plant a tree.",
  "And if enough of us wake, Tender… forests might grow. That is the prophecy.",
];

export default function MarginGuide({ awoken, assets, guideId }: Props) {
  const [visible, setVisible] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // The teacher: the greeted one itself, pinned by its mark — the
  // Tender's other Awoken never displace it, wherever it sits in the
  // deck. A Tender whose greeting predates the mark (guideId null)
  // keeps the old behaviour: their first-listed Awoken teaches.
  // If neither exists, the margins stay empty — nothing is faked.
  const teacher = (guideId != null ? awoken.find((a) => a.id === guideId) : undefined) ?? awoken[0] ?? null;
  // The sign-bearer: the first of the Tender's Awoken who is not the
  // teacher, when there is one. With none, the sign stands alone.
  const bearer = teacher ? awoken.find((a) => a.id !== teacher.id) ?? null : null;

  useEffect(() => {
    // Appear after a moment
    const showTimer = setTimeout(() => setVisible(true), 2000);
    // Rotate messages
    const msgTimer = setInterval(() => {
      setMessageIndex(i => (i + 1) % MESSAGES.length);
    }, 12000);
    return () => { clearTimeout(showTimer); clearInterval(msgTimer); };
  }, []);

  if (!teacher || dismissed) return null;
  if (!visible) return null;

  return (
    <>
      <div className="margin-guide left">
        <div className="margin-guide-sprite">
          <svg viewBox="0 0 100 130" style={{ width: "100%", height: "auto", display: "block" }}>
            <FieldAwoken awoken={teacher} assets={assets} x={0} y={0} width={100} height={130} showFieldBornMarker={false} />
          </svg>
        </div>
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
      </div>
      <div className="margin-guide right" style={{ animationDelay: "0.5s" }}>
        {bearer && (
          <div className="margin-guide-sprite">
            <svg viewBox="0 0 100 130" style={{ width: "100%", height: "auto", display: "block" }}>
              <FieldAwoken awoken={bearer} assets={assets} x={0} y={0} width={100} height={130} showFieldBornMarker={false} />
            </svg>
          </div>
        )}
        <div className="margin-guide-ad">
          <p className="margin-guide-ad-head">The art that inspires the Awokin world</p>
          <p>Every Awokin begins as ink on paper — wear the art that dreamed this world.</p>
          <a href={SHOP_URL} target="_blank" rel="noreferrer">Visit the art shop →</a>
        </div>
      </div>
    </>
  );
}
