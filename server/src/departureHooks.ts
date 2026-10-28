// FIX THE CLOCKS (Nigel, 2026-10-28): the departure-settle
// hook registry. actions.ts owns the standing clocks, but
// party.ts also lifts a fielded Awoken off the field (into
// the party) — and actions.ts imports party.ts, so party.ts
// cannot import actions.ts back without closing a cycle.
// actions.ts registers its settle here at load; party.ts
// calls through the registry before its delete. If no hook
// is registered the call is a no-op: the span is not lost
// with the row's other spans — cursors carry the truth, and
// a span is only ever paid by the settle that advances its
// cursor, never twice.
let departureHook: ((placementId: number, nowMs: number) => Promise<void>) | null = null;

export function registerPlacementDepartureHook(
  fn: (placementId: number, nowMs: number) => Promise<void>
): void {
  departureHook = fn;
}

export async function settlePlacementDeparture(
  placementId: number,
  nowMs: number = Date.now()
): Promise<void> {
  if (departureHook) await departureHook(placementId, nowMs);
}
