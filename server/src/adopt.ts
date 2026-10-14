// Claim adoption: moving a soft visitor's WHOLE state onto a Tender account.
//
// The original claim migration (in tenders.ts) carried only the credit
// ledger and any waiting welcome across — every other owner-scoped table
// kept the browser's soft visitor id, so a freshly claimed account woke to
// an empty deck and no land, and the visitor's Awoken, territory, decks and
// attunement were stranded under the old UUID. Nothing was ever deleted;
// the state was simply keyed to an identity nobody was looking at anymore.
//
// adoptVisitorState re-keys that state. It is used by claimTender (so
// future claims adopt everything) and by the Tender-face studio load as a
// self-heal (so accounts claimed before adoption existed — or claimed on a
// different device than the one holding the visitor state — are repaired
// the next time they visit from the browser that holds it).
//
// Safety, above all: adoption only ever runs when the Tender owns ZERO
// Awoken of their own and the visitor actually holds an Awoken or a tile
// of land. Two real accounts can therefore never be merged. Adoption never
// grants credits and never touches grantCredits — it only re-keys and
// merges rows that already exist — and it never deletes the soft visitor
// row, which stays dormant so the same browser cannot re-trigger a fresh
// welcome later.
//
// There is no transaction wrapper (the codebase uses none); instead the
// steps are ordered so a partial failure is safe to re-run: every step is
// conditional on the visitor still holding the rows it moves, and the
// awakened re-key — the one the guard counts — runs last.

import { eq, sql } from "drizzle-orm";
import { db, schema, sqlite } from "./store.js";

async function countAwakened(ownerKey: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.awakened)
    .where(eq(schema.awakened.ownerKey, ownerKey));
  return rows[0]?.count ?? 0;
}

async function countTiles(ownerKey: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.territoryTiles)
    .where(eq(schema.territoryTiles.ownerKey, ownerKey));
  return rows[0]?.count ?? 0;
}

/**
 * Re-key all of a soft visitor's owner-scoped state onto a Tender owner key
 * (`tender:<id>`). Returns true when adoption ran, false when it was
 * refused or there was nothing to adopt.
 */
export async function adoptVisitorState(softVisitorId: string, ownerKey: string): Promise<boolean> {
  // Identity sanity: adoption moves a SOFT VISITOR's state INTO a Tender
  // account. Never from another Tender key, never into a non-Tender key,
  // never onto itself.
  if (!softVisitorId || !ownerKey || softVisitorId === ownerKey) return false;
  if (!/^tender:\d+$/.test(ownerKey) || /^tender:\d+$/.test(softVisitorId)) {
    console.log(`[adopt] refused: ${softVisitorId} -> ${ownerKey} is not a visitor-to-Tender adoption.`);
    return false;
  }

  // --- Safety guard: the Tender must be a fresh shell (no Awoken of
  // their own), and the visitor must actually hold something worth
  // adopting (an Awoken or a tile of land). The visitor side is checked
  // first and silently: the studio self-heal calls this on every load,
  // and a browser whose visitor holds nothing is the ordinary case, not
  // a refused merge. The refusal is only logged when there was real
  // state to merge and the guard stopped it. ---
  if ((await countAwakened(softVisitorId)) === 0 && (await countTiles(softVisitorId)) === 0) {
    return false; // Nothing to adopt — not a refusal, just an empty visitor.
  }
  if ((await countAwakened(ownerKey)) > 0) {
    console.log(`[adopt] skipped: ${ownerKey} already owns Awoken; refusing to merge ${softVisitorId} into a lived-in account.`);
    return false;
  }

  // --- Safety stop: attunement is earned progress measured two ways
  // (points and lifetime gains). If the Tender has any of their own, the
  // two pools cannot be honestly combined — abort the whole adoption. ---
  const tenderAttunement = await db
    .select()
    .from(schema.aspectAttunement)
    .where(eq(schema.aspectAttunement.ownerKey, ownerKey));
  if (tenderAttunement.some((row) => row.points > 0 || row.lifetimeGains > 0)) {
    console.log(`[adopt] aborted: ${ownerKey} has attunement progress of its own; ${softVisitorId} left untouched.`);
    return false;
  }

  // --- Singleton / keyed-merge tables: the visitor's state wins. Any
  // shell row the fresh Tender already picked up is removed first, then
  // the visitor's row is re-keyed. Each step is conditional on the
  // visitor still holding its row, so re-runs are no-ops. ---

  const visitorWave = await db.select().from(schema.waveState).where(eq(schema.waveState.ownerKey, softVisitorId)).limit(1);
  if (visitorWave[0]) {
    await db.delete(schema.waveState).where(eq(schema.waveState.ownerKey, ownerKey));
    await db.update(schema.waveState).set({ ownerKey }).where(eq(schema.waveState.ownerKey, softVisitorId));
  }

  const visitorResources = await db.select().from(schema.tenderResources).where(eq(schema.tenderResources.ownerKey, softVisitorId)).limit(1);
  if (visitorResources[0]) {
    await db.delete(schema.tenderResources).where(eq(schema.tenderResources.ownerKey, ownerKey));
    await db.update(schema.tenderResources).set({ ownerKey }).where(eq(schema.tenderResources.ownerKey, softVisitorId));
  }

  // Territory: only replaced when the visitor holds land of their own;
  // a visitor with Awoken but no tiles leaves the Tender's fresh genesis
  // tiles exactly as they are.
  if ((await countTiles(softVisitorId)) > 0) {
    await db.delete(schema.territoryTiles).where(eq(schema.territoryTiles.ownerKey, ownerKey));
    await db.update(schema.territoryTiles).set({ ownerKey }).where(eq(schema.territoryTiles.ownerKey, softVisitorId));
  }

  // Attunement (PK owner+element): the Tender's rows are all-zero shells
  // (anything more aborted above), so they give way to the visitor's.
  const visitorAttunement = await db.select().from(schema.aspectAttunement).where(eq(schema.aspectAttunement.ownerKey, softVisitorId));
  if (visitorAttunement.length) {
    await db.delete(schema.aspectAttunement).where(eq(schema.aspectAttunement.ownerKey, ownerKey));
    await db.update(schema.aspectAttunement).set({ ownerKey }).where(eq(schema.aspectAttunement.ownerKey, softVisitorId));
  }

  // Champion (PK owner): same treatment — the visitor's champion wins.
  const visitorChampion = await db.select().from(schema.tenderChampions).where(eq(schema.tenderChampions.ownerKey, softVisitorId)).limit(1);
  if (visitorChampion[0]) {
    await db.delete(schema.tenderChampions).where(eq(schema.tenderChampions.ownerKey, ownerKey));
    await db.update(schema.tenderChampions).set({ ownerKey }).where(eq(schema.tenderChampions.ownerKey, softVisitorId));
  }

  // Timed-birth clock (tender_births, PK owner_key): a raw-DDL table
  // with no drizzle schema object, so it moves by raw SQL — same rule,
  // the visitor's clock wins over any shell row the Tender picked up.
  const visitorBirth = sqlite.prepare("SELECT owner_key FROM tender_births WHERE owner_key = ?").get(softVisitorId);
  if (visitorBirth) {
    sqlite.prepare("DELETE FROM tender_births WHERE owner_key = ?").run(ownerKey);
    sqlite.prepare("UPDATE tender_births SET owner_key = ? WHERE owner_key = ?").run(ownerKey, softVisitorId);
  }

  // Pending newborn claims (raw-DDL, owner_key): an earned-but-ungathered
  // newborn follows its owner across the claim like everything else —
  // claims are additive, so both sides' rows simply re-key.
  sqlite.prepare("UPDATE pending_newborn_claims SET owner_key = ? WHERE owner_key = ?").run(ownerKey, softVisitorId);

  // --- Plain re-keys: every other table keyed by the visitor identity.
  // (deck_cards follow their decks by id; confluence_twins belong to a
  // session, not an owner; awoken_stories key the numeric tender id,
  // which a soft visitor never has.) ---
  await db.update(schema.awokenLegends).set({ ownerKey }).where(eq(schema.awokenLegends.ownerKey, softVisitorId));
  await db.update(schema.confluenceRoster).set({ ownerKey }).where(eq(schema.confluenceRoster.ownerKey, softVisitorId));
  await db.update(schema.confluenceSessions).set({ hostKey: ownerKey }).where(eq(schema.confluenceSessions.hostKey, softVisitorId));
  await db.update(schema.confluenceSessions).set({ guestKey: ownerKey }).where(eq(schema.confluenceSessions.guestKey, softVisitorId));
  await db.update(schema.creatorGifts).set({ ownerKey }).where(eq(schema.creatorGifts.ownerKey, softVisitorId));
  await db.update(schema.decks).set({ ownerKey }).where(eq(schema.decks.ownerKey, softVisitorId));
  await db.update(schema.aspectInventory).set({ ownerKey }).where(eq(schema.aspectInventory.ownerKey, softVisitorId));
  await db.update(schema.fieldPlacements).set({ ownerKey }).where(eq(schema.fieldPlacements.ownerKey, softVisitorId));
  await db.update(schema.territoryBuildings).set({ ownerKey }).where(eq(schema.territoryBuildings.ownerKey, softVisitorId));
  await db.update(schema.hallResidents).set({ ownerKey }).where(eq(schema.hallResidents.ownerKey, softVisitorId));
  await db.update(schema.feedbackMessages).set({ ownerKey }).where(eq(schema.feedbackMessages.ownerKey, softVisitorId));
  await db.update(schema.friendships).set({ requesterKey: ownerKey }).where(eq(schema.friendships.requesterKey, softVisitorId));
  await db.update(schema.friendships).set({ addresseeKey: ownerKey }).where(eq(schema.friendships.addresseeKey, softVisitorId));
  await db.update(schema.friendMessages).set({ senderKey: ownerKey }).where(eq(schema.friendMessages.senderKey, softVisitorId));
  await db.update(schema.friendMessages).set({ receiverKey: ownerKey }).where(eq(schema.friendMessages.receiverKey, softVisitorId));
  await db.update(schema.referralCodes).set({ inviterKey: ownerKey }).where(eq(schema.referralCodes.inviterKey, softVisitorId));
  await db.update(schema.creditLedger).set({ userId: ownerKey }).where(eq(schema.creditLedger.userId, softVisitorId));
  await db.update(schema.pendingWelcomes).set({ visitorId: ownerKey }).where(eq(schema.pendingWelcomes.visitorId, softVisitorId));

  // The Awoken themselves move LAST: the guard counts them, so moving
  // them any earlier would make a re-run after a partial failure refuse
  // to finish the job.
  await db.update(schema.awakened).set({ ownerKey }).where(eq(schema.awakened.ownerKey, softVisitorId));

  // --- Welcome state: give the Tender a visitors row carrying the soft
  // visitor's welcome progress, if it has none yet. The soft row itself
  // is never deleted — it stays dormant so logging out later cannot
  // re-trigger a fresh welcome for the same browser. ---
  const softRow = (await db.select().from(schema.visitors).where(eq(schema.visitors.visitorId, softVisitorId)).limit(1))[0];
  if (softRow) {
    const destRow = await db.select({ visitorId: schema.visitors.visitorId }).from(schema.visitors).where(eq(schema.visitors.visitorId, ownerKey)).limit(1);
    if (!destRow[0]) {
      await db.insert(schema.visitors).values({
        visitorId: ownerKey,
        createdAt: softRow.createdAt,
        welcomeWakesGranted: softRow.welcomeWakesGranted,
        welcomeClaimed: softRow.welcomeClaimed,
        lastFreeWakeAt: softRow.lastFreeWakeAt,
      });
    }
  }

  console.log(`[adopt] ${softVisitorId} adopted by ${ownerKey}: Awoken, land, and progress re-keyed.`);
  return true;
}
