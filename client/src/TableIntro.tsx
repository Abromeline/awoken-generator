/**
 * THE DISCORD INTRO DOOR (Nigel's word, 2026-10-26: "Build the
 * Discord intro door next"): a visitor Discord has already vouched
 * for becomes a REAL Tender without leaving the Table — or binds
 * the Tender she already holds — and walks the beginning in its
 * settled order (Nigel, 2026-10-23): account name + password BEFORE
 * waking any Awoken; wake; after THREE wakes, the class is chosen,
 * then the runic weapon is named.
 *
 * Every step rides the game's own machinery: claimTender and
 * loginTender for the account, the welcome/wake endpoints with the
 * SHARED composition helpers (wakeShared.ts — the very functions
 * the front page runs), and the real ClassChoosing surface for the
 * class and the weapon. The binding is made on BOTH proofs — the
 * Discord seat token and the fresh Tender session token — at the
 * server's intro road (/api/table/bind-intro), which never moves
 * an existing binding. Passwords travel only to the Awokin server
 * over the game's own channel, as every game call does.
 *
 * NOT HERE, BY LAW: the starting spell point's first-page unlock
 * rides the spellbook page ledger (Twelve #3 remainder) and does
 * not exist in code — this door has no spell step and pretends
 * none. The remaining welcome wakes are encouraged at the door,
 * never a gate on the seat.
 *
 * This module is loaded lazily by Table.tsx, only when an unbound
 * visitor takes one of the intro offers — the featherweight front
 * page (table-main.ts) never carries it.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, storeTenderToken, type Awakened } from "./api";
import { canWake, compose, pickLayerSet, toLayerAssets, toLayerRefs, type WakeLayerAsset } from "./wakeShared";
import ClassChoosing from "./ClassChoosing";

type Phase = "form" | "wakes" | "choosing" | "paused" | "finishing";
type Progress = {
  level: number; classKey: string | null; classRiteAvailable: boolean;
  reclassTokens: number; weaponKey: string | null; awokenCount: number;
};

const WAKE_WORDS = ["first", "second", "third"];

export default function TableIntro({
  authToken,
  initialMode,
  onComplete,
  onCancel,
}: {
  authToken: string;
  initialMode: "begin" | "login";
  onComplete: (tenderName: string) => void;
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

  /** After the bind: walk whatever of the beginning still stands
   *  unwalked — wakes to three, then the choosing — or finish. */
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
      const res = await api.claimTender({
        tenderName: name.trim(),
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      storeTenderToken(res.token);
      const display = res.tender.tenderName ?? name.trim();
      tenderNameRef.current = display;
      setTenderName(display);
      if (!(await bindOrExplain(res.token, display, true))) return;
      await enterBeginning();
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
      await enterBeginning();
    } catch (err) {
      fail(err, "That sign-in could not be made.");
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
   *  exactly that state. */
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
      onComplete(tenderNameRef.current || tenderName);
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
