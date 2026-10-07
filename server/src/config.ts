// Pricing + Stripe configuration. Everything comes from the environment;
// nothing here is secret and nothing here may invent account details.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** $5.00 = 20 wakes → $0.25 per wake. Configurable; Nigel sets the numbers. */
export const PACK_PRICE_CENTS = intEnv("PACK_PRICE_CENTS", 500);
export const CREDITS_PER_PACK = intEnv("CREDITS_PER_PACK", 20);
export const PRICE_PER_WAKE_CENTS = intEnv("PRICE_PER_WAKE_CENTS", 25);

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
/** Public base URL of this deployment, used for Stripe success/cancel redirects. */
export const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");

/**
 * Test mode only, always. A live key is refused outright — selling real
 * wakes requires Nigel's explicit go-ahead, never an accident.
 */
export function stripeTestKey(): string | null {
  if (!STRIPE_SECRET_KEY) return null;
  if (!STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    console.error("[stripe] Refusing non-test secret key. Test mode only.");
    return null;
  }
  return STRIPE_SECRET_KEY;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
