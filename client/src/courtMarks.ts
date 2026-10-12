import { useSyncExternalStore } from "react";

// Court marks: which of the tender's Awoken are the marked champion and
// which are housed in the Hall of Champions. Fed by App from the shared
// ["legends"] / ["hall"] queries so every card stays in step.
export interface CourtMarks {
  championId: number | null;
  housedIds: ReadonlySet<number>;
}

let marks: CourtMarks = { championId: null, housedIds: new Set() };
const listeners = new Set<() => void>();

export function setCourtMarks(next: CourtMarks) {
  marks = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useCourtMarks(): CourtMarks {
  return useSyncExternalStore(subscribe, () => marks);
}
