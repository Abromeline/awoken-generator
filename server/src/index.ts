import express from "express";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { blobs, DATA_DIR } from "./store.js";
import { handlers, type ActionName } from "./actions.js";
import { stripeConfig, createCheckoutSession, createPortalSession, stripeWebhookHandler } from "./stripe.js";

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
for (const name of actionNames) {
  app.post(`/api/${name}`, async (req, res) => {
    try {
      const result = await handlers[name](req.body ?? {});
      res.json(result);
    } catch (error) {
      const status = typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;
      const message = error instanceof Error ? error.message : "Something interrupted the ritual.";
      res.status(status).json({ error: message });
    }
  });
}

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
app.post("/api/stripe/checkout", (req, res) => {
  createCheckoutSession({ headers: req.headers as Record<string, string | string[] | undefined> })
    .then((result) => res.json(result))
    .catch((error: unknown) => {
      const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
      res.status(status).json({ error: error instanceof Error ? error.message : "Checkout could not begin." });
    });
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
});
