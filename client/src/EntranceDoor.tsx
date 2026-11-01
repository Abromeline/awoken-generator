/**
 * THE DOOR — ENTRANCE BUILD 1 (Nigel's build word, 2026-11-01).
 *
 * The new player's entrance on the homeland, in his order:
 * choose your class → choose your spell → choose your
 * favourite weapon → BOOM, three Awoken wake at once → onto
 * the field. This component is the door's face for accounts
 * the server marked at claim time (getEntranceStatus); it
 * renders nothing for anyone else, and the old road's faces
 * (the greeting, WakeRitual, the choosing at three) are
 * untouched by it.
 *
 * The class step calls the DOOR's class action (the general
 * chooseClass gate stands unloosened); the weapon step rides
 * the standing chooseWeapon, exactly as the choosing's second
 * gift always has; the waking composes three forms with the
 * shared wake hands (wakeShared — the same pick and the same
 * canvas as WakeRitual) and sends them to the door's one
 * waking action. The three cards then stand TOGETHER in the
 * EntranceCeremony below — a three-card presentation path
 * beside WakeRitual's single-card path, which is shared with
 * the workshop and is not touched.
 *
 * THE WHISPERS (drafts for Nigel's polish, flagged in the
 * build report): each of the three whispers a TUTORIAL line
 * as it wakes — the companions teach. The first tells what an
 * Awoken is; the second speaks its own element in plain
 * words; the third turns the player's eyes to the beacon.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Awakened, type EntranceStatus } from "./api";
import { TENDER_CLASSES, TENDER_CLASS_ORDER, type TenderClassId } from "./tenderArt";
import { WEAPONS, WEAPON_ORDER, weaponImg, type WeaponKey } from "./weaponArt";
import { canWake, compose, pickLayerSet, toLayerRefs, type WakeLayerAsset } from "./wakeShared";
import { TradingCard, elementColors, elementForPiece } from "./App";
import { ElementGlyph } from "./glyphs";
import birthFrame from "./assets/birth-frame.png";

/** Whisper 1 — what an Awoken is, and being held by attention. */
export const ENTRANCE_WHISPER_FIRST = "I am an Awokin — scattered matter, held together by your attention. Keep looking at me, and I hold.";
/** Whisper 3 — eyes to the beacon. */
export const ENTRANCE_WHISPER_THIRD = "Now look to your land. A starseed waits there — light its beacon, and we three will stand beside you.";
/** Whisper 2 — the second one's own element, in plain words. */
export function entranceElementWhisper(element: string | null | undefined): string {
  switch (element) {
    case "root": return "Root runs through me — I grow, I hold on, and I mend slow and sure.";
    case "tide": return "Tide runs through me — I flow around what blocks me, and wear it down.";
    case "sky": return "Sky runs through me — I am quick and light, and hard to hold.";
    case "stone": return "Stone runs through me — I am slow to move, and hard to break.";
    case "fire": return "Fire runs through me — I burn bright, and I strike hot.";
    default: return "No one element claims me — I am plain matter, and your attention alone holds me.";
  }
}

/** The element a woken form speaks by: the element standing
 *  greatest among its picked pieces, by power. */
function dominantElement(layers: WakeLayerAsset[]): string | null {
  const byElement = new Map<string, number>();
  for (const l of layers) {
    if (!l.element) continue;
    byElement.set(l.element, (byElement.get(l.element) ?? 0) + (l.power ?? 0));
  }
  let best: string | null = null; let bestN = -1;
  for (const [el, n] of byElement) if (n > bestN) { best = el; bestN = n; }
  return best;
}

const CLASS_LAW_SHORT: Record<TenderClassId, string> = {
  warden: "School: Ward — +2 on ward casts, −3 across the closed schools.",
  runewright: "School: Rune — +2 on rune casts, −3 across the closed schools.",
  binder: "School: Binding — +2 on binding casts, −3 across the closed schools.",
  witch: "School: Spell — +2 on spell casts; her attunement pours lay twice what they cost.",
  sage: "No school — −2 on every cast, but her Attune lays deeper and her company stands taller.",
};

/**
 * THE THREE-CARD CEREMONY: the door's waking, presented —
 * three cards at once, each with its whisper beneath it. It
 * stands beside WakeRitual's single-card ceremony: the same
 * card, the same ceremony stage (drift-in, then the four
 * corners burning in their elemental colours, power and
 * toughness last), the same clock (forming → burning at
 * 2.6 s → done at 6.7 s) — but all three cards run it
 * TOGETHER, their corner burns rippling across the row, and
 * each whisper lands as its card settles. Tapping a card
 * hastens its ceremony to done, as the single card's does.
 * WakeRitual's path itself is untouched — it is shared with
 * the workshop's waking and keeps its own one-card road.
 */
export function EntranceCeremony({ trio, whispers, onDone }: {
  trio: Awakened[];
  whispers: string[];
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"forming" | "burning" | "done">("forming");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("burning"), 2600);
    const t2 = setTimeout(() => setPhase("done"), 2600 + 4100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  // The corner burn reads the creature's own pieces, exactly
  // as the single-card ceremony reads them: top-left the
  // body's element, top-right the arms', bottom-left the
  // head's — from the part's recorded element, never its name.
  const burnFor = (item: Awakened, category: string) => {
    const layer = item.layers.find((l) => l.category === category);
    if (!layer) return null;
    const el = elementForPiece(layer.name, (layer as any).element);
    return el === "neutral" ? null : el;
  };
  return (
    <div className="entrance-ceremony" role="dialog" aria-label="Three Awoken wake">
      <div className="entrance-ceremony-card">
        <p className="eyebrow">The waking</p>
        <h2>Three wake at once</h2>
        <p className="entrance-ceremony-sub">BOOM — the matter gathers, and three forms cross over together. Each whispers as it wakes. Listen.</p>
        <div className="entrance-trio">
          {trio.map((item, i) => {
            const burnBody = burnFor(item, "body");
            const burnArms = burnFor(item, "arms");
            const burnHead = burnFor(item, "head");
            // The trio burns on one clock; each card's corners
            // kindle a breath after the card before it.
            const stagger = i * 0.35;
            const delay = (base: number) => `${(base + stagger).toFixed(3)}s`;
            return (
              <figure key={item.id} className="entrance-trio-one">
                <div className="ceremony-card-wrap ceremony-card-form">
                  <div className="ceremony-card-stage" data-phase={phase} onClick={() => { if (phase !== "done") setPhase("done"); }}>
                    <TradingCard item={item} />
                    {burnBody && (<span className="ceremony-burn burn-tl" style={{ "--elem": elementColors[burnBody], "--burn-delay": delay(0) } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnBody} color={elementColors[burnBody]} dotColor={elementColors[burnBody]} width={54} height={22} /></span>)}
                    {burnArms && (<span className="ceremony-burn burn-tr" style={{ "--elem": elementColors[burnArms], "--burn-delay": delay(1.025) } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnArms} color={elementColors[burnArms]} dotColor={elementColors[burnArms]} width={54} height={22} /></span>)}
                    {burnHead && (<span className="ceremony-burn burn-bl" style={{ "--elem": elementColors[burnHead], "--burn-delay": delay(2.05) } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnHead} color={elementColors[burnHead]} dotColor={elementColors[burnHead]} width={54} height={22} /></span>)}
                    <span className="ceremony-burn burn-br ceremony-burn-pt" style={{ "--elem": "#d98a4a", "--burn-delay": delay(3.075) } as CSSProperties} aria-hidden="true">{item.power}/{item.toughness}</span>
                    <img className="birth-frame" src={birthFrame} alt="" aria-hidden="true" />
                  </div>
                </div>
                {phase === "done" && <figcaption className="entrance-whisper">“{whispers[i]}”</figcaption>}
              </figure>
            );
          })}
        </div>
        {phase === "done" && (
          <div className="class-choosing-row">
            <button type="button" className="abtn gold" onClick={onDone}>To the field — light the beacon</button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * THE POOL, SHOWN WHERE THE PLAYER ALREADY LOOKS: after the
 * door, the wake screen's own ground — a single honest line
 * above Wake One, beside the credit count it is distinct
 * from: the 20 are theirs, recorded, and not yet spendable;
 * Build 2's tutorial sections pay them out. Renders nothing
 * for legacy accounts (their credits speak for themselves)
 * and nothing once the pool is spent by that road.
 */
export function EntrancePoolNote() {
  const statusQ = useQuery({ queryKey: ["entranceStatus"], queryFn: () => api.getEntranceStatus(), retry: false });
  const status = statusQ.data;
  if (!status || !status.entrance || status.step !== "done" || status.awardPool <= 0) return null;
  return (
    <p className="entrance-award-note" role="status">
      Award pool: <strong>{status.awardPool} wakes</strong> are recorded as yours — earned along the road ahead, five at a time as you learn the land. They are not spendable yet, and Wake One does not draw from them.
    </p>
  );
}

export default function EntranceDoor({ assets, onFinished }: {
  assets: WakeLayerAsset[];
  /** The door is done: the three stand in the deck — the host
   *  refreshes the studio and the player walks to their land. */
  onFinished: () => void;
}) {
  const queryClient = useQueryClient();
  const statusQ = useQuery({ queryKey: ["entranceStatus"], queryFn: () => api.getEntranceStatus(), retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [trio, setTrio] = useState<Awakened[] | null>(null);
  const [whispers, setWhispers] = useState<string[]>([]);
  const status: EntranceStatus | undefined = statusQ.data;

  // Not the door — legacy accounts and signed-out visitors
  // see nothing of this face. (The query needs a session; its
  // refusal simply keeps the door shut.)
  if (!status || !status.entrance) return null;
  // The door is walked: the three stand, ordinary play begins.
  if (status.step === "done" && !trio) return null;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["entranceStatus"] });
    await queryClient.invalidateQueries({ queryKey: ["tenderExp"] });
  }

  async function chooseClass(id: TenderClassId) {
    setBusy(id); setError("");
    try { await api.entranceChooseClass({ classKey: id }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "The choosing failed."); }
    finally { setBusy(null); }
  }

  async function chooseSpell(key: string) {
    setBusy("spell:" + key); setError("");
    try { await api.entranceChooseSpell({ spellKey: key }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "The spell would not come."); }
    finally { setBusy(null); }
  }

  async function chooseWeapon(key: WeaponKey) {
    setBusy("w:" + key); setError("");
    try { await api.chooseWeapon({ weaponKey: key }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "The weapon would not come."); }
    finally { setBusy(null); }
  }

  async function wakeThree() {
    if (!canWake(assets)) { setError("The workshop's matter has not arrived yet — the waking gathers in a moment."); return; }
    setBusy("wake"); setError("");
    try {
      // Three forms, gathered by the shared wake hands — the
      // first with the firstborn weighting, as the greeting
      // it replaces always woke.
      const sets = [pickLayerSet(assets, undefined, true), pickLayerSet(assets), pickLayerSet(assets)];
      const items = [];
      for (const layers of sets) {
        items.push({ layers: toLayerRefs(layers), imageBase64: await compose(layers) });
      }
      const r = await api.entranceWakeThree({ items });
      setWhispers([
        ENTRANCE_WHISPER_FIRST,
        entranceElementWhisper(dominantElement(sets[1])),
        ENTRANCE_WHISPER_THIRD,
      ]);
      setTrio(r.awakened);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The waking failed.");
    } finally { setBusy(null); }
  }

  if (trio) {
    return <EntranceCeremony trio={trio} whispers={whispers} onDone={() => { setTrio(null); onFinished(); }} />;
  }

  return (
    <section className="entrance-door" aria-label="The entrance — your first steps">
      <p className="eyebrow">The entrance</p>
      {status.step === "class" && (
        <>
          <h2>First — what manner of tender are you?</h2>
          <p className="class-choosing-law">You have to be a Tender to wake the Awoken — and you have to have a class. The choosing is part of becoming, and it stands here, at the door, before any waking. Every cast of the Written Light rolls a d20 and your class's gift against the working's level + 10; within your school the gift is <strong>+2</strong>, across the closed schools <strong>−3</strong>.</p>
          <div className="class-choosing-grid">
            {TENDER_CLASS_ORDER.map((id) => (
              <div key={id} className="class-card">
                <img src={TENDER_CLASSES[id].idle} alt="" />
                <h3>{TENDER_CLASSES[id].icon} The {TENDER_CLASSES[id].label}</h3>
                <p className="class-school">{CLASS_LAW_SHORT[id]}</p>
                <button type="button" className="abtn gold" disabled={!!busy} onClick={() => void chooseClass(id)}>{busy === id ? "Choosing…" : "Choose the " + TENDER_CLASSES[id].label}</button>
              </div>
            ))}
          </div>
        </>
      )}
      {status.step === "spell" && (
        <>
          <h2>Now — choose your spell</h2>
          <p className="class-choosing-law">One working is yours from the start, castable the moment you step onto your land. The rest of the Grimoire opens as you grow — wards and runes wake at Tender Lv 3.</p>
          <div className="class-choosing-grid">
            {status.spellChoices.map((c) => (
              <div key={c.key} className="class-card">
                <h3>{c.name}</h3>
                <p className="class-school">{c.bookName}{c.cost != null ? ` · ${c.cost} energy` : ""}</p>
                <ul><li>{c.blurb}</li></ul>
                <button type="button" className="abtn gold" disabled={!!busy} onClick={() => void chooseSpell(c.key)}>{busy === "spell:" + c.key ? "Choosing…" : "Choose " + c.name}</button>
              </div>
            ))}
          </div>
        </>
      )}
      {status.step === "weapon" && (
        <>
          <h2>And your favourite weapon</h2>
          <p className="class-choosing-law">A runic weapon floats at your side <strong>like an Awokin of its own</strong> and lunges out swinging at whatever comes within its reach — no hand of yours upon it. It takes elemental attunement as an Awokin does.</p>
          <div className="class-choosing-grid">
            {WEAPON_ORDER.map((key) => (
              <div key={key} className="class-card">
                <img src={weaponImg(key)} alt="" />
                <h3>{WEAPONS[key].name}</h3>
                <p className="class-school">d{WEAPONS[key].die} · {WEAPONS[key].note}</p>
                <ul><li>{WEAPONS[key].blurb}</li></ul>
                <button type="button" className="abtn gold" disabled={!!busy} onClick={() => void chooseWeapon(key)}>{busy === "w:" + key ? "Choosing…" : "Take the " + WEAPONS[key].name}</button>
              </div>
            ))}
          </div>
        </>
      )}
      {status.step === "wake" && (
        <>
          <h2>The waking</h2>
          <p className="class-choosing-law">Class chosen, spell chosen, weapon named — you are a Tender now, and the matter is listening. Wake your first three, together.</p>
          <p className="entrance-award-note">Your welcome twenty are not spent here — they wait as your <strong>award pool: {status.awardPool} wakes</strong>, earned along the road ahead, five at a time as you learn the land. These three stand on top of them.</p>
          <button type="button" className="abtn gold" disabled={busy === "wake"} onClick={() => void wakeThree()}>{busy === "wake" ? "The matter gathers…" : "Wake the three"}</button>
        </>
      )}
      {error && <p className="class-choosing-error">{error}</p>}
    </section>
  );
}
