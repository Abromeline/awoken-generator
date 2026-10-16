import express from "express";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { blobs, DATA_DIR } from "./store.js";
import { handlers, reconcileXpRecurve, reconcileStatEvery3, type ActionContext, type ActionName } from "./actions.js";
import { stripeConfig, createCheckoutSession, createPortalSession, stripeWebhookHandler } from "./stripe.js";
import {
  claimFreeWake, claimWelcome, getWelcomeStatus, reconstituteWelcome, seedWelcome, visitorIdFromHeader, welcomeIdentity,
} from "./welcome.js";
import { tenderFromToken, tenderOwnerKey, tenderTokenFromHeader } from "./tenders.js";
import { groveStatus, recordPlanting } from "./grove.js";
import { requireWorkshop, unlockWorkshop, workshopLockEnabled, workshopTokenValid } from "./workshopAuth.js";
import { registerTableRoutes, registerTableSocket, tableDoorMode } from "./table.js";

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
  "uploadTerrainArt",
  "deleteTerrainArt",
  "updateLayerAssetStats",
  "updateLayerAssetElement",
  "renameLayerAsset",
  "deleteLayerAsset",
  "moveLayerAsset",
  "deleteAwoken",
  "cleanDeckCards",
  "getWorkshopStudio",
  "listTenders",
  "adminResetTender",
  "adminRefillAllEnergy",
  "adminResetWorldTiles",
  "adminSetEnergy",
  "adminSetWave",
  "adminGetTenderDeck",
  "adminClearTimers",
  "adminGiftWake",
  "adminMintWakeCodes",
  "adminListWakeCodes",
  "adminRevokeWakeCode",
  "adminGrantAspectPoints",
  "setUiConfig",
  "updateUITheme",
  "uploadUiSprite",
  "deleteUiSprite",
  "setEnemySpriteSelection",
  "addCompendiumEntry",
  "updateCompendiumEntry",
  "deleteCompendiumEntry",
  "importCompendium",
  "setSiteColor",
  "adminResetTenderPassword",
  "saveGlyph",
  "deleteGlyph",
  "updateLayerAssetRarity",
  "addBattleTrack",
  "toggleBattleTrack",
  "deleteBattleTrack",
  "updateTrackPages",
  "assignRandomAspects",
  "adminResetTenderPassword",
  "listFeedback",
  "pinFeedback",
  "replyFeedback",
  "deleteFeedback",
]);
for (const name of actionNames) {
  app.post(`/api/${name}`, async (req, res) => {
    try {
      if (WORKSHOP_ACTIONS.has(name)) requireWorkshop(req);
      const tenderToken = tenderTokenFromHeader(req.headers["x-tender-token"]);
      const tender = await tenderFromToken(tenderToken);
      const handler = (handlers[name] as (args: unknown, ctx?: ActionContext) => Promise<unknown>).bind(handlers);
      const result = await handler(req.body ?? {}, {
        visitorId: visitorIdFromHeader(req.headers["x-visitor-id"]),
        tender,
        tenderToken,
        // Resolved here (not in WORKSHOP_ACTIONS) so mixed public/workshop
        // handlers like saveAwoken can gate their own workshop branch.
        workshopAuthorized: workshopTokenValid(req.headers["x-workshop-token"]),
      });
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
  try { requireWorkshop(req); res.json(await recordPlanting(req.body ?? {})); }
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
app.post("/api/stripe/portal", async (req, res) => {
  try {
    // Same gate as checkout: the portal opens the customer's billing
    // surface, so it requires a Tender session — never an open door.
    const tender = await tenderFromToken(tenderTokenFromHeader(req.headers["x-tender-token"]));
    if (!tender) throw Object.assign(new Error("Claim your secret code to manage your wakes."), { status: 403 });
    const result = await createPortalSession({ headers: req.headers as Record<string, string | string[] | undefined> });
    res.json(result);
  } catch (error) {
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status: number }).status : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "The portal could not be opened." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, dataDir: DATA_DIR }));

// THE TABLE (Discord Activity): config + sign-in routes — registered
// before the static bundle below, whose SPA fallback would otherwise
// answer /api/table/* with index.html. The room socket mounts after
// listen (registerTableSocket, at the foot of this file).
registerTableRoutes(app);

// Legal pages — Discord requires a public Privacy Policy and Terms of
// Service for the Activity's application. Plain pages, served before
// the SPA fallback so /privacy and /terms are truly themselves.
app.get("/privacy", (_req, res) => res.sendFile(resolve(process.cwd(), "server", "public", "legal", "privacy.html")));
app.get("/terms", (_req, res) => res.sendFile(resolve(process.cwd(), "server", "public", "legal", "terms.html")));

// Static client bundle (built by `npm run build:client` into client/dist).
const clientDist = resolve(process.cwd(), "client", "dist");
if (existsSync(join(clientDist, "index.html"))) {
  app.use("/music", express.static("server/public/music", { maxAge: "7d" }));
  app.use(express.static(clientDist, { maxAge: "1d", index: false }));
  // THE TABLE (Discord Activity) has its own page; every other path is
  // the Awoken app. Discord launches an Activity at the app's URL root
  // with ?frame_id=… in the query — that marker is the Table's door at
  // the root, so the standard root URL mapping opens the room while
  // the plain site root serves the Awoken app as ever.
  app.get("/table", (_req, res) => {
    const page = join(clientDist, tableDoorMode() === "control" ? "control.html" : "table.html");
    res.sendFile(existsSync(page) ? page : join(clientDist, "index.html"));
  });
  app.get("/", (req, res) => {
    const page = join(clientDist, tableDoorMode() === "control" ? "control.html" : "table.html");
    if (req.query.frame_id && existsSync(page)) res.sendFile(page);
    else res.sendFile(join(clientDist, "index.html"));
  });
  app.get("*", (_req, res) => res.sendFile(join(clientDist, "index.html")));
} else {
  app.get("/", (_req, res) => res.status(503).json({ error: "Client not built. Run `npm run build:client` first." }));
}

// One-time XP re-curve reconciliation (2026-10-13): before serving, make
// sure every Awoken already holds the stat points and milestone deeds the
// gentler curve says it crossed. Idempotent; a failure logs and leaves the
// flag unset so the next boot retries.
try {
  await reconcileXpRecurve();
} catch (err) {
  console.error("[xp] re-curve reconciliation failed; will retry next boot:", err);
}

// Stat-point cadence reconciliation (2026-10-14): every-3-levels top-up for
// Awoken who leveled under the old 1-per-10 law. Idempotent; failure leaves
// the flag unset so the next boot retries.
try {
  await reconcileStatEvery3();
} catch (err) {
  console.error("[xp] stat-cadence reconciliation failed; will retry next boot:", err);
}

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
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

// THE TABLE (Discord Activity): the room socket rides the same server
// — same roof, same database (design §6).
registerTableSocket(server);
