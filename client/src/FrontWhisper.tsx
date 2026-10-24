// FrontWhisper: the whispering Awoken's front-screen lessons,
// worn on the screen beside the system being touched for the
// first time (Nigel, 2026-10-23 23:23; shape law 23:37).
//
// The hook owns the registry's client half: it loads the served
// set from the server (front_lessons_seen, keyed by the Tender's
// owner key — or by the visitor id before a claim), and a touch
// serves a lesson at most once: the key joins the local served
// set the moment it fires and is recorded server-side in the
// same breath, so a second touch is silent even before the
// server answers, and a dismissed lesson never returns. If the
// registry cannot be reached, the local set still holds the
// once-only law for the session — teaching degrades, it never
// repeats or blocks.
//
// Lessons queue: two systems first-touched in one gesture (the
// Terrain Map door opening the way toward the cursed lands)
// speak one at a time, each dismissible, neither a gate — the
// system underneath works whether the lesson is read or not.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { pickFrontLesson, type FrontLesson, type FrontLessonKey } from "./frontLessons";

export interface FrontWhisperState {
  /** Fire a system's first touch. Silent if its lesson was served. */
  touch: (key: FrontLessonKey) => void;
  /** The lesson presently speaking, if any. */
  active: FrontLesson | null;
  /** Lay the speaking lesson to rest; the next queued one speaks. */
  dismiss: () => void;
}

export function useFrontWhisper(): FrontWhisperState {
  const [queue, setQueue] = useState<FrontLesson[]>([]);
  const loadedRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<FrontLessonKey[]>([]);

  const serve = useCallback((key: FrontLessonKey) => {
    const lesson = pickFrontLesson([...seenRef.current], key);
    if (!lesson) return;
    seenRef.current.add(key);
    setQueue((q) => [...q, lesson]);
    // Record the serving server-side, in the same breath. A failed
    // record never recalls the lesson and never blocks the system.
    void api.markFrontLesson({ lessonKey: key }).catch(() => { /* the local set remembers for this session */ });
  }, []);

  useEffect(() => {
    let live = true;
    const settle = (served: string[]) => {
      if (!live) return;
      for (const key of served) seenRef.current.add(key);
      loadedRef.current = true;
      // Touches that landed while the registry loaded speak now,
      // each still judged against the served set.
      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const key of pending) serve(key);
    };
    api.getFrontLessons()
      .then((data) => settle(data.seen))
      .catch(() => settle([])); // unreachable registry: the session's local set is the memory
    return () => { live = false; };
  }, [serve]);

  const touch = useCallback((key: FrontLessonKey) => {
    if (!loadedRef.current) { pendingRef.current.push(key); return; }
    serve(key);
  }, [serve]);

  const dismiss = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  return { touch, active: queue[0] ?? null, dismiss };
}

/** A lesson trigger for a system whose first touch is a state
 *  becoming true, or a surface mounting (the First Seed banner
 *  appearing at twenty; the claim gate standing open — however
 *  the visitor arrived there, the gate's mount IS the claim
 *  system's first touch): renders nothing; when `when` first
 *  stands, it touches. */
export function LessonTrigger({ when, lessonKey, onTouch }: { when: boolean; lessonKey: FrontLessonKey; onTouch: (key: FrontLessonKey) => void }) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (when && !firedRef.current) {
      firedRef.current = true;
      onTouch(lessonKey);
    }
  }, [when, lessonKey, onTouch]);
  return null;
}

/** The Terrain Map door's lesson watcher. The door handlers
 *  (deckDoor / patrolDoor) and their buttons stand exactly as
 *  the map-lock build left them — their shape is locked by
 *  standing drives — so the map lessons observe the door's
 *  first touch from outside: a capture-phase listener hears a
 *  click land on the Terrain Map button (or on the banner's
 *  Send, which is the same door) and touches "map"; a claimed
 *  Tender's click also steps toward the cursed lands, so
 *  "early" is touched behind it. The watcher never calls,
 *  wraps, or alters the door — it only listens, and the
 *  registry keeps it to once. A click that closes the map
 *  (Return) is not a first touch and teaches nothing. */
export function MapDoorLessonWatcher({ isTender, mapOpen, onTouch }: { isTender: boolean; mapOpen: boolean; onTouch: (key: FrontLessonKey) => void }) {
  const tenderRef = useRef(isTender);
  tenderRef.current = isTender;
  const openRef = useRef(mapOpen);
  openRef.current = mapOpen;
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      if (target.closest(".patrol-banner-send")) {
        onTouch("map");
        if (tenderRef.current) onTouch("early");
        return;
      }
      if (target.closest(".deck-button")) {
        if (openRef.current) return;
        onTouch("map");
        if (tenderRef.current) onTouch("early");
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [onTouch]);
  return null;
}

/** The speaking lesson: the whisper's bubble, at the left margin
 *  below her standing seat, with her dismiss. It overlays nothing
 *  the touched system needs and takes no answer — the ✕ only
 *  rests her voice; the system beneath has already worked. */
export default function FrontWhisper({ whisper }: { whisper: FrontWhisperState }) {
  const lesson = whisper.active;
  if (!lesson) return null;
  return (
    <div className="margin-guide left front-whisper" role="status" aria-label={`A whisper about ${lesson.system}`}>
      <div className="margin-guide-bubble front-whisper-bubble">
        <p data-front-lesson={lesson.key}>{lesson.text}</p>
        <button
          className="margin-guide-dismiss"
          onClick={whisper.dismiss}
          title="Rest now"
          aria-label="Dismiss this lesson"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
