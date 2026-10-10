import { useState, useEffect } from "react";
import { api, Awakened } from "./api";
import TwinBirth from "./TwinBirth";

export default function Confluence({
  hand,
  onClose,
}: {
  hand: Awakened[];
  onClose: () => void;
}) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [committed, setCommitted] = useState<number[]>([]);
  const [twin, setTwin] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const create = async () => {
    try {
      const res = await api.createConfluence();
      setSessionId(res.sessionId);
      setCode(res.code);
      setMsg("");
    } catch (e: any) {
      setMsg(e.message || "Couldn't create confluence.");
    }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    try {
      const res = await api.joinConfluence({ code: joinCode.trim() });
      setSessionId(res.sessionId);
      setMsg("");
    } catch (e: any) {
      setMsg(e.message || "Couldn't join.");
    }
  };

  const commit = async (awakenedId: number) => {
    if (!sessionId) return;
    try {
      await api.commitToConfluence({ sessionId, awakenedId });
      setCommitted(c => [...c, awakenedId]);
    } catch (e: any) {
      setMsg(e.message || "Couldn't commit.");
    }
  };

  // Simplified: the host resolves the battle after both have committed.
  // In a full implementation, this would be a shared battleground.
  const resolveBattle = async (victory: boolean) => {
    if (!sessionId) return;
    try {
      const res = await api.resolveConfluence({ sessionId, victory });
      if (res.twin) {
        setTwin({ ...res.twin, sessionId });
      } else {
        setMsg(victory ? "Victory! XP granted." : "Defeat. XP granted for standing together.");
      }
    } catch (e: any) {
      setMsg(e.message || "Couldn't resolve.");
    }
  };

  if (twin) {
    return <TwinBirth twin={twin} sessionId={twin.sessionId} onClaimed={onClose} />;
  }

  return (
    <div className="friends-overlay" onClick={onClose}>
      <div className="friends-panel" onClick={e => e.stopPropagation()}>
        <div className="friends-header">
          <h3>🌀 Confluence</h3>
          <button className="packet-close" onClick={onClose}>✕</button>
        </div>

        {!sessionId ? (
          <>
            <div className="friends-section">
              <h4>Start a confluence</h4>
              <div className="referral-text">
                Two tenders pool Awoken from hand against a shared wave.
                No territory changes hands — only experience, and twins on victory.
              </div>
              <button className="abtn small" onClick={create}>Create confluence</button>
            </div>
            <div className="friends-section">
              <h4>Join with a code</h4>
              <div className="invite-row">
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Code..."
                  maxLength={8}
                />
                <button className="abtn small" onClick={join}>Join</button>
              </div>
            </div>
          </>
        ) : (
          <>
            {code && (
              <div className="friends-section">
                <h4>Share this code</h4>
                <div className="referral-box">
                  <div className="referral-link-row">
                    <input readOnly value={code} onClick={e => (e.target as HTMLInputElement).select()} />
                    <button className="abtn small" onClick={() => {
                      navigator.clipboard.writeText(code);
                      setMsg("Copied!");
                    }}>Copy</button>
                  </div>
                </div>
              </div>
            )}
            <div className="friends-section">
              <h4>Commit Awoken from hand ({committed.length})</h4>
              <div className="champion-grid">
                {hand.filter(a => !committed.includes(a.id)).map(a => (
                  <button key={a.id} className="champion-option" onClick={() => commit(a.id)}>
                    <img src={a.image_url} alt={a.name} />
                    <div>{a.name}</div>
                    <div className="champion-option-stats">{a.power}/{a.toughness}</div>
                  </button>
                ))}
              </div>
              {hand.length === 0 && <div className="friends-empty">No Awoken in hand.</div>}
            </div>
            {committed.length > 0 && (
              <div className="friends-section">
                <h4>Resolve the battle</h4>
                <div className="referral-text">
                  (Shared battleground coming soon — for now, declare the outcome.)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="abtn small" onClick={() => resolveBattle(true)}>Victory</button>
                  <button className="abtn small" onClick={() => resolveBattle(false)}>Defeat</button>
                </div>
              </div>
            )}
          </>
        )}
        {msg && <div className="invite-msg">{msg}</div>}
      </div>
    </div>
  );
}
