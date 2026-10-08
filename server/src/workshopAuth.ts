// Workshop lock: Nigel's friends could open the workshop, so when
// WORKSHOP_PASSWORD is set the workshop face shows a password prompt and
// every workshop API endpoint requires a token.
//
// Flow: POST /api/workshop/unlock { password } → { token, expiresAt }.
// The client keeps the token in sessionStorage and sends it as
// X-Workshop-Token. Tokens live server-side (in memory) for ~30 days.
// The Tender ritual, welcome, free wakes, lore, grove counter and Stripe
// endpoints stay public — only the workshop is gated.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { WORKSHOP_PASSWORD } from "./config.js";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days
const tokens = new Map<string, number>(); // token -> expiresAtMs

export function workshopLockEnabled(): boolean {
  return WORKSHOP_PASSWORD.length > 0;
}

function passwordsMatch(candidate: unknown): boolean {
  if (typeof candidate !== "string" || !candidate) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(candidate), digest(WORKSHOP_PASSWORD));
}

/** Trade the workshop password for a token. Wrong word → 401. */
export function unlockWorkshop(password: unknown): { token: string; expiresAt: string } {
  if (!workshopLockEnabled()) throw Object.assign(new Error("The workshop is not locked."), { status: 400 });
  if (!passwordsMatch(password)) {
    throw Object.assign(new Error("That word does not open the workshop."), { status: 401 });
  }
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  tokens.set(token, expiresAt);
  for (const [held, exp] of tokens) if (exp <= Date.now()) tokens.delete(held);
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export function workshopTokenValid(value: unknown): boolean {
  if (!workshopLockEnabled()) return true;
  if (typeof value !== "string" || !value) return false;
  const exp = tokens.get(value);
  if (!exp) return false;
  if (Date.now() > exp) {
    tokens.delete(value);
    return false;
  }
  return true;
}

/** Throw 401 unless the request carries a live workshop token. */
export function requireWorkshop(req: { headers: Record<string, string | string[] | undefined> }): void {
  if (!workshopLockEnabled()) return;
  if (!workshopTokenValid(req.headers["x-workshop-token"])) {
    throw Object.assign(new Error("The workshop is locked — speak the word to enter."), { status: 401 });
  }
}
