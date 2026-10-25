// THE TABLE'S FRONT PAGE — deliberately featherweight (audit
// verdict, 2026-10-16). The Control, a bare page, was answered by
// Discord in the same instant it knocked; the Table, knocking just
// as correctly from behind ~400 KB of bundle, heard silence.
// Discord's handshake window is measured from the page's first
// moments, so this entry imports NOTHING but the SDK hand-off: it
// knocks, and the moment Discord answers the knock it sends for
// the room — the fetch runs ALONGSIDE the rest of the sign-in
// (authorize → the server's exchange → authenticate) instead of
// after it, and the room step awaits that same import. The room
// load stands under the same stuck guard as every other step
// (Nigel's mute Table, 2026-10-24: the unguarded import sat at
// "Taking your seat…" forever when Discord's proxy never
// delivered the room chunk). Outside Discord it imports the
// room at once and the room runs its own door, as it always has.
import { knockEarly, setTableSession, startEar, doorRecordLines } from "./tableSdk";

startEar();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing app root element");

rootEl.innerHTML = `
  <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#17110b;color:#e8dcc3;font-family:Georgia,'Times New Roman',serif;padding:20px;box-sizing:border-box">
    <div style="max-width:520px;width:100%;background:#211810;border:1px solid #4a3520;border-radius:14px;padding:26px 26px 20px;box-shadow:0 18px 50px rgba(0,0,0,.5)">
      <div style="font-size:26px;margin-bottom:10px">🕯️ <span style="color:#e9c979">The Table</span></div>
      <p id="boot-step" style="margin:0 0 6px;color:#cbbd9d">Waking the Table…</p>
      <div id="boot-error" style="display:none;color:#e08a7a;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.5;margin-top:10px"></div>
      <button id="boot-retry" style="display:none;margin-top:14px;background:none;border:1px solid #8a6d3b;color:#e9c979;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer">Try the door again</button>
    </div>
  </div>`;

const stepEl = document.getElementById("boot-step")!;
const errorEl = document.getElementById("boot-error")!;
const retryEl = document.getElementById("boot-retry")!;
// Set the moment the player presses "Try the door again": a
// reload is underway, and a room that lands late must not mount
// over it (the late-room rule, at loadRoom below).
let reloadUnderway = false;
retryEl.addEventListener("click", () => { reloadUnderway = true; window.location.reload(); });

let currentStep = "Waking the Table…";
function setStep(label: string) {
  currentStep = label;
  stepEl.textContent = label;
}

function showError(message: string) {
  stepEl.textContent = message;
  errorEl.style.display = "block";
  errorEl.textContent = doorRecordLines().join("\n");
  retryEl.style.display = "inline-block";
}

const STUCK = "__stuck__";
function stepTimeout<T>(label: string, work: Promise<T>): Promise<T> {
  setStep(label);
  return Promise.race([
    work,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(STUCK + label)), 20000)),
  ]);
}

// THE ROOM, SENT FOR EARLY: the sign-in road starts this import
// the moment Discord has answered the knock (startRoomImport's
// call in boot), so the room chunk's long road through Discord's
// proxy runs alongside the sign-in's remaining steps instead of
// beginning only after them. loadRoom awaits THIS SAME import —
// a second import() of a module already fetching starts no
// second fetch, so the fetch's start is the early call.
let roomImport: Promise<typeof import("./TableApp")> | null = null;
function startRoomImport(): Promise<typeof import("./TableApp")> {
  if (!roomImport) {
    roomImport = import("./TableApp");
    // The sign-in may run a while before loadRoom awaits this;
    // keep an early rejection from surfacing as an unhandled
    // rejection before its time. loadRoom's await still receives
    // the rejection and hands it to the boot's error road.
    roomImport.catch(() => {});
  }
  return roomImport;
}

let roomMounted = false;
async function loadRoom(): Promise<void> {
  const mod = await startRoomImport();
  // THE LATE-ROOM RULE: this await outlives the boot's stuck
  // guard — a Promise.race does not cancel the work it timed out
  // on — so a room that lands after the guard fired and the
  // error card showed still mounts, replacing the card:
  // recovery over a stale error. The one exception is a reload
  // already underway (the player pressed "Try the door again"):
  // the reload wins and the late room is left unmounted.
  if (roomMounted || reloadUnderway) return;
  roomMounted = true;
  mod.mountTable();
}

function showBootError(e: unknown): void {
  if (e instanceof Error && e.message.startsWith(STUCK)) {
    showError(`The Table got stuck at this step: “${e.message.slice(STUCK.length)}”.`);
  } else {
    // Discord's refusals arrive as plain objects with a message —
    // print the actual words, never a generic curtain.
    const words = (e as { message?: unknown } | null)?.message;
    showError(typeof words === "string" && words ? words : "The door to the Table would not open.");
  }
}

async function boot(): Promise<void> {
  const inDiscord = new URLSearchParams(window.location.search).has("frame_id") && window.parent !== window;
  if (!inDiscord) {
    try {
      await stepTimeout("Loading the room…", loadRoom());
    } catch (e) {
      showBootError(e);
    }
    return;
  }
  const early = knockEarly();
  if (!early) {
    // Framed, but the app id is not in the hostname (a launch off
    // the proxy host): the room's own boot knows that road.
    try {
      await stepTimeout("Loading the room…", loadRoom());
    } catch (e) {
      showBootError(e);
    }
    return;
  }
  try {
    await stepTimeout("Knocking on Discord's door…", early.ready);
    // Discord has answered the knock — send for the room NOW,
    // before the sign-in's remaining steps, so its fetch runs
    // alongside them. loadRoom awaits this same import when
    // the room step comes.
    startRoomImport();
    const { code } = await stepTimeout("Asking Discord your name…", early.sdk.commands.authorize({
      client_id: early.clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    }));
    const auth = await stepTimeout("Proving your name to the Table…", (async () => {
      const res = await fetch("/api/table/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Discord refused the sign-in.");
      }
      return res.json();
    })());
    await stepTimeout("Discord is vouching for you…", early.sdk.commands.authenticate({ access_token: auth.accessToken }));
    setTableSession({
      authToken: auth.token,
      room: early.sdk.instanceId || "the-table",
      name: auth.user?.name ?? "",
    });
    await stepTimeout("Loading the room…", loadRoom());
  } catch (e) {
    showBootError(e);
  }
}

void boot();
