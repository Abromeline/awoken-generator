// THE EARLY KNOCK (audit verdict, 2026-10-16): the Control — a bare
// page that constructs the SDK at module scope and re-aims the knock
// at discord.com — was ANSWERED by Discord (variant 2), while the
// Table, knocking the identical knock from inside a React effect
// after its heavy bundle mounted and painted, heard silence.
// Discord's window for the handshake is tighter than a React boot.
// So the Table now knocks here, at module scope in the entry file,
// before React renders anything: construct, re-aim if the SDK's aim
// is not at a Discord origin (the proxy poisons the referrer — see
// Table.tsx), send the knock again, and start ready() at once. The
// Table component consumes the prepared boot when its effect runs.
import { DiscordSDK } from "@discord/embedded-app-sdk";

export interface TableBoot {
  sdk: DiscordSDK;
  clientId: string;
  ready: Promise<void>;
}

// The boot lives on the window, not in module state: the knock
// script and the Table bundle are separate module graphs, and a
// module-scope singleton could exist once per graph. The window is
// the one shelf both are guaranteed to share.
const SLOT = "__awokenTableBoot";

export function knockEarly(): TableBoot | null {
  const w = window as unknown as Record<string, TableBoot | undefined>;
  if (w[SLOT]) return w[SLOT]!;
  const hostId = window.location.hostname.endsWith(".discordsays.com") ? window.location.hostname.split(".")[0] : "";
  if (!/^\d+$/.test(hostId)) return null;
  const sdk = new DiscordSDK(hostId);
  try {
    const s = sdk as unknown as { sourceOrigin?: string; handshake?: () => void };
    if (s.sourceOrigin && !/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com/.test(s.sourceOrigin) && typeof s.handshake === "function") {
      s.sourceOrigin = "https://discord.com";
      s.handshake();
    }
  } catch {}
  reknockOnHello(sdk);
  w[SLOT] = { sdk, clientId: hostId, ready: sdk.ready() };
  return w[SLOT]!;
}

// THE SECOND KNOCK (2026-10-18): a stuck launch's door record
// showed Discord's parent GREETING this frame — an op-3 HELLO
// from discord.com — while our single knock, sent at construction,
// never drew the READY that ends the knocking step. Our knock can
// race ahead of the parent's ear; the greeting proves the
// doorkeeper is listening NOW. So: when the greeting is heard,
// knock once more. Harmless when the first knock landed (ready
// resolves on READY either way); decisive when it didn't.
export function reknockOnHello(sdk: DiscordSDK): void {
  const onMsg = (ev: MessageEvent) => {
    try {
      const d: unknown = ev.data;
      if (!Array.isArray(d) || d[0] !== 3) return;
      if (!/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com$/.test(ev.origin)) return;
      window.removeEventListener("message", onMsg);
      const s = sdk as unknown as { sourceOrigin?: string; handshake?: () => void };
      if (s.sourceOrigin && !/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com/.test(s.sourceOrigin)) {
        s.sourceOrigin = "https://discord.com";
      }
      if (typeof s.handshake === "function") s.handshake();
    } catch {}
  };
  window.addEventListener("message", onMsg);
}

export function takeTableBoot(): TableBoot | null {
  const w = window as unknown as Record<string, TableBoot | undefined>;
  return w[SLOT] ?? null;
}

// The prepared session: once the light front page (table-main.tsx)
// has completed the whole Discord sign-in — knock, authorize, the
// server's exchange, authenticate — the room needs nothing from the
// SDK but the seat ticket and the room key. They cross over here.
export interface TableSession {
  authToken: string;
  room: string;
  name: string;
}

const SESSION_SLOT = "__awokenTableSession";

export function setTableSession(session: TableSession): void {
  const w = window as unknown as Record<string, TableSession | undefined>;
  w[SESSION_SLOT] = session;
}

export function takeTableSession(): TableSession | null {
  const w = window as unknown as Record<string, TableSession | undefined>;
  return w[SESSION_SLOT] ?? null;
}

// The listening ear + door record, shared by the light front page
// (which owns the first moments) and kept on the window so any
// later error screen can read what the frame heard.
const HEARD_SLOT = "__awokenHeard";

export function heardLines(): string[] {
  const w = window as unknown as Record<string, string[] | undefined>;
  if (!w[HEARD_SLOT]) w[HEARD_SLOT] = [];
  return w[HEARD_SLOT]!;
}

export function startEar(): void {
  const w = window as unknown as Record<string, boolean | undefined>;
  if (w["__awokenEarStarted"]) return;
  w["__awokenEarStarted"] = true;
  const names: Record<number, string> = { 0: "HANDSHAKE", 1: "FRAME", 2: "CLOSE", 3: "HELLO" };
  window.addEventListener("message", (event: MessageEvent) => {
    try {
      const heard = heardLines();
      if (heard.length >= 8) return;
      const d: unknown = event.data;
      let shape: string;
      if (Array.isArray(d)) {
        const op = typeof d[0] === "number" ? (names[d[0]] ?? `op ${d[0]}`) : "?";
        const inner = d[1] && typeof d[1] === "object" ? (d[1] as { evt?: string; cmd?: string }) : null;
        shape = `told as [${op}${inner?.evt ? ` ${inner.evt}` : ""}${inner?.cmd ? ` ${inner.cmd}` : ""}]`;
      } else if (d && typeof d === "object") {
        const o = d as { cmd?: string; evt?: string };
        shape = o.cmd || o.evt ? `old-style ${o.cmd ?? ""} ${o.evt ?? ""}`.trim() : "an object";
      } else {
        shape = `a ${typeof d}`;
      }
      heard.push(`${event.origin} — ${shape}`);
    } catch {}
  });
}

export function doorRecordLines(): string[] {
  const heard = heardLines();
  return [
    `Framed by Discord: ${window.parent !== window ? "yes" : "no"}`,
    `Sent by: ${document.referrer || "(nothing)"}`,
    `Door: ${window.location.hostname}`,
    `Frame tag: ${new URLSearchParams(window.location.search).has("frame_id") ? "present" : "missing"}`,
    `Heard back: ${heard.length ? heard.join(" · ") : "silence — nothing came back"}`,
  ];
}
