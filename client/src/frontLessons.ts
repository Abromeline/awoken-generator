// THE WHISPER'S FRONT-SCREEN LESSONS (Nigel, 2026-10-23 23:23:
// "We need the whisper to give a tutorial of the front screen,
// to tell people what the buttons mean" — under the tutorial
// shape law, 2026-10-23 23:37: "cut the tutorial down as much
// as possible so that tenders don't have to read paragraphs of
// text at a time. Tutorials for each system can be spread out
// separately and only trigger when that system is triggered
// for the first time.").
//
// So there is NO tour here and no walkthrough dump: six short
// lessons, one per front-screen system, each a line or two in
// the whispering Awoken's standing voice (her greeting's
// cadence — direct, gentle, second person), each naming the
// button or surface it teaches, each fired ONCE at that
// system's first touch and never again (the registry is
// server-side: see server/src/frontLessons.ts). A lesson never
// blocks its system — it speaks alongside the first touch,
// dismissible, and the system works read or unread.
//
// The words below are DRAFTS for Nigel's ear, printed in full
// in this build's commit so he can strike from the commit
// alone.
//
// ONLY front-screen systems live here. The Grimoire and the
// map's own systems are not first-touched on the front screen;
// the homeland tutorial carries those.
export const FRONT_LESSONS = [
  {
    key: "claim",
    system: "Become a Tender (the claim gate)",
    text: "Become a Tender first: choose the name the Awokin will call you, and a password only you know. No Awokin wakes before that binding.",
  },
  {
    key: "wake",
    system: "Wake One (and the free wakes held by the green crystal)",
    text: "Wake One wakes a new friend. The number by the green crystal is the free wakes you hold — yours now, not a wait.",
  },
  {
    key: "choose",
    system: "Waking three, and the choosing that follows (class, then the runic weapon)",
    text: "Three woken — the choosing opens. Choose your class first; then name the runic weapon that will float at your side.",
  },
  {
    key: "twenty",
    system: "The road to twenty (the First Seed banner; the first three sent to claim the starseed)",
    text: "Twenty held, and a starseed has landed. The banner sends your first three to claim it — they stand ready.",
  },
  {
    key: "map",
    system: "The Terrain Map door (the claim is what opens it)",
    text: "Terrain Map is your land's door. It opens for a claimed Tender — a guest who knocks is led to Become a Tender first.",
  },
  {
    key: "early",
    system: "First entry toward the cursed lands (the encouragement's truth, in her short form)",
    text: "One whisper of care: enter the cursed lands before level 3, or before twenty held, and the dark presses harder.",
  },
] as const;

export type FrontLessonKey = (typeof FRONT_LESSONS)[number]["key"];
export type FrontLesson = (typeof FRONT_LESSONS)[number];

/** The once-only reckoning, plain: a touched system teaches
 *  only when its lesson has never been served to this Tender.
 *  A seen lesson, an unknown key — silence. Kept free of React
 *  and the network so the drive can evaluate it as written. */
export function pickFrontLesson(seenKeys: string[], touchedKey: string): FrontLesson | null {
  const lesson = FRONT_LESSONS.find((l) => l.key === touchedKey) ?? null;
  if (!lesson) return null;
  if (seenKeys.includes(touchedKey)) return null;
  return lesson;
}
