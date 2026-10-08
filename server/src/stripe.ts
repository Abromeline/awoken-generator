// Stripe in TEST MODE ONLY. Checkout sells one thing — the wake pack —
// the webhook credits the ledger, and the portal manages payment methods.
// Nothing here invents account details; every key comes from the environment.
import Stripe from "stripe";
import {
  CREDITS_PER_PACK,
  PACK_PRICE_CENTS,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET,
  APP_URL,
  formatUsd,
  stripeTestKey,
} from "./config.js";
import { alreadyCredited, grantCredits, SINGLE_OWNER } from "./credits.js";
import { groveAccrue } from "./grove.js";
import { GROVE_PER_PACK_CENTS } from "./config.js";
import { db, eq, schema } from "./store.js";

let stripe: Stripe | null = null;

export function stripeReady(): boolean {
  return stripeTestKey() !== null;
}

function client(): Stripe | null {
  const key = stripeTestKey();
  if (!key) return null;
  if (!stripe) stripe = new Stripe(key);
  return stripe;
}

function baseUrl(req: { headers: Record<string, string | string[] | undefined>; get?: (h: string) => string }): string {
  if (APP_URL) return APP_URL;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export function stripeConfig() {
  return {
    configured: stripeReady(),
    testMode: true,
    publishableKey: STRIPE_PUBLISHABLE_KEY || null,
    packPriceCents: PACK_PRICE_CENTS,
    creditsPerPack: CREDITS_PER_PACK,
    packPriceLabel: formatUsd(PACK_PRICE_CENTS),
  };
}

export async function createCheckoutSession(req: {
  headers: Record<string, string | string[] | undefined>;
  visitorId?: string | null;
}): Promise<{ url: string }> {
  const s = client();
  if (!s) throw Object.assign(new Error("Payments are not configured yet — add your Stripe test keys to .env."), { status: 503 });
  // The buying visitor's mark rides along so the webhook credits the right
  // ledger (per-visitor balances); falls back to the single owner for old clients.
  const owner = req.visitorId ?? SINGLE_OWNER;
  const session = await s.checkout.sessions.create({
    mode: "payment",
    client_reference_id: owner,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: PACK_PRICE_CENTS,
          product_data: { name: `Awoken wake pack — ${CREDITS_PER_PACK} wakes` },
        },
        quantity: 1,
      },
    ],
    metadata: { user_id: owner, credits: String(CREDITS_PER_PACK) },
    success_url: `${baseUrl(req)}/?wakes=welcome`,
    cancel_url: `${baseUrl(req)}/?wakes=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout page.");
  return { url: session.url };
}

async function getOrCreateCustomer(s: Stripe): Promise<string> {
  const existing = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "stripe_customer_id")).limit(1);
  if (existing[0]?.value) return existing[0].value;
  const customer = await s.customers.create({ metadata: { user_id: SINGLE_OWNER }, description: "Awoken Tender (single-owner playtest)" });
  await db.insert(schema.settings).values({ key: "stripe_customer_id", value: customer.id }).onConflictDoNothing();
  return customer.id;
}

export async function createPortalSession(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<{ url: string }> {
  const s = client();
  if (!s) throw Object.assign(new Error("Payments are not configured yet — add your Stripe test keys to .env."), { status: 503 });
  const customerId = await getOrCreateCustomer(s);
  const session = await s.billingPortal.sessions.create({ customer: customerId, return_url: baseUrl(req) });
  return { url: session.url };
}

/**
 * Express handler for POST /api/stripe/webhook. Must be mounted with
 * express.raw({ type: "application/json" }) — the signature cannot be
 * verified once the body is parsed.
 */
export async function stripeWebhookHandler(req: { body: Buffer; headers: Record<string, string | string[] | undefined> }, res: {
  status: (code: number) => { json: (body: unknown) => void };
}): Promise<void> {
  const s = client();
  const secret = STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) {
    res.status(503).json({ error: "Payments are not configured yet." });
    return;
  }
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    res.status(400).json({ error: "Missing Stripe signature." });
    return;
  }
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(req.body, signature, secret);
  } catch {
    res.status(400).json({ error: "Stripe signature verification failed." });
    return;
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const buyer = typeof session.client_reference_id === "string" && session.client_reference_id
      ? session.client_reference_id
      : SINGLE_OWNER;
    if (session.payment_status === "paid" && !(await alreadyCredited(session.id))) {
      await grantCredits(buyer, CREDITS_PER_PACK, "stripe_pack", session.id);
      // The Grove Fund: a share of every pack accrues toward native trees.
      await groveAccrue(GROVE_PER_PACK_CENTS);
    }
  }
  res.status(200).json({ received: true });
}
