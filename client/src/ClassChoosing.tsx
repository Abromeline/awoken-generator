/**
 * THE CHOOSING (Nigel, 2026-10-19 — the Class Gate): the surface
 * where a Tender picks their class — presented once as a ceremony
 * when a classless Tender reaches Lv 3, and always waiting on the
 * character sheet behind the Choose Your Class button.
 *
 * The law, in plain words on every card: +2 within your school,
 * -3 across the closed schools, every cast rolled d20 + gift vs
 * the working's level + 10, a failed cast still spends its energy.
 * The first choosing is the calling; ONE free second-thoughts rite
 * may unmake it; after that only a reclass token from a workshop
 * hand opens the class again, consumed on use.
 */
import { useState } from "react";
import { api } from "./api";
import { TENDER_CLASSES, TENDER_CLASS_ORDER, type TenderClassId } from "./tenderArt";
import { WEAPONS, WEAPON_ORDER, weaponImg, type WeaponKey } from "./weaponArt";

const LAW: Record<TenderClassId, { school: string; lines: string[] }> = {
  warden: {
    school: "School: Ward",
    lines: [
      "+2 on ward casts and the blows they answer with.",
      "−3 on rune and binding workings.",
      "The held line: seals, engines, standards, trees and beacons stand taller in a Warden's hands.",
    ],
  },
  runewright: {
    school: "School: Rune",
    lines: [
      "+2 on rune casts and their springs and strikes.",
      "−3 on ward and binding workings.",
      "The written trap and the written rain: blades, coils, lattices and shard rain answer to the Runewright.",
    ],
  },
  binder: {
    school: "School: Binding",
    lines: [
      "+2 on binding casts — the Springleaf's grove is a binding working.",
      "−3 on ward and rune workings.",
      "The mending hand: wounds bound, spirits bound, the company's breath kept.",
    ],
  },
  witch: {
    school: "School: Spell",
    lines: [
      "+2 on spell casts.",
      "−3 on ward, rune and binding workings.",
      "Her pours lay twice what they cost: spells, runes and wards she powers deepen at twice the rate — the same points, twice the strength.",
      "The bog-light and the falling shard: raw spellcraft, feral and bright.",
    ],
  },
  sage: {
    school: "No school — the Sage's road is attunement",
    lines: [
      "−2 on EVERY cast, spells included. The Sage owns no school.",
      "Her own weapon blows roll +2 to hit.",
      "Her Attune lays 2 points deeper than her own pool pays for.",
      "Her company stands taller: her Awoken gain +2 AC and +2 attack.",
    ],
  },
};

export default function ClassChoosing({
  mode,
  progress,
  onClose,
  onChosen,
  onOpenTree,
}: {
  mode: "ceremony" | "sheet";
  progress: { level: number; classKey: string | null; classRiteAvailable: boolean; reclassTokens: number; weaponKey: string | null };
  onClose: () => void;
  onChosen: () => void;
  onOpenTree: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ classKey: TenderClassId; via: string } | null>(null);
  const [weaponDone, setWeaponDone] = useState<{ weaponKey: WeaponKey; via: string } | null>(null);
  const [repick, setRepick] = useState(false);
  const current = (progress.classKey as TenderClassId | null) ?? null;
  /** The weapon as it stands once this panel's own choosing lands
   *  (the host's refresh follows onChosen; the local word is
   *  instant). */
  const myWeapon = weaponDone?.weaponKey ?? ((progress.weaponKey as WeaponKey | null) ?? null);

  async function choose(id: TenderClassId) {
    setBusy(id); setError("");
    try {
      const r = await api.chooseClass({ classKey: id });
      setDone({ classKey: id, via: r.via });
      onChosen();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The choosing failed.");
    } finally { setBusy(null); }
  }

  async function chooseWeapon(key: WeaponKey) {
    setBusy("w:" + key); setError("");
    try {
      const r = await api.chooseWeapon({ weaponKey: key });
      setWeaponDone({ weaponKey: key, via: r.via });
      setRepick(false);
      onChosen();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The weapon would not come.");
    } finally { setBusy(null); }
  }

  function weaponButtonFor(key: WeaponKey, repickMode: boolean) {
    if (key === myWeapon) return <button className="abtn" disabled>Your weapon</button>;
    if (repickMode && progress.classRiteAvailable) return <button className="abtn gold" disabled={!!busy} onClick={() => void chooseWeapon(key)}>{busy === "w:" + key ? "Choosing…" : "Re-choose — your second-thoughts rite"}</button>;
    if (repickMode && progress.reclassTokens > 0) return <button className="abtn gold" disabled={!!busy} onClick={() => void chooseWeapon(key)}>{busy === "w:" + key ? "Choosing…" : `Re-choose — spends a reclass token (you hold ${progress.reclassTokens})`}</button>;
    return <button className="abtn gold" disabled={!!busy} onClick={() => void chooseWeapon(key)}>{busy === "w:" + key ? "Choosing…" : "Take the " + WEAPONS[key].name}</button>;
  }

  /** THE SECOND GIFT (Nigel, 2026-10-19): the runic weapon,
   *  named straight after the class — or re-named under the same
   *  rite and token law that governs the class itself. */
  function weaponStep(repickMode: boolean) {
    return (
      <>
        <p className="eyebrow">{repickMode ? "The second gift, re-named" : mode === "ceremony" ? "Level 3 — the choosing" : "The character sheet"}</p>
        <h2>{repickMode ? "Re-name your runic weapon" : "The choosing's second gift — name your runic weapon"}</h2>
        <p className="class-choosing-law">
          A runic weapon floats at your side <strong>like an Awokin of its own</strong> and lunges out swinging at whatever
          comes within its reach — no hand of yours upon it. It takes elemental attunement as an Awokin does.
          {repickMode && progress.classRiteAvailable && " Your second-thoughts rite can unmake this naming, once — it is the same rite that guards your class."}
          {repickMode && !progress.classRiteAvailable && progress.reclassTokens > 0 && ` A reclass token from the workshop can unmake it — you hold ${progress.reclassTokens}.`}
        </p>
        <div className="class-choosing-grid">
          {WEAPON_ORDER.map((key) => (
            <div key={key} className={`class-card${key === myWeapon ? " current" : ""}`}>
              <img src={weaponImg(key)} alt="" />
              <h3>{WEAPONS[key].name}</h3>
              <p className="class-school">d{WEAPONS[key].die} · {WEAPONS[key].note}</p>
              <ul><li>{WEAPONS[key].blurb}</li></ul>
              {weaponButtonFor(key, repickMode)}
            </div>
          ))}
        </div>
        {error && <p className="class-choosing-error">{error}</p>}
        {repickMode
          ? <p className="quiet"><button type="button" className="quiet-link" onClick={() => setRepick(false)}>Keep your {myWeapon ? WEAPONS[myWeapon].name : "weapon"}</button></p>
          : <p className="quiet">Until you name one, your hand stays empty — the door does not nag; it waits on your character sheet.</p>}
      </>
    );
  }

  function buttonFor(id: TenderClassId) {
    if (id === current) return <button className="abtn" disabled>Your class</button>;
    if (!current) return <button className="abtn gold" disabled={!!busy} onClick={() => void choose(id)}>{busy === id ? "Choosing…" : "Choose the " + TENDER_CLASSES[id].label}</button>;
    if (progress.classRiteAvailable) return <button className="abtn gold" disabled={!!busy} onClick={() => void choose(id)}>{busy === id ? "Choosing…" : "Re-choose — your second-thoughts rite"}</button>;
    if (progress.reclassTokens > 0) return <button className="abtn gold" disabled={!!busy} onClick={() => void choose(id)}>{busy === id ? "Choosing…" : `Re-choose — spends a reclass token (you hold ${progress.reclassTokens})`}</button>;
    return <button className="abtn" disabled title="Sealed — only a reclass token from the workshop unseals it">Sealed</button>;
  }

  return (
    <div className="class-choosing" role="dialog" aria-label="Choose your class">
      <div className="class-choosing-card">
        <button type="button" className="class-choosing-close" onClick={onClose} aria-label="Close">×</button>
        {done && !myWeapon ? weaponStep(false) : done ? (
          <>
            <p className="eyebrow">The Written Light</p>
            <h2>You are the {TENDER_CLASSES[done.classKey].label}</h2>
            <p>Chosen by {done.via}. Your figure now walks the world in this shape — and the Table will seat you.</p>
            {myWeapon && <p>Your runic weapon wakes with you: <strong>{WEAPONS[myWeapon].name}</strong> (d{WEAPONS[myWeapon].die} · {WEAPONS[myWeapon].note}){weaponDone ? <>, named by {weaponDone.via}</> : null} — it floats at your side like an Awokin and lunges at what comes within reach.</p>}
            <p><strong>Your skill tree awaits.</strong> Five points come with every level — at Lv {progress.level} you already hold {(progress.level - 1) * 5} banked. The tree is every tender's to walk; your school's road runs through it.</p>
            <div className="class-choosing-row">
              <button type="button" className="abtn gold" onClick={onOpenTree}>Open the skill tree</button>
              <button type="button" className="abtn" onClick={onClose}>Walk on</button>
            </div>
          </>
        ) : current && (!myWeapon || repick) ? weaponStep(repick) : (
          <>
            <p className="eyebrow">{mode === "ceremony" ? "Level 3 — the choosing" : "The character sheet"}</p>
            <h2>{current ? "Your class" : "What manner of tender are you?"}</h2>
            <p className="class-choosing-law">
              Every cast of the Written Light rolls a d20 and your class's gift against the working's level + 10.
              Within your school the gift is <strong>+2</strong>; across the closed schools it is <strong>−3</strong>.
              A cast that unravels still spends its energy.
              {current && progress.classRiteAvailable && " You hold one free second-thoughts rite — it can unmake this choosing, once."}
              {current && !progress.classRiteAvailable && progress.reclassTokens === 0 && " Your class is sealed; only a reclass token, sent by a workshop hand, can unmake it."}
              {current && progress.reclassTokens > 0 && ` You hold ${progress.reclassTokens} reclass token${progress.reclassTokens > 1 ? "s" : ""} from the workshop.`}
            </p>
            {current && myWeapon && (
              <p className="class-choosing-law">
                Your runic weapon: <strong>{WEAPONS[myWeapon].name}</strong> — d{WEAPONS[myWeapon].die} · {WEAPONS[myWeapon].note}.
                It floats at your side like an Awokin and lunges at what comes within reach.
                Day-to-day wielding no longer lives on this sheet: take any weapon in hand from the character menu — open the Skill Zodiac and use its Grimoire → Weapons tree.
              </p>
            )}
            <div className="class-choosing-grid">
              {TENDER_CLASS_ORDER.map((id) => (
                <div key={id} className={`class-card${id === current ? " current" : ""}`}>
                  <img src={TENDER_CLASSES[id].idle} alt="" />
                  <h3>{TENDER_CLASSES[id].icon} The {TENDER_CLASSES[id].label}</h3>
                  <p className="class-school">{LAW[id].school}</p>
                  <ul>{LAW[id].lines.map((l) => <li key={l}>{l}</li>)}</ul>
                  {buttonFor(id)}
                </div>
              ))}
            </div>
            {error && <p className="class-choosing-error">{error}</p>}
            <p className="quiet">Until you choose, your avatar shows nowhere and the Table will not seat you. {mode === "ceremony" && "You may close this and choose later from your character sheet — the door does not nag."}</p>
          </>
        )}
      </div>
    </div>
  );
}
