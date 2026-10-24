// HomelandWhisper: Acorn's line on the terrain map — the
// homeland's first-touch lessons, spoken beside the system
// being touched for the first time (the homeland tutorial
// redo, Nigel 2026-10-23 23:23; the first-visit party lesson
// and the way back, 23:33; shape law 23:37).
//
// This hook is the front whisper's own machinery, mirrored
// exactly (FrontWhisper.tsx), because the registry is the
// SAME registry, extended — one served set per Tender in
// front_lessons_seen, read and marked through the same
// routes (api.getFrontLessons / api.markFrontLesson). The
// hook loads the served set (front lessons and homeland
// lessons together, as the server serves them), judges each
// touch by pickHomelandLesson, records the serving in the
// same breath it fires; if the registry cannot be reached,
// the session's local set still holds the once-only law.
// Lessons queue — a first visit first-touches the party,
// the way back and the safe hex in one arrival, and they
// speak one at a time, each dismissible, none a gate: the
// map opens, the party changes and the cast fires whether
// a lesson is read, unread or dismissed.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { pickHomelandLesson, type HomelandLesson, type HomelandLessonKey } from "./homelandLessons";

export interface HomelandWhisperState {
  /** Fire a system's first touch. Silent if its lesson was served. */
  touch: (key: HomelandLessonKey) => void;
  /** The lesson presently speaking, if any. */
  active: HomelandLesson | null;
  /** Lay the speaking lesson to rest; the next queued one speaks. */
  dismiss: () => void;
}

export function useHomelandLessons(): HomelandWhisperState {
  const [queue, setQueue] = useState<HomelandLesson[]>([]);
  const loadedRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<HomelandLessonKey[]>([]);

  const serve = useCallback((key: HomelandLessonKey) => {
    const lesson = pickHomelandLesson([...seenRef.current], key);
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

  const touch = useCallback((key: HomelandLessonKey) => {
    if (!loadedRef.current) { pendingRef.current.push(key); return; }
    serve(key);
  }, [serve]);

  const dismiss = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  return { touch, active: queue[0] ?? null, dismiss };
}

/** The speaking lesson: the teacher's bubble in the whisper's
 *  own dress, seated at the map's left edge above the hand
 *  dock. It overlays nothing the touched system needs and
 *  takes no answer — the ✕ only rests her voice; the system
 *  beneath has already worked. While the PARTY lesson speaks,
 *  Territory seats the pointing ring on the 🌳 door it names
 *  (the .lesson-point class) — the lesson points at the real
 *  control, and the control works while she speaks. */
export default function HomelandWhisper({ homeland }: { homeland: HomelandWhisperState }) {
  const lesson = homeland.active;
  if (!lesson) return null;
  return (
    <div className="homeland-whisper" role="status" aria-label={`A lesson about ${lesson.system}`}>
      <div className="margin-guide-bubble homeland-whisper-bubble">
        <p data-homeland-lesson={lesson.key}>{lesson.text}</p>
        <button
          className="margin-guide-dismiss"
          onClick={homeland.dismiss}
          title="Rest now"
          aria-label="Dismiss this lesson"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
