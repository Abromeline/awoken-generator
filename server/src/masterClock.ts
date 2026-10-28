// THE MASTER CLOCK's hand (Nigel, 2026-10-28: "The homeland
// should have a master clock that keeps everything happening
// in the right order").
//
// The homeland's first standing timer. The reckoning itself
// lives with the engine (actions.ts: runMasterClockTick —
// every land settled in the right order, by the standing
// settles, under the offline/beacon laws); this module only
// winds the hand: a tick every MASTER_CLOCK_TICK_MS (60 s
// unless the environment names another), never two ticks at
// once — a tick that outlasts its interval skips the next
// beat rather than doubling the world. The old Table's own
// timers (table.ts) are that seat's machinery and are not
// touched by this hand.

import { runMasterClockTick, MASTER_CLOCK_TICK_MS } from "./actions.js";

let ticking = false;

export function startMasterClock(): void {
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    runMasterClockTick()
      .catch(e => console.error("[master-clock] tick failed:", e))
      .finally(() => { ticking = false; });
  }, MASTER_CLOCK_TICK_MS);
  timer.unref?.();
  console.log(`[master-clock] the homeland's clock is wound — a tick every ${MASTER_CLOCK_TICK_MS} ms.`);
}
