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

let boot: TableBoot | null = null;

export function knockEarly(): TableBoot | null {
  if (boot) return boot;
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
  boot = { sdk, clientId: hostId, ready: sdk.ready() };
  return boot;
}

export function takeTableBoot(): TableBoot | null {
  return boot;
}
