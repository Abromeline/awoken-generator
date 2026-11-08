/**
 * THE AWARD ROAD — ENTRANCE BUILD 2 (Nigel's build word,
 * 2026-11-01; built 2026-11-02).
 *
 * The entrance player's twenty welcome wakes, paid as awards:
 * four tutorial sections, five wakes each, verified by the
 * server from the acts themselves (server/src/entranceRoad.ts
 * holds the reckoning; this file only shows it and reports
 * the doors' openings).
 *
 * THE PANEL stands where the Door's pool note stood — the
 * tender face, above Wake One, where the player already
 * looks — and extends that note into the road itself: the
 * pool line in the note's own words, then the four sections,
 * which stand done, which stands active, and each active
 * section's live progress. It renders nothing for legacy
 * accounts, and if the road cannot be read it falls back to
 * the Door's pool note, so the face never loses the pool.
 *
 * THE PLAY-ALONG rides the standing whisper machinery: the
 * watcher hook below (seated in Territory beside Acorn's
 * line) observes the road's state and touches the road's
 * lesson keys as the state turns — a section opening, the
 * beacon doused, the fight stood, a completion paid — so the
 * teaching fires in step with the action, once, through the
 * same once-only registry as every other lesson.
 *
 * THE DOORS' OPENINGS (§1) are reported by the surfaces
 * themselves at the moment they open: the watcher here hears
 * the face's own buttons (My Deck, the Skill Zodiac, Aspect
 * Attunement — one document listener, as the map-door lesson
 * watcher already does), and Territory reports the map, the
 * Pack, Find my Tender and the orders wheel from their own
 * controls (pingRoadNav). The ping names only the surface;
 * the server remembers it for entrance accounts alone.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, type EntranceRoadState } from "./api";
import { HOMELAND_LESSONS, type HomelandLessonKey } from "./homelandLessons";
import type { HomelandWhisperState } from "./HomelandWhisper";
import { EntrancePoolNote } from "./EntranceDoor";

/** Report a navigation surface's opening to the road. The
 *  answer (the road as it now stands) refreshes the shared
 *  road query, so the panel and the whispers move at once. */
export function pingRoadNav(surface: string, queryClient?: QueryClient) {
  void api.entranceNavOpened({ surface })
    .then((data) => { queryClient?.setQueryData(["entranceRoad"], data); })
    .catch(() => { /* a missed ping is re-fired at the surface's next opening; the road is never blocked by it */ });
}

const DOOR_NAMES: Record<string, string> = {
  map: "Terrain Map",
  deck: "My Deck",
  zodiac: "Skill Zodiac",
  aspects: "Attunement",
  pack: "The Pack",
  find: "Find my Tender",
  wheel: "The Wheel",
};

const SECTION_TITLES: Record<number, string> = {
  1: "Learn the doors",
  2: "Orders, and a first fight",
  3: "The beacon lesson",
  4: "Cast your spell",
};

/** A section's standing line — the play-along's own words for
 *  its opening, read from the same lesson list the whisper
 *  speaks, so the panel and the voice never drift. */
function sectionLine(n: number): string {
  return HOMELAND_LESSONS.find((l) => l.key === `road${n}start`)?.text ?? "";
}

function progressLine(road: EntranceRoadState, n: number): string {
  const s = road.sections.find((x) => x.n === n);
  if (!s) return "";
  const p = s.progress;
  if (s.done) return "Lived — five wakes paid.";
  if (n === 1) {
    const opened = p.navOpened ?? [];
    const missing = Object.keys(DOOR_NAMES).filter((k) => !opened.includes(k));
    return `Doors opened: ${opened.length} of ${p.navTotal ?? 7}${missing.length ? ` — still to open: ${missing.map((k) => DOOR_NAMES[k]).join(", ")}` : ""}.`;
  }
  if (n === 2) {
    return `Orders given: ${p.ordersGiven ?? 0} of ${p.ordersTotal ?? 3} · First fight: ${p.battleFought ? "stood" : "not yet"}.`;
  }
  if (n === 3) {
    switch (p.beaconStage) {
      case "to-light": return "First, light the beacon — kills buy the light, and your battles fill the bank.";
      case "to-douse": return "The beacon burns. Now douse it — by your own hand.";
      case "to-fight": return "The beacon stands doused. Fight what the dark sends, while it stands dark.";
      case "to-relight": return "Fought in the dark. Now relight the beacon.";
      default: return "";
    }
  }
  if (n === 4) {
    return p.cast ? "Cast true." : `Cast ${p.spellName ?? "your spell"} once, true, on your land.`;
  }
  return "";
}

/**
 * THE ROAD, WHERE THE PLAYER ALREADY LOOKS: the tender face,
 * in the Door's pool note's seat. Nothing for legacy
 * accounts; the pool note alone until the road can be read.
 */
export function EntranceRoadPanel() {
  // The road's own heartbeat: the panel is where the player
  // watches the road, so it re-reads while the road stands
  // unfinished (the app's global 30s staleTime would otherwise
  // let a just-completed door sit unseen behind a stale read).
  const roadQ = useQuery({
    queryKey: ["entranceRoad"],
    queryFn: () => api.getEntranceRoad(),
    retry: false,
    refetchInterval: (query) => (query.state.data?.finished ? false : 5000),
  });
  const road = roadQ.data;
  if (!road) return <EntrancePoolNote />;
  if (!road.entrance || !road.begun) return null;
  if (road.finished) {
    return (
      <p className="entrance-award-note" role="status">
        The award road is walked — all twenty wakes stand earned, and Wake One holds what remains of them. Level three stands at this road's end.
      </p>
    );
  }
  return (
    <section className="entrance-road" aria-label="The award road — your first lessons, five wakes each">
      <p className="eyebrow">The award road</p>
      <p className="entrance-road-pool">
        Award pool: <strong>{road.awardPool} wakes</strong> still to earn — five for each lesson lived.
        Spendable now: <strong>{road.spendableCredits}</strong>.
      </p>
      <ol className="entrance-road-list">
        {road.sections.map((s) => (
          <li key={s.n} className={`entrance-road-one${s.done ? " done" : s.active ? " active" : ""}`} data-road-section={s.n} data-road-done={s.done ? "true" : undefined}>
            <span className="entrance-road-mark" aria-hidden="true">{s.done ? "✓" : s.active ? "➤" : "·"}</span>
            <div className="entrance-road-body">
              <h3>{SECTION_TITLES[s.n]}{s.n === 4 && s.progress.spellName ? ` — ${s.progress.spellName}` : ""}</h3>
              {(s.active || s.done) && <p className="entrance-road-line">{sectionLine(s.n)}</p>}
              <p className="entrance-road-progress">{progressLine(road, s.n)}</p>
            </div>
            <span className="entrance-road-pay">+5 wakes</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The face's own door buttons, heard from outside — the
 *  map-door lesson watcher's pattern, extended to the road:
 *  a capture-phase listener pings the road when one of the
 *  navigation surfaces' real buttons is clicked. It never
 *  calls, wraps or alters the buttons; it only listens. (The
 *  map itself, the Pack, Find my Tender and the wheel are
 *  reported by Territory from their own controls.) */
export function EntranceNavWatcher() {
  const queryClient = useQueryClient();
  const roadQ = useQuery({ queryKey: ["entranceRoad"], queryFn: () => api.getEntranceRoad(), retry: false, refetchInterval: 15000 });
  const liveRef = useRef(false);
  liveRef.current = !!roadQ.data?.entrance && roadQ.data.begun && !roadQ.data.finished;
  const clientRef = useRef(queryClient);
  clientRef.current = queryClient;
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!liveRef.current) return;
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      if (target.closest(".deck-fab")) pingRoadNav("deck", clientRef.current);
      else if (target.closest(".tree-fab")) pingRoadNav("zodiac", clientRef.current);
      else if (target.closest(".aspect-fab")) pingRoadNav("aspects", clientRef.current);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}

interface RoadSnap {
  done: number[];
  active: number | null;
  stage: string | undefined;
  finished: boolean;
}

function snapOf(road: EntranceRoadState): RoadSnap {
  return {
    done: road.sections.filter((s) => s.done).map((s) => s.n),
    active: road.sections.find((s) => s.active)?.n ?? null,
    stage: road.sections.find((s) => s.n === 3)?.progress.beaconStage,
    finished: road.finished,
  };
}

/** THE PLAY-ALONG'S EAR (seated in Territory): watch the
 *  road turn, and let the companions speak in step — a
 *  section's opening when it becomes the standing lesson,
 *  the beacon's dark and fought moments as they land, a
 *  completion in the breath its five wakes pay. The whisper
 *  registry keeps each line to once; this hook only decides
 *  the moments. First sight speaks the road's opening and the
 *  standing section's line — and, if the beacon lesson
 *  already stands mid-lesson, its moment too. */
export function useRoadWhispers(homeland: HomelandWhisperState) {
  const roadQ = useQuery({
    queryKey: ["entranceRoad"],
    queryFn: () => api.getEntranceRoad(),
    retry: false,
    refetchInterval: (query) => (query.state.data?.finished ? false : 4000),
  });
  const prevRef = useRef<RoadSnap | null>(null);
  const touchRef = useRef(homeland.touch);
  touchRef.current = homeland.touch;
  useEffect(() => {
    const road = roadQ.data;
    if (!road?.entrance || !road.begun) return;
    const touch = (key: string) => touchRef.current(key as HomelandLessonKey);
    const snap = snapOf(road);
    const prev = prevRef.current;
    if (!prev) {
      touch("roadstart");
      if (snap.active && !snap.done.includes(snap.active)) touch(`road${snap.active}start`);
      if (snap.active === 3) {
        if (snap.stage === "to-fight") touch("road3dark");
        if (snap.stage === "to-relight") { touch("road3dark"); touch("road3fought"); }
      }
    } else {
      for (const n of snap.done) if (!prev.done.includes(n)) touch(`road${n}done`);
      if (snap.finished && !prev.finished) touch("roaddone");
      if (snap.active && snap.active !== prev.active && !snap.done.includes(snap.active)) touch(`road${snap.active}start`);
      if (snap.stage !== prev.stage) {
        if (snap.stage === "to-fight") touch("road3dark");
        if (snap.stage === "to-relight") touch("road3fought");
      }
    }
    prevRef.current = snap;
  }, [roadQ.data]);
}
