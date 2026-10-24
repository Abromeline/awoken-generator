// ACORN'S LINE — THE HOMELAND'S LESSONS (the homeland tutorial
// redo, Nigel 2026-10-23 23:23: the homeland tutorial redone
// "with the new rules"; the first-visit party lesson and the
// way back, 23:33; under the tutorial SHAPE LAW, 23:37: "cut
// the tutorial down as much as possible so that tenders don't
// have to read paragraphs of text at a time. Tutorials for
// each system can be spread out separately and only trigger
// when that system is triggered for the first time.").
//
// So there is NO tour here and no walkthrough dump — the old
// twelve-step Territory tutorial card is GONE, whole. In its
// place: nine short lessons, one per homeland system, each a
// line or two in the teacher's standing voice (game first,
// lore as seasoning — the whisper's and the packet's cadence:
// direct, gentle, second person), each naming the button or
// control it teaches, each fired ONCE at that system's first
// touch on the terrain map and never again. The registry is
// the front screen's own, EXTENDED: the same server table
// (front_lessons_seen), the same routes, the same owner key
// (see server/src/frontLessons.ts). A lesson never blocks its
// system — it speaks alongside the first touch, dismissible,
// and the system works read or unread.
//
// The words below are DRAFTS for Nigel's ear, printed in full
// in this build's commit so he can strike from the commit
// alone.
//
// ONLY the homeland's systems live here. The front screen's
// lessons stand in frontLessons.ts; the Table is NOT taught
// here at all — this is the homeland's line.
// THE SEED'S BATTLE LESSON IS DELIBERATELY ABSENT: the seed's
// battle shape (its hold's wave referee) stands STOPPED on a
// fork awaiting Nigel's word, and no lesson here teaches a
// dying system. The "seed" lesson below teaches only the
// ground truth that survives any ruling — the claim at
// twenty, the seed as rebuilding heart — at the seed hold's
// first touch; how the hold's fight runs is taught by NO
// lesson until the fork is ruled.
export const HOMELAND_LESSONS = [
  {
    key: "party",
    system: "The party of three at your shoulder (the first-visit party lesson: changing the party inside the real party controls)",
    text: "Your first three stand as your party, at your shoulder. To change it, tap the 🌳 door at the left — your book's Party tab adds and returns Awokin.",
  },
  {
    key: "return",
    system: "The way back (the map's return button, which now reads RETURN)",
    text: "The way home stands above: the map's button now reads RETURN. Tap it, and you are back at the spark.",
  },
  {
    key: "safehex",
    system: "The safe hex and the respawn (one safe hex, always; wake at the bastion, or on it)",
    text: "One hex is always safe — your rebuilding ground. Fall, and you wake at your bastion; with no bastion, you wake on that safe hex.",
  },
  {
    key: "battle",
    system: "The battle you can watch (the living battle on the open map: real wanderers, beat by beat)",
    text: "The dark are real wanderers with drawn faces. The fight runs beat by beat while the map stands open — strikes fly from the fight itself.",
  },
  {
    key: "cast",
    system: "Casting by range (no hex-lock; the readied working STAYS readied)",
    text: "Ready a working, then tap the land — range from where you stand is the only gate. It stays readied: cast, cast, cast, until you choose another.",
  },
  {
    key: "orders",
    system: "The single-Awoken wheel (one Awokin's orders, at its first opening)",
    text: "One Awokin's wheel: March, Attack, Defend, Follow — pick one and it is obeyed at once. March arms your next tap on the land.",
  },
  {
    key: "group",
    system: "The group orders (drag a box; the company's wheel appears)",
    text: "Drag a box around a company and their orders appear: March together, Attack, Defend, Follow — one wheel, obeyed by all.",
  },
  {
    key: "warning",
    system: "The warning with teeth (the first step toward the cursed lands)",
    text: "Care, Tender: you step toward the cursed lands before level 3, before twenty held — the dark here presses harder.",
  },
  {
    key: "seed",
    system: "The First Seed, honestly (its ground truth only — the seed's battle lesson is deferred until the fork is ruled)",
    text: "Twenty held — the starseed can be claimed by your first three. The seed is your rebuilding heart: the ground its hold wins turns yours.",
  },
] as const;

export type HomelandLessonKey = (typeof HOMELAND_LESSONS)[number]["key"];
export type HomelandLesson = (typeof HOMELAND_LESSONS)[number];

/** The once-only reckoning, plain — the front registry's own
 *  shape, mirrored exactly: a touched system teaches only
 *  when its lesson has never been served to this Tender. A
 *  seen lesson, an unknown key — silence. Kept free of React
 *  and the network so the drive can evaluate it as written. */
export function pickHomelandLesson(seenKeys: string[], touchedKey: string): HomelandLesson | null {
  const lesson = HOMELAND_LESSONS.find((l) => l.key === touchedKey) ?? null;
  if (!lesson) return null;
  if (seenKeys.includes(touchedKey)) return null;
  return lesson;
}
