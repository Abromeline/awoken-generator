// THE MASTER CLOCK's hands (Nigel, 2026-10-28: "The homeland
// should have a master clock that keeps everything happening
// in the right order" — and its correction the same day,
// 16:29: attacks and movement are reconciled LIVE, like a
// realtime strategy game; attunement was the only thing he
// wanted tracked at 60 seconds).
//
// The homeland's first standing timers. The reckonings
// themselves live with the engine (actions.ts); this module
// only winds the hands — TWO of them, one per gear:
//
// THE SLOW HAND turns every MASTER_CLOCK_TICK_MS (60 s
// unless the environment names another) and walks every
// land whole, in the right order (runMasterClockTick).
//
// THE REALTIME HAND turns every MASTER_CLOCK_REALTIME_MS
// (500 ms — the battle engine's own sub-step grain) and
// reconciles only the WAR of the lands whose war is live
// (runMasterClockRealtime): attacks and movement, settled
// at the moment they fall due instead of in minute lumps.
// Quiet lands cost it one small query a beat and nothing
// more.
//
// Neither hand ever doubles itself: a turn that outlasts
// its interval skips the next beat rather than doubling
// the world (and the realtime hand additionally never
// walks one land's war twice at once). The old Table's
// own timers (table.ts) are that seat's machinery and are
// not touched by these hands.

import { runMasterClockTick, MASTER_CLOCK_TICK_MS, runMasterClockRealtime, MASTER_CLOCK_REALTIME_MS } from "./actions.js";

let ticking = false;
let realtimeTicking = false;

export function startMasterClock(): void {
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    runMasterClockTick()
      .catch(e => console.error("[master-clock] tick failed:", e))
      .finally(() => { ticking = false; });
  }, MASTER_CLOCK_TICK_MS);
  timer.unref?.();
  const realtimeTimer = setInterval(() => {
    if (realtimeTicking) return;
    realtimeTicking = true;
    runMasterClockRealtime()
      .catch(e => console.error("[master-clock] realtime beat failed:", e))
      .finally(() => { realtimeTicking = false; });
  }, MASTER_CLOCK_REALTIME_MS);
  realtimeTimer.unref?.();
  console.log(`[master-clock] the homeland's clock is wound — a slow tick every ${MASTER_CLOCK_TICK_MS} ms, the war reconciled live every ${MASTER_CLOCK_REALTIME_MS} ms.`);
}
