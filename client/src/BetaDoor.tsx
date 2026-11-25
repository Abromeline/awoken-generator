import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/** THE AWOKIN BETA (Nigel, ruled 2026-11-25): a small link under the
 *  art shop button on the Tender's home screen. Before the buy-in it
 *  opens the purchase panel — the price and his disclaimer; after
 *  the buy-in (recorded on the Tender's own account by the Stripe
 *  webhook) the same link plays the game instead of selling it.
 *  The disclaimer below is Nigel's own substance, worded by the
 *  Keeper and shown to him before this shipped. */
const DISCLAIMER =
  "Awokin is unfinished — a beta, still being built. Buying in is a vote: " +
  "it says you'd like to see this world developed further, and every dollar " +
  "goes toward that. It is not a promise. Development takes a great deal, " +
  "and the project may slow or stop; if it does, what you have is the game " +
  "as it stands. Buy it because you want what it already is, and because " +
  "you want to cast a vote for what it could become.";

type BetaStatus = { owned: boolean; priceCents: number; priceLabel: string };

export function BetaDoor() {
  const [status, setStatus] = useState<BetaStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const back = params.get("beta");
    if (back) {
      params.delete("beta");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
    let tries = 0;
    const fetchStatus = (): void => {
      api.betaStatus()
        .then((s) => {
          setStatus(s);
          if (back === "welcome" && !s.owned && tries < 6) {
            tries += 1;
            setNote("Your buy-in is being recorded…");
            window.setTimeout(fetchStatus, 1500);
          } else if (back === "welcome") {
            setNote(s.owned
              ? "You're in. This link now plays the game."
              : "Your payment is in — the door opens within a minute or two. Refresh if it hasn't.");
          }
        })
        .catch(() => setHidden(true));
    };
    if (back === "cancelled") setNote("Buy-in set aside — the door is here whenever you're ready.");
    fetchStatus();
  }, []);

  if (hidden || !status) return null;

  const openDoor = (): void => {
    if (!status.owned) { setPanel(true); return; }
    setBusy(true);
    setError("");
    api.betaEnter()
      .then((r) => { window.location.href = r.url; })
      .catch((e) => {
        setBusy(false);
        setNote(e instanceof Error ? e.message : "The play door did not open.");
      });
  };

  const buy = (): void => {
    setBusy(true);
    setError("");
    api.createBetaCheckout()
      .then((r) => { window.location.href = r.url; })
      .catch((e) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : "Checkout could not begin.");
      });
  };

  return (
    <>
      <button type="button" className="beta-door-link" onClick={openDoor} disabled={busy}>
        {status.owned ? "Play the Awokin Beta" : "Awokin Beta"}
      </button>
      {note && (
        <div className="beta-note" role="status">
          <span>{note}</span>
          {status.owned && (
            <a href="/get/awokin-windows.zip">Download for Windows</a>
          )}
          <button type="button" onClick={() => setNote("")} aria-label="Dismiss">✕</button>
        </div>
      )}
      {panel && !status.owned && (
        <div className="aspect-picker" role="dialog" aria-label="Awokin Beta — buy in">
          <div className="aspect-picker-card beta-card">
            <h3>Awokin Beta</h3>
            <p>Buy into the tournament — {status.priceLabel}, once. Your buy-in hangs on your Tender account, and this link turns from the buying door into the playing door: the game in your browser, and the Windows download besides.</p>
            <p>{DISCLAIMER}</p>
            {error && <p className="beta-error" role="alert">{error}</p>}
            <div className="beta-actions">
              <button type="button" className="abtn" onClick={buy} disabled={busy}>
                Buy in — {status.priceLabel}
              </button>
              <button type="button" className="quiet-link" onClick={() => setPanel(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
