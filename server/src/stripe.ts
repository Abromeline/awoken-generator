// Stripe in TEST MODE ONLY. Checkout sells one thing — the wake pack —
// the webhook credits the ledger, and the portal manages payment methods.
// Nothing here invents account details; every key comes from the environment.
import Stripe from "stripe";
import { createHash, createHmac } from "node:crypto";
import {
  CREDITS_PER_PACK,
  PACK_PRICE_CENTS,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET,
  APP_URL,
  formatUsd,
  stripeSecretKey,
  stripeLiveMode,
} from "./config.js";
import { alreadyCredited, grantCredits, SINGLE_OWNER } from "./credits.js";
import { groveAccrue } from "./grove.js";
import { GROVE_PER_PACK_CENTS } from "./config.js";
import { db, eq, schema } from "./store.js";

let stripe: Stripe | null = null;

export function stripeReady(): boolean {
  return stripeSecretKey() !== null;
}

function client(): Stripe | null {
  const key = stripeSecretKey();
  if (!key) return null;
  if (!stripe) {
    // STRIPE_API_BASE exists so tests can point the client at a local mock
    // Stripe API; unset in production, where api.stripe.com is used.
    const base = process.env.STRIPE_API_BASE;
    if (base) {
      const u = new URL(base);
      stripe = new Stripe(key, {
        protocol: u.protocol === "http:" ? "http" : "https",
        host: u.hostname,
        port: u.port || undefined,
      });
    } else {
      stripe = new Stripe(key);
    }
  }
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
    testMode: !stripeLiveMode(),
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
  let session: Stripe.Checkout.Session | null = null;
  try {
    const event = s.webhooks.constructEvent(req.body, signature, secret);
    if (event.type === "checkout.session.completed") {
      session = event.data.object as Stripe.Checkout.Session;
    }
  } catch (err) {
    // Thin payloads (v2 event destinations - what the current Stripe
    // dashboard creates) are rejected by constructEvent on shape alone,
    // before signature verification runs. They verify through
    // parseEventNotification instead and carry only a reference, so the
    // full checkout session is fetched from Stripe before any crediting.
    // (Found live 2026-10-13: the secret was right all along - the two
    // signature prefixes in the diagnostic line matched - while every
    // delivery failed on this shape check.)
    let thinHandled = false;
    if (err instanceof Error && /thin event/i.test(err.message)) {
      try {
        const notification = s.parseEventNotification(req.body, signature, secret);
        // Thin notifications spell v1 event types with a "v1." prefix
        // ("v1.checkout.session.completed"); accept either spelling.
        if (notification.type.replace(/^v1\./, "") === "checkout.session.completed") {
          // Not every notification type carries a related object, so the
          // method is absent from parts of the SDK's union type.
          const fetchRelated = (notification as { fetchRelatedObject?: () => Promise<unknown> }).fetchRelatedObject;
          const related = fetchRelated ? ((await fetchRelated()) as unknown as Stripe.Checkout.Session | null) : null;
          if (!related) throw new Error("thin event carried no related object");
          session = related;
        }
        thinHandled = true;
      } catch (thinErr) {
        console.error(
          "[stripe-webhook] thin event handling failed:",
          thinErr instanceof Error ? thinErr.message.replace(/\s*\n\s*/g, " ") : String(thinErr)
        );
        res.status(400).json({ error: "Stripe signature verification failed." });
        return;
      }
    }
    if (!thinHandled) {
    // Diagnostics (2026-10-13): a live delivery kept failing verification
    // while the secret looked right everywhere. Log only non-secret facts:
    // the verification error, our secret's length + SHA-256 fingerprint
    // prefix, and the first chars of Stripe's v1 signature vs the HMAC our
    // secret computes over the same payload. If the two v1 prefixes match,
    // the secret is right and the failure is the timestamp tolerance; if
    // they differ, the secret the app holds is not the one signing.
    try {
      const fp = createHash("sha256").update(secret).digest("hex").slice(0, 10);
      const tMatch = /(?:^|,)t=(\d+)/.exec(signature);
      const v1Match = /(?:^|,)v1=([0-9a-f]+)/.exec(signature);
      let expected = "n/a";
      if (tMatch) {
        expected = createHmac("sha256", secret)
          .update(Buffer.concat([Buffer.from(tMatch[1] + "."), req.body]))
          .digest("hex")
          .slice(0, 12);
      }
      console.error(
        "[stripe-webhook] verify failed:",
        err instanceof Error ? err.message.replace(/\s*\n\s*/g, " ") : String(err),
        "| secret_len=" + secret.length,
        "secret_fp=" + fp,
        "| sig_t=" + (tMatch ? tMatch[1] : "none"),
        "sig_v1=" + (v1Match ? v1Match[1].slice(0, 12) : "none"),
        "expected_v1=" + expected,
        "| body_len=" + req.body.length,
        "now=" + Math.floor(Date.now() / 1000)
      );
    } catch { /* diagnostics must never break the handler */ }
    res.status(400).json({ error: "Stripe signature verification failed." });
    return;
    }
  }
  if (session) {
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
