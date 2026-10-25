// THE FIRST-TOUCH LESSON REGISTRY (Nigel, 2026-10-23
// 23:23 — "We need the whisper to give a tutorial of the front
// screen, to tell people what the buttons mean"; the shape law
// 23:37 — each system carries its OWN short lesson, fired ONCE
// at that system's first touch, and never again).
//
// EXTENDED, NOT DUPLICATED (the homeland tutorial redo, Nigel
// 2026-10-23 23:23 + 23:33 + 23:37): the homeland's lessons —
// Acorn's line on the terrain map — are served by THIS SAME
// registry: the same table (front_lessons_seen), the same
// routes, the same owner keying, the same union read. There is
// one first-touch registry per Tender, not one per screen; the
// homeland keys simply join the served set below, in the
// homeland block. The front screen's keys stand first and
// unchanged, in their order.
//
// The registry is honest server state, in the codebase's own
// convention for per-Tender seen/taught state: rows keyed by
// owner key, exactly as the welcome ritual keys its visitors
// table — "tender:<id>" for a claimed Tender. A pre-claim
// visitor is keyed by the raw visitor id the front screen
// already carries (the localStorage UUID sent as X-Visitor-Id,
// the same identity welcomeIdentity honors for soft visitors),
// so the claim lesson can fire for the unclaimed and be
// remembered. Reads take the UNION of every key a request
// carries (Tender key + visitor id), so a lesson served before
// the claim is still served-and-done after it.
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./store.js";

/** The front screen's lessons, in the game's own order. The
 *  words live client-side with the whisper; the server only
 *  remembers which keys have been served. */
export const FRONT_LESSON_KEYS = [
  "claim",
  "wake",
  "choose",
  "twenty",
  "map",
  "early",
] as const;
export type FrontLessonKey = (typeof FRONT_LESSON_KEYS)[number];

/** The homeland's lessons (the terrain map's own systems),
 *  in the order a Tender meets them on that ground: the
 *  first-visit party lesson and the way back, the safe hex,
 *  the watched battle, casting by range, the two orders
 *  wheels, the warning with teeth, and the seed's ground
 *  truth. Their words live client-side in homelandLessons.ts;
 *  the seed's BATTLE lesson is deliberately absent — the
 *  seed's battle shape stands stopped on a fork awaiting
 *  Nigel's word, and no key here teaches it. */
export const HOMELAND_LESSON_KEYS = [
  "party",
  "return",
  "safehex",
  "battle",
  "cast",
  "orders",
  "group",
  "warning",
  "seed",
] as const;
export type HomelandLessonKey = (typeof HOMELAND_LESSON_KEYS)[number];

/** THE GROWTH CYCLE'S SERVINGS (Nigel, 2026-10-24 19:14,
 *  ratified 19:21; built 2026-10-25): the naming CEREMONY
 *  — a short story, not a lesson, but remembered by this
 *  same once-only registry, served once at the first
 *  seed's claim — and the three GROWTH-LESSONS, one at
 *  each stage of the FIRST seed's first growth, first-
 *  trigger per Tender, only the first seed teaches: the
 *  draw and the intensity-1 defence at first entry; the
 *  widening light and attunement feeding at the Sapling;
 *  PROTECTION itself in the moment it arrives, at the
 *  Beacon. Their words live client-side (homelandLessons.ts
 *  for the lessons; Territory.tsx for the ceremony). */
export const SEED_GROWTH_KEYS = [
  "ceremony",
  "seedfeed",
  "seedsapling",
  "seedbeacon",
] as const;
export type SeedGrowthKey = (typeof SEED_GROWTH_KEYS)[number];

/** Every lesson key this registry will remember: the front
 *  screen's and the homeland's, one served set per Tender. */
export const LESSON_KEYS = [...FRONT_LESSON_KEYS, ...HOMELAND_LESSON_KEYS, ...SEED_GROWTH_KEYS] as const;

const lessonKeySchema = z.enum(LESSON_KEYS);

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

/** Every lesson key served to ANY of this request's identities. */
export async function getFrontLessonsSeen(ownerKeys: string[]): Promise<{ seen: string[] }> {
  if (!ownerKeys.length) return { seen: [] };
  const rows = await db
    .select({ lessonKey: schema.frontLessonsSeen.lessonKey })
    .from(schema.frontLessonsSeen)
    .where(inArray(schema.frontLessonsSeen.ownerKey, ownerKeys));
  return { seen: [...new Set(rows.map((r) => r.lessonKey))] };
}

/** Record a lesson as served for the primary identity.
 *  Idempotent: the (owner_key, lesson_key) primary key and the
 *  OR IGNORE insert make a second serve a no-op, never an
 *  error and never a second firing. Returns the union after. */
export async function markFrontLessonSeen(ownerKeys: string[], body: unknown): Promise<{ seen: string[] }> {
  const parsed = z.object({ lessonKey: lessonKeySchema }).safeParse(body);
  if (!parsed.success) badRequest("That is not a first-touch lesson.");
  const primary = ownerKeys[0];
  if (!primary) badRequest("No identity to remember the lesson for.");
  await db
    .insert(schema.frontLessonsSeen)
    .values({ ownerKey: primary, lessonKey: parsed.data.lessonKey, seenAt: new Date() })
    .onConflictDoNothing();
  return getFrontLessonsSeen(ownerKeys);
}
