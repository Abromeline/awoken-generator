import { useState, useEffect, useRef } from "react";
import { api, Awakened } from "./api";
import Confluence from "./Confluence";

interface Friend {
  ownerKey: string;
  tenderName: string;
  unread: number;
}

interface PendingRequest {
  id: number;
  tenderName: string;
}

interface Message {
  id: number;
  text: string;
  mine: boolean;
  createdAt: string;
}

export default function Friends({ onClose, hand }: { onClose: () => void; hand?: Awakened[] }) {
  const [showConfluence, setShowConfluence] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteMode, setInviteMode] = useState<"name" | "code">("name");
  const [inviteMsg, setInviteMsg] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    try {
      const data = await api.listFriends();
      setFriends(data.friends);
      setPending(data.pending);
    } catch {}
  };

  useEffect(() => { refresh(); api.getReferralCode().then(r => setReferralCode(r.code)).catch(() => {}); }, []);

  useEffect(() => {
    if (!activeChat) return;
    const load = async () => {
      try {
        const data = await api.getMessages({ friendKey: activeChat.ownerKey });
        setMessages(data.messages);
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch {}
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [activeChat]);

  const sendInvite = async () => {
    if (!inviteInput.trim()) return;
    setInviteMsg("");
    try {
      const args = inviteMode === "name"
        ? { tenderName: inviteInput.trim() }
        : { inviteCode: inviteInput.trim() };
      const res = await api.sendFriendRequest(args);
      setInviteMsg(`Request sent to ${res.tenderName}.`);
      setInviteInput("");
    } catch (e: any) {
      setInviteMsg(e.message || "Couldn't send request.");
    }
  };

  const sendChat = async () => {
    if (!draft.trim() || !activeChat) return;
    try {
      await api.sendMessage({ friendKey: activeChat.ownerKey, text: draft.trim() });
      setDraft("");
      const data = await api.getMessages({ friendKey: activeChat.ownerKey });
      setMessages(data.messages);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {}
  };

  if (activeChat) {
    return (
      <div className="friends-overlay" onClick={onClose}>
        <div className="friends-panel chat-panel" onClick={e => e.stopPropagation()}>
          <div className="chat-header">
            <button className="abtn small" onClick={() => setActiveChat(null)}>← Friends</button>
            <span className="chat-name">{activeChat.tenderName}</span>
            <button className="packet-close" onClick={onClose}>✕</button>
          </div>
          <div className="chat-messages">
            {messages.map(m => (
              <div key={m.id} className={`chat-msg ${m.mine ? "mine" : "theirs"}`}>
                {m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChat()}
              placeholder="Write to your friend..."
              maxLength={2000}
            />
            <button className="abtn small" onClick={sendChat}>Send</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="friends-overlay" onClick={onClose}>
      <div className="friends-panel" onClick={e => e.stopPropagation()}>
        <div className="friends-header">
          <h3>🤝 Friends</h3>
          <button className="packet-close" onClick={onClose}>✕</button>
        </div>
        <button className="abtn small confluence-btn" onClick={() => setShowConfluence(true)}>
          🌀 Confluence — battle together
        </button>
        {showConfluence && <Confluence hand={hand ?? []} onClose={() => setShowConfluence(false)} />}

        {pending.length > 0 && (
          <div className="friends-section">
            <h4>Requests</h4>
            {pending.map(p => (
              <div key={p.id} className="friend-row">
                <span>{p.tenderName}</span>
                <div>
                  <button className="abtn small" onClick={async () => {
                    await api.acceptFriendRequest({ requestId: p.id });
                    refresh();
                  }}>Accept</button>
                  <button className="abtn small" style={{ marginLeft: 6 }} onClick={async () => {
                    await api.declineFriendRequest({ requestId: p.id });
                    refresh();
                  }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="friends-section">
          <h4>Your friends</h4>
          {friends.length === 0 ? (
            <div className="friends-empty">No friends yet. Invite someone below.</div>
          ) : friends.map(f => (
            <div key={f.ownerKey} className="friend-row" onClick={() => setActiveChat(f)}>
              <span>{f.tenderName}</span>
              {f.unread > 0 && <span className="unread-badge">{f.unread}</span>}
              <span className="chat-arrow">→</span>
            </div>
          ))}
        </div>

        {referralCode && (
          <div className="friends-section">
            <h4>Invite a new Tender</h4>
            <div className="referral-box">
              <div className="referral-text">Share this link — when they join, a twin of your champion is born into their deck (and both twins grow stronger).</div>
              <div className="referral-link-row">
                <input readOnly value={`${window.location.origin}?ref=${referralCode}`} onClick={e => (e.target as HTMLInputElement).select()} />
                <button className="abtn small" onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}?ref=${referralCode}`);
                  setInviteMsg("Link copied!");
                  setTimeout(() => setInviteMsg(""), 2000);
                }}>Copy</button>
              </div>
            </div>
          </div>
        )}

        <div className="friends-section">
          <h4>Add a friend</h4>
          <div className="invite-tabs">
            <button className={inviteMode === "name" ? "active" : ""} onClick={() => setInviteMode("name")}>
              By name
            </button>
            <button className={inviteMode === "code" ? "active" : ""} onClick={() => setInviteMode("code")}>
              By invite code
            </button>
          </div>
          <div className="invite-row">
            <input
              value={inviteInput}
              onChange={e => setInviteInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendInvite()}
              placeholder={inviteMode === "name" ? "Tender name..." : "Invite code..."}
            />
            <button className="abtn small" onClick={sendInvite}>Invite</button>
          </div>
          {inviteMsg && <div className="invite-msg">{inviteMsg}</div>}
        </div>
      </div>
    </div>
  );
}
