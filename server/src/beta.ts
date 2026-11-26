// THE AWOKIN BETA (Nigel, ruled 2026-11-25): a Tender buys into the
// tournament for $5 from the link under the art shop button on their
// home screen. The buy-in hangs on the Tender's own account — one
// entitlement row, granted by the Stripe webhook — and once it
// stands, the same link plays the game instead of selling it.
//
// The play door: the Godot web build lives outside the repo
// (BETA_PLAY_DIR) and is served under /play/ only to a buyer. The
// buyer's own Tender session token rides in an httpOnly cookie
// scoped to /play/, and every file request re-reads the session
// and the entitlement from the database — a stepped-away Tender's
// door closes with their session, and no row means no game.
import { db, eq, schema, sqlite } from "./store.js";
import { tenderFromToken, tenderTokenFromHeader, type TenderRow } from "./tenders.js";

export const PLAY_COOKIE = "awokin_play";

export async function betaOwned(tenderId: number): Promise<boolean> {
  const rows = await db
    .select({ tenderId: schema.betaEntitlements.tenderId })
    .from(schema.betaEntitlements)
    .where(eq(schema.betaEntitlements.tenderId, tenderId))
    .limit(1);
  return rows.length > 0;
}

/** The webhook's grant. The session id is unique and the insert is
 *  conflict-quiet, so a redelivered webhook grants exactly once. */
export async function grantBeta(tenderId: number, stripeSessionId: string): Promise<void> {
  await db
    .insert(schema.betaEntitlements)
    .values({ tenderId, stripeSessionId })
    .onConflictDoNothing();
}

/** A typed code, forgiven its dress: case, dashes and spaces are
 *  presentation, so they are stripped before the lookup. */
export function normalizeBetaCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Redeem a one-time code (Nigel, ruled 2026-11-25 — a batch of
 *  one-time codes, one per person). The claim and the grant land
 *  in one transaction: the code flips to spent only while it is
 *  still unspent, and the entitlement it grants names its road
 *  ("code:…") in the session-id column. Returns false for an
 *  unknown or already-spent code alike — the door does not say
 *  which. The caller refuses owners first, so redeeming while
 *  already in never spends a code. */
export function redeemBetaCode(tenderId: number, rawCode: string): boolean {
  const code = normalizeBetaCode(rawCode);
  if (code.length < 4) return false;
  const claim = sqlite.transaction((): boolean => {
    const now = Date.now();
    const upd = sqlite
      .prepare("UPDATE beta_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ? AND redeemed_by IS NULL")
      .run(tenderId, now, code);
    if (upd.changes !== 1) return false;
    sqlite
      .prepare("INSERT INTO beta_entitlements (tender_id, stripe_session_id, purchased_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .run(tenderId, `code:${code}`, now);
    return true;
  });
  return claim();
}

function playCookieToken(cookieHeader: unknown): string | null {
  if (typeof cookieHeader !== "string") return null;
  for (const part of cookieHeader.split(";")) {
    const eqAt = part.indexOf("=");
    if (eqAt < 0) continue;
    if (part.slice(0, eqAt).trim() === PLAY_COOKIE) {
      return tenderTokenFromHeader(part.slice(eqAt + 1).trim());
    }
  }
  return null;
}

/** The buyer behind a /play/ request, or null: their session must
 *  be alive and their buy-in must stand. */
export async function tenderFromPlayCookie(cookieHeader: unknown): Promise<TenderRow | null> {
  const token = playCookieToken(cookieHeader);
  if (!token) return null;
  const tender = await tenderFromToken(token);
  if (!tender) return null;
  return (await betaOwned(tender.id)) ? tender : null;
}
