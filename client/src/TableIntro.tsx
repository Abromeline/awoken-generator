/**
 * THE DISCORD DOOR — THE ENTRANCE, AT THE TABLE
 * (ENTRANCE BUILD 3, 2026-11-02; Nigel's rulings of
 * 2026-11-01: "the same entrance applies on the homeland and
 * in Discord").
 *
 * A visitor Discord has already vouched for becomes a REAL
 * Tender without leaving the Table — or binds the Tender she
 * already holds — and a NEW Tender now walks THE ENTRANCE
 * here, in the same order as the homeland door (EntranceDoor
 * on the front page): account name + password BEFORE anything
 * → choose class → choose spell (Bats, Shard Rain, or Rune
 * Hold — the door's three) → choose favourite weapon →
 * three Awoken wake at once → the first three stand as her
 * party, and she is seated. The three stand ON TOP of the
 * original twenty: the claim lays no spendable credits — the
 * twenty wait as the account's AWARD POOL, paid out by the
 * homeland road (Build 2), and none of them gates this seat.
 *
 * The walk rides the door's own server machinery, shared with
 * the homeland face-for-face: claimTender with the entrance
 * ask (the mark is laid at claim time, only for a claim with
 * no welcomed past — tenders.ts), entranceChooseClass,
 * entranceChooseSpell, the standing chooseWeapon under the
 * door's order guard, and entranceWakeThree — the first of
 * the three carrying the greeter mark, because the greeter
 * folds into the three. The binding is made on BOTH proofs —
 * the Discord seat token and the fresh Tender session token —
 * at the server's intro road (/api/table/bind-intro), which
 * never moves an existing binding. Passwords travel only to
 * the Awokin server over the game's own channel.
 *
 * ONE ACCOUNT, ONE DOOR: an account the homeland door has
 * already marked is met HERE at whatever step it stands on
 * (getEntranceStatus routes the walk), and an account that
 * walks the door here reads "done" on the homeland — neither
 * face ever wakes a second trio or lays a second grant.
 * Invite arrivals walk this same component (RoomSeat), so
 * they walk the same door.
 *
 * THE OLD ROAD STANDS for accounts without the mark —
 * a sign-in whose Tender predates the entrance, or a claim
 * the server did not mark (a browser carrying an
 * already-welcomed soft visitor keeps its old road whole):
 * wake three, then the choosing (the real ClassChoosing
 * surface), exactly as this door walked before Build 3.
 * Legacy accounts are never offered the door's steps.
 *
 * THE CEREMONY IS MIRRORED, NOT IMPORTED: the homeland's
 * EntranceCeremony renders the TradingCard, which lives in
 * the front page's App — importing it would drag the whole
 * homeland into this lazy chunk and break the door's
 * featherweight law. So the ceremony below mirrors its form
 * exactly — three cards at once on the one clock (forming →
 * burning at 2.6 s → done at 6.7 s), the four corners burning
 * in their elemental colours (body TL, arms TR, head BL,
 * pips BR, rippling across the row), each whisper landing as
 * its card settles, a tap hastening it — drawn in the Table's
 * own chrome over the ceremony's own stylesheet (theme.css
 * rides this page since Push 50). The whisper texts are the
 * door's drafts, mirrored word-for-word from EntranceDoor.tsx
 * (Nigel's polish, when it comes, must touch both faces —
 * they are named as twins below).
 *
 * THE PLAIN CEREMONY (Nigel's ruling, 2026-11-02): the
 * waking is THE STANDING WAKE CEREMONY with three cards
 * instead of one — the cards, their corner burns, and each
 * card's own whisper, and NO text of its own around them.
 * The heading, the eyebrow and the "BOOM" line the first
 * build dressed the ceremony in are struck, here and at
 * the wake step before it: the step stands as its button
 * alone, as a waking is spoken everywhere else in the
 * game. The choosing steps keep their words whole — Nigel
 * named the wake.
 *
 * This module is loaded lazily by Table.tsx, only when an
 * unbound visitor takes one of the intro offers — the
 * featherweight front page (table-main.ts) never carries it.
 * (RoomSeat imports it directly for the room doors, where the
 * homeland face is already loading.)
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { api, storeTenderToken, type Awakened, type EntranceStatus } from "./api";
import { canWake, compose, pickLayerSet, toLayerAssets, toLayerRefs, type WakeLayerAsset } from "./wakeShared";
import ClassChoosing from "./ClassChoosing";
import { TENDER_CLASSES, TENDER_CLASS_ORDER, type TenderClassId } from "./tenderArt";
import { WEAPONS, WEAPON_ORDER, weaponImg, type WeaponKey } from "./weaponArt";
import { ElementGlyph, type GlyphElement } from "./glyphs";
import { elementPalette } from "./palette";
import birthFrame from "./assets/birth-frame.png";

type Phase = "form" | "door" | "ceremony" | "wakes" | "choosing" | "paused" | "finishing";
type Progress = {
  level: number; classKey: string | null; classRiteAvailable: boolean;
  reclassTokens: number; weaponKey: string | null; awokenCount: number;
};

const WAKE_WORDS = ["first", "second", "third"];

/* THE DOOR'S WHISPERS — mirrored word-for-word from
 * EntranceDoor.tsx (the homeland face), where they stand as
 * drafts for Nigel's polish: each of the three whispers a
 * TUTORIAL line as it wakes — the companions teach. The first
 * tells what an Awoken is; the second speaks its own element
 * in plain words; the third turns the player's eyes to the
 * beacon. If the words are polished, polish BOTH faces. */
const DOOR_WHISPER_FIRST = "I am an Awokin — scattered matter, held together by your attention. Keep looking at me, and I hold.";
const DOOR_WHISPER_THIRD = "Now look to your land. A starseed waits there — light its beacon, and we three will stand beside you.";
function doorElementWhisper(element: string | null | undefined): string {
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
 *  greatest among its picked pieces, by power (the homeland
 *  door's own reading, mirrored). */
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

/** A part's element comes from the part's own record — never
 *  from its name (the law of 2026-10-15, mirrored from the
 *  homeland's elementForPiece). No recorded element: neutral,
 *  and no corner burns for it. */
function elementOfPiece(dbElement?: string | null): GlyphElement | null {
  if (dbElement && ["tide", "sky", "stone", "root", "fire"].includes(dbElement)) return dbElement as GlyphElement;
  return null;
}

const CLASS_LAW_SHORT: Record<TenderClassId, string> = {
  warden: "School: Ward — +2 on ward casts, −3 across the closed schools.",
  runewright: "School: Rune — +2 on rune casts, −3 across the closed schools.",
  binder: "School: Binding — +2 on binding casts, −3 across the closed schools.",
  witch: "School: Spell — +2 on spell casts; her attunement pours lay twice what they cost.",
  sage: "No school — −2 on every cast, but her Attune lays deeper and her company stands taller.",
};

/**
 * THE THREE-CARD CEREMONY, MIRRORED (see the header): the
 * standing wake ceremony with three cards instead of one —
 * three cards at once, on the homeland ceremony's own clock
 * and in its own stylesheet — the stage, the rails, the
 * four corner burns in their elemental colours rippling
 * across the row, the birth frame — with the woken one's
 * own image standing as the card's art, its name beneath,
 * and its whisper landing as the card settles. No heading
 * and no text of its own stands around the cards (the
 * plain ceremony, Nigel's ruling of 2026-11-02). Tapping
 * a card hastens the ceremony to done, as the single
 * card's does.
 *
 * THE BOX IS GONE (Nigel's ruling of 2026-11-03, spoken on
 * the homeland ceremony: "remove the extra box that the
 * cards are poping in but keep the cars [cards]"): the
 * mirrored ceremony at first seated the trio inside a
 * panel (.entrance-ceremony-card) the standing ceremony
 * never had. The cards now present directly on the dim,
 * as the single card presents on its own layer — the
 * overlay only stacks and centres them (the .intro-
 * ceremony rule beside the box's definition in theme.css),
 * with "Gather your party" beneath them.
 */
function IntroCeremony({ trio, whispers, onDone }: {
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
  // as the homeland ceremony reads them: top-left the body's
  // element, top-right the arms', bottom-left the head's —
  // from the part's recorded element, never its name.
  const burnFor = (item: Awakened, category: string) => {
    const layer = item.layers.find((l) => l.category === category);
    if (!layer) return null;
    return elementOfPiece((layer as unknown as { element?: string | null }).element);
  };
  return (
    <div className="entrance-ceremony intro-ceremony" role="dialog" aria-label="Three Awoken wake">
      <div className="entrance-trio">
        {trio.map((item, i) => {
          const burnBody = burnFor(item, "body");
          const burnArms = burnFor(item, "arms");
          const burnHead = burnFor(item, "head");
          // The trio burns on one clock; each card's corners
          // kindle a breath after the card before it.
          const stagger = i * 0.35;
          const delay = (base: number) => `${(base + stagger).toFixed(3)}s`;
          const colorOf = (el: GlyphElement) => elementPalette[el];
          return (
            <figure key={item.id} className="entrance-trio-one">
              <div className="ceremony-card-wrap ceremony-card-form">
                <div className="ceremony-card-stage" data-phase={phase} onClick={() => { if (phase !== "done") setPhase("done"); }}>
                  <img className="intro-ceremony-art" src={item.image_url} alt={item.name} />
                  {burnBody && (<span className="ceremony-burn burn-tl" style={{ "--elem": colorOf(burnBody), "--burn-delay": delay(0) } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnBody} color={colorOf(burnBody)} dotColor={colorOf(burnBody)} width={54} height={22} /></span>)}
                  {burnArms && (<span className="ceremony-burn burn-tr" style={{ "--elem": colorOf(burnArms), "--burn-delay": delay(1.025) } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnArms} color={colorOf(burnArms)} dotColor={colorOf(burnArms)} width={54} height={22} /></span>)}
                  {burnHead && (<span className="ceremony-burn burn-bl" style={{ "--elem": colorOf(burnHead), "--burn-delay": delay(2.05) } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnHead} color={colorOf(burnHead)} dotColor={colorOf(burnHead)} width={54} height={22} /></span>)}
                  <span className="ceremony-burn burn-br ceremony-burn-pt" style={{ "--elem": "#d98a4a", "--burn-delay": delay(3.075) } as CSSProperties} aria-hidden="true">{item.power}/{item.toughness}</span>
                  <img className="birth-frame" src={birthFrame} alt="" aria-hidden="true" />
                </div>
              </div>
              <figcaption className="intro-ceremony-name">
                {item.name}
                {i === 0 ? <span className="intro-guide"> · your guide</span> : null}
              </figcaption>
              {phase === "done" && <figcaption className="entrance-whisper">“{whispers[i]}”</figcaption>}
            </figure>
          );
        })}
      </div>
      {phase === "done" && (
        <div className="door-actions">
          <button type="button" className="table-btn primary" onClick={onDone}>Gather your party</button>
        </div>
      )}
    </div>
  );
}

export default function TableIntro({
  authToken,
  initialMode,
  onComplete,
  onCancel,
}: {
  authToken: string;
  initialMode: "begin" | "login";
  onComplete: (tenderName: string, entrance?: boolean) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"begin" | "login">(initialMode);
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The claim / login forms' own fields — the claim form's fields,
  // exactly as the game's gate asks them.
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");

  const [tenderName, setTenderName] = useState("");
  const tenderNameRef = useRef("");
  const [assets, setAssets] = useState<WakeLayerAsset[]>([]);
  const [woken, setWoken] = useState<Awakened[]>([]);
  const [greeterId, setGreeterId] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const finishStartedRef = useRef(false);

  // THE DOOR's walk (Build 3): the entrance standing as the
  // server reads it, the woken trio, and whether THIS walk is
  // the entrance's — told back at the finish so the door's
  // bound words speak the pool or the welcome wakes, truly.
  const [doorStatus, setDoorStatus] = useState<EntranceStatus | null>(null);
  const [trio, setTrio] = useState<Awakened[] | null>(null);
  const [whispers, setWhispers] = useState<string[]>([]);
  const walkedEntranceRef = useRef(false);

  function fail(e: unknown, fallback: string) {
    setError(e instanceof Error ? e.message : fallback);
  }

  /** The automatic bind: BOTH proofs or nothing — the Discord
   *  seat token from the door, and the Tender session token the
   *  claim/login just minted. The server's refusal words ride
   *  back unchanged. */
  async function bindIntro(tenderToken: string): Promise<void> {
    const res = await fetch("/api/table/bind-intro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: authToken, tenderToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The binding did not take.");
  }

  /** After the bind, THE ROUTING — one account, one door:
   *  the server's entrance reading decides the walk. A marked
   *  account stands at the door (at whatever step it has
   *  reached, on whichever face it began) or, the door done,
   *  goes straight to the finish; an unmarked account walks
   *  the old road below, whole. */
  async function routeAfterBind() {
    const status = await api.getEntranceStatus().catch(() => null);
    if (status?.entrance) {
      walkedEntranceRef.current = true;
      setDoorStatus(status);
      await loadWakeState().catch(() => { /* the wake step retries the gathering */ });
      if (status.step === "done") {
        const exp = await api.getTenderExp();
        setProgress(exp);
        setPhase("finishing");
        return;
      }
      setPhase("door");
      return;
    }
    await enterBeginning();
  }

  /** The old road's routing: walk whatever of the beginning
   *  still stands unwalked — wakes to three, then the
   *  choosing — or finish. (Unmarked accounts only; the
   *  door's accounts never reach this.) */
  async function enterBeginning() {
    const exp = await api.getTenderExp();
    setProgress(exp);
    if (exp.awokenCount >= 3 && exp.classKey && exp.weaponKey) { setPhase("finishing"); return; }
    if (exp.awokenCount < 3) {
      await loadWakeState();
      setPhase("wakes");
      return;
    }
    setPhase("choosing");
  }

  async function loadWakeState() {
    const [studio, welcome] = await Promise.all([api.getStudio(), api.getWelcome()]);
    setAssets(toLayerAssets(studio.assets));
    setWoken(studio.awakened);
    setGreeterId(welcome.greeterId);
    return { studio, welcome };
  }

  /** The bind, told truly (FLOP fix, 2026-10-26): the claim or
   *  the sign-in has ALREADY made the Tender and signed her in
   *  on this device by the time the binding is asked. If the
   *  door refuses it, the words say exactly that — she stands
   *  created and signed in — and give the refusal's own reason;
   *  the walk does not begin (the seat waits on the binding),
   *  and nothing reads as a bare failure. Returns true when the
   *  binding took. */
  async function bindOrExplain(tenderToken: string, display: string, created: boolean): Promise<boolean> {
    try {
      await bindIntro(tenderToken);
      return true;
    } catch (err) {
      const why = err instanceof Error ? err.message : "The binding did not take.";
      setError(created
        ? `${display} is created, and you are signed in as her on this device. The binding did not take: ${why}`
        : `You are signed in as ${display} on this device. The binding did not take: ${why}`);
      return false;
    }
  }

  async function submitBegin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true);
    try {
      // THE ENTRANCE ASK (Build 3): a new claim at this door
      // asks for the door, exactly as the homeland gate's claim
      // does — the server lays the mark when the claim carries
      // no welcomed past, and keeps the old road whole when it
      // does; routeAfterBind reads the server's truth either
      // way, never the ask.
      const res = await api.claimTender({
        tenderName: name.trim(),
        password,
        entrance: true,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      storeTenderToken(res.token);
      const display = res.tender.tenderName ?? name.trim();
      tenderNameRef.current = display;
      setTenderName(display);
      if (!(await bindOrExplain(res.token, display, true))) return;
      await routeAfterBind();
    } catch (err) {
      fail(err, "The beginning could not be made.");
    } finally { setBusy(false); }
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.loginTender({ identity: identity.trim(), password });
      storeTenderToken(res.token);
      const display = res.tender.tenderName ?? identity.trim();
      tenderNameRef.current = display;
      setTenderName(display);
      if (!(await bindOrExplain(res.token, display, false))) return;
      await routeAfterBind();
    } catch (err) {
      fail(err, "That sign-in could not be made.");
    } finally { setBusy(false); }
  }

  /* ── THE DOOR's steps (Build 3) — the homeland door's own
   *  actions, in this door's chrome. Each step re-reads the
   *  entrance standing, so the face always stands where the
   *  server stands. ─────────────────────────────────────── */

  async function refreshDoor() {
    const status = await api.getEntranceStatus();
    setDoorStatus(status);
    return status;
  }

  async function doorChooseClass(id: TenderClassId) {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.entranceChooseClass({ classKey: id }); await refreshDoor(); }
    catch (err) { fail(err, "The choosing failed."); }
    finally { setBusy(false); }
  }

  async function doorChooseSpell(key: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.entranceChooseSpell({ spellKey: key }); await refreshDoor(); }
    catch (err) { fail(err, "The spell would not come."); }
    finally { setBusy(false); }
  }

  async function doorChooseWeapon(key: WeaponKey) {
    if (busy) return;
    setBusy(true); setError("");
    try { await api.chooseWeapon({ weaponKey: key }); await refreshDoor(); }
    catch (err) { fail(err, "The weapon would not come."); }
    finally { setBusy(false); }
  }

  /** THE DOOR'S WAKING: three forms gathered together by the
   *  shared wake hands — the first with the firstborn
   *  weighting, as the greeting it replaces always woke — and
   *  sent to the door's one waking action. Free, as at home:
   *  no credit spent, no wake XP; the first carries the
   *  greeter mark on the server's side of the call. */
  async function doorWakeThree() {
    if (busy) return;
    setError("");
    let pool = assets;
    if (!canWake(pool)) {
      try {
        const s = await api.getStudio();
        pool = toLayerAssets(s.assets);
        setAssets(pool);
      } catch { /* the words below name the wait */ }
    }
    if (!canWake(pool)) { setError("The workshop's matter has not arrived yet — the waking gathers in a moment."); return; }
    setBusy(true);
    try {
      const sets = [pickLayerSet(pool, undefined, true), pickLayerSet(pool), pickLayerSet(pool)];
      const items = [];
      for (const layers of sets) {
        items.push({ layers: toLayerRefs(layers), imageBase64: await compose(layers) });
      }
      const r = await api.entranceWakeThree({ items });
      setWhispers([
        DOOR_WHISPER_FIRST,
        doorElementWhisper(dominantElement(sets[1])),
        DOOR_WHISPER_THIRD,
      ]);
      setTrio(r.awakened);
      await refreshDoor();
      setPhase("ceremony");
    } catch (err) {
      fail(err, "The waking failed.");
    } finally { setBusy(false); }
  }

  /** One wake, by the front page's own hands: the greeting first
   *  (seedWelcome, the firstborn weighting, the greeter law),
   *  then saveAwoken against the welcome grant — the same
   *  endpoints, the same shared composition. The seed road is
   *  keyed on the greeter law itself — nothing woken yet in
   *  this walk AND no greeter standing (FLOP fix, 2026-10-26):
   *  the welcome status can arrive needsSeed=false with an
   *  empty deck (a welcome once claimed by a greeting since
   *  deleted), and the first wake is still the greeting's,
   *  carrying the firstborn weighting and spending no plain
   *  credit — the server's seedWelcome owes the seed in
   *  exactly that state. (THE OLD ROAD — unmarked accounts.) */
  async function wakeNext() {
    if (busy) return;
    setError("");
    if (!canWake(assets)) { setError("The workshop's matter has not arrived yet — the first pieces are still gathering."); return; }
    setBusy(true);
    try {
      if (woken.length === 0 && greeterId == null) {
        const layers = pickLayerSet(assets, undefined, true);
        await api.seedWelcome({ layers: toLayerRefs(layers), imageBase64: await compose(layers) });
      } else {
        const layers = pickLayerSet(assets);
        await api.saveAwoken({
          layers: toLayerRefs(layers),
          imageBase64: await compose(layers),
          collection: "tender",
          ownerName: tenderNameRef.current || tenderName || "Tender",
        });
      }
      const { studio } = await loadWakeState();
      if (studio.awakened.length >= 3) {
        const exp = await api.getTenderExp();
        setProgress(exp);
        setPhase(exp.classKey && exp.weaponKey ? "finishing" : "choosing");
      }
    } catch (err) {
      fail(err, "That awakening could not be gathered.");
    } finally { setBusy(false); }
  }

  async function refreshProgress() {
    try {
      const exp = await api.getTenderExp();
      setProgress(exp);
      if (exp.awokenCount >= 3 && exp.classKey && exp.weaponKey) setPhase("finishing");
    } catch { /* the choosing surface shows its own errors */ }
  }

  /** The finish: the first three stand as her party for the
   *  Table's company — entered through the party's own door
   *  (addToParty), and only while her party stands empty, so a
   *  party she made herself is never touched. Then the door
   *  returns to its room choice, bound. */
  async function finalize() {
    try {
      const party = await api.getParty();
      if (party.members.length === 0) {
        const studio = await api.getStudio();
        const firstThree = [...studio.awakened].sort((a, b) => a.id - b.id).slice(0, 3);
        for (const kin of firstThree) await api.addToParty({ awakenedId: kin.id });
      }
      onComplete(tenderNameRef.current || tenderName, walkedEntranceRef.current);
    } catch (err) {
      finishStartedRef.current = false;
      fail(err, "Your party could not be gathered — try the finish again.");
    }
  }

  useEffect(() => {
    if (phase !== "finishing" || finishStartedRef.current) return;
    finishStartedRef.current = true;
    void finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "ceremony" && trio) {
    return (
      <IntroCeremony
        trio={trio}
        whispers={whispers}
        onDone={() => { setTrio(null); setPhase("finishing"); }}
      />
    );
  }

  if (phase === "door") {
    if (!doorStatus) return <div className="table-intro"><p className="quiet">The entrance is gathering…</p></div>;
    const step = doorStatus.step;
    return (
      <div className="table-intro">
        <p className="eyebrow">The entrance</p>
        {step === "class" && (
          <>
            <h2>First — what manner of tender are you?</h2>
            <p>
              Bound as <strong>{tenderName}</strong>. You have to be a Tender to wake the
              Awoken — and you have to have a class. The choosing is part of becoming, and it
              stands here, at the door, before any waking.
            </p>
            <div className="intro-choices">
              {TENDER_CLASS_ORDER.map((id) => (
                <div key={id} className="intro-choice">
                  <img src={TENDER_CLASSES[id].idle} alt="" />
                  <h3>{TENDER_CLASSES[id].icon} The {TENDER_CLASSES[id].label}</h3>
                  <p className="quiet small">{CLASS_LAW_SHORT[id]}</p>
                  <button type="button" className="table-btn primary" disabled={busy} onClick={() => void doorChooseClass(id)}>
                    {busy ? "Choosing…" : "Choose the " + TENDER_CLASSES[id].label}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {step === "spell" && (
          <>
            <h2>Now — choose your spell</h2>
            <p>
              One working is yours from the start, castable the moment you step onto your
              land — at this Table too. The rest of the Grimoire opens as you grow: wards
              and runes wake at Tender Lv 3.
            </p>
            <div className="intro-choices">
              {doorStatus.spellChoices.map((c) => (
                <div key={c.key} className="intro-choice">
                  <h3>{c.name}</h3>
                  <p className="quiet small">{c.bookName}{c.cost != null ? ` · ${c.cost} energy` : ""}</p>
                  <p className="quiet small">{c.blurb}</p>
                  <button type="button" className="table-btn primary" disabled={busy} onClick={() => void doorChooseSpell(c.key)}>
                    {busy ? "Choosing…" : "Choose " + c.name}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {step === "weapon" && (
          <>
            <h2>And your favourite weapon</h2>
            <p>
              A runic weapon floats at your side <strong>like an Awokin of its own</strong> and
              lunges out swinging at whatever comes within its reach. It takes elemental
              attunement as an Awokin does.
            </p>
            <div className="intro-choices">
              {WEAPON_ORDER.map((key) => (
                <div key={key} className="intro-choice">
                  <img src={weaponImg(key)} alt="" />
                  <h3>{WEAPONS[key].name}</h3>
                  <p className="quiet small">d{WEAPONS[key].die} · {WEAPONS[key].note}</p>
                  <p className="quiet small">{WEAPONS[key].blurb}</p>
                  <button type="button" className="table-btn primary" disabled={busy} onClick={() => void doorChooseWeapon(key)}>
                    {busy ? "Choosing…" : "Take the " + WEAPONS[key].name}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {step === "wake" && (
          <>
            <div className="door-actions">
              <button type="button" className="table-btn primary" disabled={busy} onClick={() => void doorWakeThree()}>
                {busy ? "The matter gathers…" : "Wake the three"}
              </button>
              <button className="table-btn ghost" type="button" onClick={onCancel}>Back to the door</button>
            </div>
          </>
        )}
        {error && <p className="error-line">{error}</p>}
        {step !== "wake" && step !== "done" && (
          <div className="door-actions">
            <button className="table-btn ghost" type="button" onClick={onCancel}>Back to the door</button>
          </div>
        )}
        {step === "done" && (
          <p className="quiet">Your three stand. <button type="button" className="quiet-link" onClick={() => setPhase("finishing")}>Gather your party</button></p>
        )}
      </div>
    );
  }

  if (phase === "wakes") {
    const nextWord = WAKE_WORDS[Math.min(woken.length, 2)];
    return (
      <div className="table-intro">
        <p className="eyebrow">The beginning — the waking</p>
        <h2>Wake your first three Awokin</h2>
        <p>
          Bound as <strong>{tenderName}</strong>. Your first Awokin is your greeting and your
          guide; wake three, and the choosing opens. Your welcome holds twenty wakes in all —
          the rest wait for you in the game, and none of them gates your seat here.
        </p>
        {woken.length > 0 && (
          <div className="intro-woken">
            {woken.map((kin) => (
              <figure key={kin.id} className="intro-kin">
                <img src={kin.image_url} alt={kin.name} />
                <figcaption>
                  {kin.name}
                  {greeterId === kin.id ? <span className="intro-guide"> · your guide</span> : null}
                  <span className="intro-kin-stats"> · {kin.power}/{kin.toughness}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="quiet">{woken.length} of three woken.</p>
        {error && <p className="error-line">{error}</p>}
        <div className="door-actions">
          <button className="table-btn primary" disabled={busy} onClick={() => void wakeNext()}>
            {busy ? "Waking…" : `Wake your ${nextWord} Awokin`}
          </button>
          <button className="table-btn ghost" type="button" onClick={onCancel}>Back to the door</button>
        </div>
      </div>
    );
  }

  if (phase === "choosing") {
    if (!progress) return <div className="table-intro"><p className="quiet">The choosing is gathering…</p></div>;
    return (
      <div className="table-intro intro-choosing">
        <ClassChoosing
          mode="ceremony"
          progress={progress}
          onClose={() => {
            if (progress.classKey && progress.weaponKey) setPhase("finishing");
            else setPhase("paused");
          }}
          onChosen={() => void refreshProgress()}
          onOpenTree={() => {
            if (progress.classKey && progress.weaponKey) setPhase("finishing");
            else setPhase("paused");
          }}
        />
        {error && <p className="error-line">{error}</p>}
      </div>
    );
  }

  if (phase === "paused") {
    return (
      <div className="table-intro">
        <p className="eyebrow">The beginning — the choosing waits</p>
        <h2>Your class and your runic weapon</h2>
        <p>
          You are bound as <strong>{tenderName}</strong>. The Table seats your real Tender
          once her class is chosen and her runic weapon named — the choosing can also be
          taken later from your character sheet in the game, but this door finishes it here.
        </p>
        {error && <p className="error-line">{error}</p>}
        <div className="door-actions">
          <button className="table-btn primary" onClick={() => setPhase("choosing")}>Return to the choosing</button>
          <button className="table-btn ghost" type="button" onClick={onCancel}>Back to the door</button>
        </div>
      </div>
    );
  }

  if (phase === "finishing") {
    return (
      <div className="table-intro">
        <p className="eyebrow">The beginning — the last step</p>
        <h2>Your first three gather as your party…</h2>
        {error && <p className="error-line">{error}</p>}
        {error && (
          <div className="door-actions">
            <button className="table-btn primary" onClick={() => { finishStartedRef.current = true; void finalize(); }}>
              Try the finish again
            </button>
          </div>
        )}
      </div>
    );
  }

  // phase === "form": the claim, or the sign-in — the game's own
  // fields and the game's own validation words ride unchanged.
  return (
    <div className="table-intro">
      {mode === "begin" ? (
        <form onSubmit={(e) => void submitBegin(e)}>
          <p className="eyebrow">Begin as a new Tender</p>
          <h2>Choose your name and a password</h2>
          <p className="quiet">
            The account comes before any waking — that is the settled order. Your password
            travels only to the Awokin server, never to Discord.
          </p>
          <label className="door-label" htmlFor="intro-name">Tender name</label>
          <input id="intro-name" className="door-input" value={name} onChange={(e) => setName(e.target.value)}
            maxLength={40} autoComplete="off" placeholder="e.g. Tender of the Quiet Moss" />
          <label className="door-label" htmlFor="intro-password">Password (at least 8 characters)</label>
          <input id="intro-password" className="door-input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} maxLength={128} autoComplete="new-password" />
          <label className="door-label" htmlFor="intro-confirm">Password, again</label>
          <input id="intro-confirm" className="door-input" type="password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} maxLength={128} autoComplete="new-password" />
          <label className="door-label" htmlFor="intro-email">Email (optional — for password recovery only)</label>
          <input id="intro-email" className="door-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" />
          {error && <p className="error-line">{error}</p>}
          <div className="door-actions">
            <button className="table-btn primary" type="submit" disabled={busy || !name.trim() || !password}>
              {busy ? "Beginning…" : "Begin as a Tender"}
            </button>
            <button className="table-btn ghost" type="button" onClick={onCancel}>Back to the door</button>
          </div>
          <p className="quiet small">
            Already hold a Tender?{" "}
            <button type="button" className="quiet-link" onClick={() => { setMode("login"); setError(""); }}>
              I already have a Tender
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={(e) => void submitLogin(e)}>
          <p className="eyebrow">I already have a Tender</p>
          <h2>Sign in, and this Discord name is bound</h2>
          <p className="quiet">
            Your Tender name (or secret key) and your password — proven here, bound to the
            Discord name Discord vouched for. The binding is made only on both proofs.
          </p>
          <label className="door-label" htmlFor="intro-identity">Tender name or secret key</label>
          <input id="intro-identity" className="door-input" value={identity} onChange={(e) => setIdentity(e.target.value)}
            maxLength={64} autoComplete="off" />
          <label className="door-label" htmlFor="intro-login-password">Password</label>
          <input id="intro-login-password" className="door-input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} maxLength={128} autoComplete="current-password" />
          {error && <p className="error-line">{error}</p>}
          <div className="door-actions">
            <button className="table-btn primary" type="submit" disabled={busy || !identity.trim() || !password}>
              {busy ? "Binding…" : "Bind my Tender and continue"}
            </button>
            <button className="table-btn ghost" type="button" onClick={onCancel}>Back to the door</button>
          </div>
          <p className="quiet small">
            New to the Awokin?{" "}
            <button type="button" className="quiet-link" onClick={() => { setMode("begin"); setError(""); }}>
              Begin as a new Tender
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
