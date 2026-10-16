// THE TABLE CONTROL — a bare reference activity (audit, 2026-10-16).
// The Table's launch hangs at sdk.ready() with total silence from the
// client, though every layer on our side verifies. This page is the
// control experiment: it does NOTHING but construct the SDK and wait
// for Discord's answer, under the same app, the same door, the same
// proxy. Each load runs exactly ONE knock variant, cycling by a
// localStorage counter, so a launch convicts or clears one variant:
//   0 — plain: the README's shape, exactly as the SDK ships it
//   1 — re-aimed: sourceOrigin set to https://discord.com, knock again
//   2 — broadcast: sourceOrigin set to "*", knock again
// If all three hear silence, the refusal lives in Discord's handling
// of this app — proven, not guessed. If one answers, the Table adopts
// that knock. The page also keeps a listening ear: every message that
// reaches this window is logged with its origin and shape.
import { DiscordSDK } from "@discord/embedded-app-sdk";

const root = document.getElementById("root")!;
const t0 = performance.now();
const stamp = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;
const log: string[] = [];
function render() { root.textContent = log.join("\n"); }
function say(line: string) { log.push(line); render(); }

function shapeOf(d: unknown): string {
  if (Array.isArray(d)) {
    const names: Record<number, string> = { 0: "HANDSHAKE", 1: "FRAME", 2: "CLOSE", 3: "HELLO" };
    const op = typeof d[0] === "number" ? (names[d[0]] ?? `op${d[0]}`) : "?";
    const inner = d[1] && typeof d[1] === "object" ? (d[1] as { evt?: string; cmd?: string }) : null;
    return `told as [${op}${inner?.evt ? ` ${inner.evt}` : ""}${inner?.cmd ? ` ${inner.cmd}` : ""}]`;
  }
  if (d && typeof d === "object") {
    const o = d as { cmd?: string; evt?: string };
    if (o.cmd || o.evt) return `old-style ${o.cmd ?? ""} ${o.evt ?? ""}`.trim();
    return "an object";
  }
  return `a ${typeof d}`;
}

window.addEventListener("message", (event: MessageEvent) => {
  say(`${stamp()}  HEARD from ${event.origin}: ${shapeOf(event.data)}`);
});

const VARIANTS = [
  "plain — the README's shape, the knock exactly as the SDK ships it",
  "re-aimed — the knock re-addressed to https://discord.com",
  "broadcast — the knock addressed to any origin (*)",
];
let variant = 0;
try {
  variant = Number(localStorage.getItem("controlVariant") || "0") % 3;
  localStorage.setItem("controlVariant", String((variant + 1) % 3));
} catch {}

const hostId = window.location.hostname.endsWith(".discordsays.com") ? window.location.hostname.split(".")[0] : "";
const clientId = /^\d+$/.test(hostId) ? hostId : "";

say("THE TABLE CONTROL — bare handshake instrument");
say(`Variant ${variant + 1} of 3: ${VARIANTS[variant]}`);
say(`Framed by Discord: ${window.parent !== window ? "yes" : "no"}`);
say(`Client id (from the door host): ${clientId || "— none —"}`);
say("");

if (!clientId) {
  say("No client id in the hostname — this page only speaks inside Discord.");
} else {
  void (async () => {
    const sdk = new DiscordSDK(clientId);
    say(`${stamp()}  SDK built; the knock went out as the SDK shipped it.`);
    if (variant > 0) {
      try {
        const s = sdk as unknown as { sourceOrigin?: string; handshake?: () => void };
        s.sourceOrigin = variant === 1 ? "https://discord.com" : "*";
        s.handshake?.();
        say(`${stamp()}  Second knock sent, addressed to ${variant === 1 ? "https://discord.com" : "any origin (*)"}.`);
      } catch (e) {
        say(`${stamp()}  The variant knock could not be sent: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    say("Listening for 20 seconds…");
    const answered = await Promise.race([
      sdk.ready().then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 20000)),
    ]);
    say("");
    if (answered) {
      say("★ DISCORD ANSWERED — ready() resolved.");
      say(`Instance: ${sdk.instanceId}`);
      say(`Channel: ${sdk.channelId ?? "—"} · Guild: ${sdk.guildId ?? "—"}`);
      say("This variant WORKS. The Table adopts this knock.");
    } else {
      say("✗ NO ANSWER in 20 seconds — silence, same as the Table.");
      say("Close the activity and launch again to try the next variant.");
    }
  })();
}
