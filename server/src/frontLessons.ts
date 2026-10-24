// THE WHISPER'S FRONT-SCREEN LESSON REGISTRY (Nigel, 2026-10-23
// 23:23 — "We need the whisper to give a tutorial of the front
// screen, to tell people what the buttons mean"; the shape law
// 23:37 — each system carries its OWN short lesson, fired ONCE
// at that system's first touch, and never again).
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

const lessonKeySchema = z.enum(FRONT_LESSON_KEYS);

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
  if (!parsed.success) badRequest("That is not a front-screen lesson.");
  const primary = ownerKeys[0];
  if (!primary) badRequest("No identity to remember the lesson for.");
  await db
    .insert(schema.frontLessonsSeen)
    .values({ ownerKey: primary, lessonKey: parsed.data.lessonKey, seenAt: new Date() })
    .onConflictDoNothing();
  return getFrontLessonsSeen(ownerKeys);
}
