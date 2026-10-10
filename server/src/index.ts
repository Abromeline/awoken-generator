import express from "express";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { blobs, DATA_DIR } from "./store.js";
import { handlers, type ActionContext, type ActionName } from "./actions.js";
import { stripeConfig, createCheckoutSession, createPortalSession, stripeWebhookHandler } from "./stripe.js";
import {
  claimFreeWake, claimWelcome, getWelcomeStatus, reconstituteWelcome, seedWelcome, visitorIdFromHeader, welcomeIdentity,
} from "./welcome.js";
import { tenderFromToken, tenderOwnerKey, tenderTokenFromHeader } from "./tenders.js";
import { groveStatus, recordPlanting } from "./grove.js";
import { requireWorkshop, unlockWorkshop, workshopLockEnabled } from "./workshopAuth.js";

const app = express();
app.disable("x-powered-by");

// Stripe webhook FIRST: the signature can only be verified against the raw body.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  void stripeWebhookHandler(
    { body: req.body as Buffer, headers: req.headers as Record<string, string | string[] | undefined> },
    { status: (code: number) => ({ json: (body: unknown) => { res.status(code).json(body); } }) }
  );
});

// Base64 PNG payloads (composites, uploads) can be large.
app.use(express.json({ limit: "25mb" }));

const actionNames = Object.keys(handlers) as ActionName[];
// Everything the workshop touches but the Tender ritual doesn't: gated by
// the workshop token when WORKSHOP_PASSWORD is set.
const WORKSHOP_ACTIONS = new Set([
  "uploadLayerAsset",
  "updateLayerAssetStats",
  "renameLayerAsset",
  "deleteLayerAsset",
  "moveLayerAsset",
  "deleteAwoken",
  "getWorkshopStudio",
  "listTenders",
]);
for (const name of actionNames) {
  app.post(`/api/${name}`, async (req, res) => {
    try {
      if (WORKSHOP_ACTIONS.has(name)) requireWorkshop(req);
      const tender = await tenderFromToken(tenderTokenFromHeader(req.headers["x-tender-token"]));
      const handler = (handlers[name] as (args: unknown, ctx?: ActionContext) => Promise<unknown>).bind(handlers);
      const result = await handler(req.body ?? {}, { visitorId: visitorIdFromHeader(req.headers["x-visitor-id"]), tender });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}

function sendError(res: express.Response, error: unknown) {
  const status = typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error ? error.message : "Something interrupted the ritual.";
  res.status(status).json({ error: message });
}

/** The welcome ritual needs a Tender account (or a grandfathered soft visitor). */
async function needWelcomeIdentity(req: express.Request) {
  return welcomeIdentity(
    tenderTokenFromHeader(req.headers["x-tender-token"]),
    visitorIdFromHeader(req.headers["x-visitor-id"])
  );
}

// Welcome ritual: first-visit greeting, held-apart Awoken, 4-hourly free wakes.
// Gated to Tender accounts (soft visitors grandfathered only if welcomed).
app.get("/api/welcome", async (req, res) => {
  try { res.json(await getWelcomeStatus((await needWelcomeIdentity(req)).ownerKey)); }
  catch (error) { sendError(res, error); }
});
app.post("/api/welcome/seed", async (req, res) => {
  try { const id = await needWelcomeIdentity(req); res.json(await seedWelcome(id.ownerKey, id.ownerName, req.body ?? {})); }
  catch (error) { sendError(res, error); }
});
app.post("/api/welcome/claim", async (req, res) => {
  try { res.json(await claimWelcome((await needWelcomeIdentity(req)).ownerKey, req.body ?? {})); }
  catch (error) { sendError(res, error); }
});
app.post("/api/welcome/reconstitute", async (req, res) => {
  try { const id = await needWelcomeIdentity(req); res.json(await reconstituteWelcome(id.ownerKey, id.ownerName, req.body ?? {})); }
  catch (error) { sendError(res, error); }
});
app.post("/api/welcome/free-wake", async (req, res) => {
  try { const id = await needWelcomeIdentity(req); res.json(await claimFreeWake(id.ownerKey, id.ownerName, req.body ?? {})); }
  catch (error) { sendError(res, error); }
});

// The Grove Fund: public tally, workshop-recorded plantings.
app.get("/api/grove", async (_req, res) => {
  try { res.json(await groveStatus()); }
  catch (error) { sendError(res, error); }
});
app.post("/api/grove/record-planting", async (req, res) => {
  try { res.json(await recordPlanting(req.body ?? {})); }
  catch (error) { sendError(res, error); }
});

// Workshop lock: public status, password-for-token unlock.
app.get("/api/workshop/status", (_req, res) => res.json({ locked: workshopLockEnabled() }));
app.post("/api/workshop/unlock", async (req, res) => {
  try {
    const password = (req.body as { password?: unknown } | null)?.password;
    res.json(unlockWorkshop(password));
  } catch (error) { sendError(res, error); }
});

// Blob serving: /blobs/<base64url(logical key)> -> stored bytes.
app.get("/blobs/:b64", (req, res) => {
  try {
    const key = Buffer.from(req.params.b64, "base64url").toString("utf8");
    const found = blobs.get(key);
    if (!found) { res.status(404).json({ error: "Not found." }); return; }
    res.setHeader("Content-Type", found.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(found.bytes);
  } catch {
    res.status(400).json({ error: "Bad blob reference." });
  }
});

// Stripe: public config, checkout, and customer portal. Keys come from env;
// without them these endpoints explain what is missing (never a crash).
app.get("/api/stripe/config", (_req, res) => res.json(stripeConfig()));
app.post("/api/stripe/checkout", async (req, res) => {
  try {
    const tender = await tenderFromToken(tenderTokenFromHeader(req.headers["x-tender-token"]));
    if (!tender) throw Object.assign(new Error("Claim your secret code to gather wakes."), { status: 403 });
    const result = await createCheckoutSession({
      headers: req.headers as Record<string, string | string[] | undefined>,
      visitorId: tenderOwnerKey(tender.id),
    });
    res.json(result);
  } catch (error) {
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status: number }).status : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "Checkout could not begin." });
  }
});
app.post("/api/stripe/portal", (req, res) => {
  createPortalSession({ headers: req.headers as Record<string, string | string[] | undefined> })
    .then((result) => res.json(result))
    .catch((error: unknown) => {
      const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
      res.status(status).json({ error: error instanceof Error ? error.message : "The portal could not be opened." });
    });
});

app.get("/api/health", (_req, res) => res.json({ ok: true, dataDir: DATA_DIR }));

// Static client bundle (built by `npm run build:client` into client/dist).
const clientDist = resolve(process.cwd(), "client", "dist");
if (existsSync(join(clientDist, "index.html"))) {
  app.use(express.static(clientDist, { maxAge: "1d", index: false }));
  app.get("*", (_req, res) => res.sendFile(join(clientDist, "index.html")));
} else {
  app.get("/", (_req, res) => res.status(503).json({ error: "Client not built. Run `npm run build:client` first." }));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Awoken Generator (standalone) listening on :${port}`);
  console.log(`Data directory: ${DATA_DIR}`);
  if (workshopLockEnabled()) {
    console.log("[workshop] locked — the workshop face and its tools require the workshop password.");
  } else {
    console.warn(
      "[workshop] WARNING: WORKSHOP_PASSWORD is not set — the workshop face and its tools are OPEN to anyone with the URL. " +
      "Set WORKSHOP_PASSWORD in the environment (Railway variables) to lock it."
    );
  }
});
