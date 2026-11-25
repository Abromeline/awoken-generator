// THE AWOKIN BETA BUY-IN — THE DRIVE (Nigel, ruled 2026-11-25).
// A Tender buys into the tournament for $5 from the link under the
// art shop button; the buy-in hangs on their own account and the
// link then plays the game instead of selling it.
//
//   §A STATUS: no session → 403; a fresh Tender → owned:false at
//      the ruled $5.
//   §B CHECKOUT: against a mock Stripe API (STRIPE_API_BASE), the
//      session is created for the beta good with the Tender's id
//      in its metadata — and a Tender who already owns it is
//      refused a second checkout (409, after §C).
//   §C THE WEBHOOK GRANT: a wrongly-signed delivery is refused
//      (400); a properly signed checkout.session.completed with
//      the beta metadata grants exactly one entitlement row, and
//      redelivery grants no second. A pack-shaped event still
//      credits the pack ledger — the old road is unbroken.
//   §D THE PLAY DOOR: enter without the buy-in → 403; the buyer
//      enters and receives the /play-scoped cookie; /play/ serves
//      the game files to the buyer's cookie only — no cookie, a
//      stranger's session, and a non-buyer's session all meet
//      the closed door, never the game.
// Run AFTER `npm run build`:
//   node scripts/drive-awokin-beta.mjs
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-beta-"));
const PLAY_DIR = mkdtempSync(join(tmpdir(), "awoken-drive-beta-play-"));
writeFileSync(join(PLAY_DIR, "index.html"), "<!doctype html><title>Awokin</title>AWOKIN-BETA-PLAY-MARKER");
writeFileSync(join(PLAY_DIR, "index.pck"), "PCK-STUB-BYTES");
const PORT = "39981";
const STRIPE_PORT = 39982;
const BASE = `http://127.0.0.1:${PORT}`;
const WEBHOOK_SECRET = "whsec_drive_beta_secret";
const PW = "beta-drive-password";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ok -", name); }
  else { fail++; console.log("  FAIL -", name, extra); }
};

/* ── THE MOCK STRIPE API ──────────────────────────────── */
let lastCheckoutBody = "";
const mockStripe = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    if (req.url.startsWith("/v1/checkout/sessions")) {
      lastCheckoutBody = body;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "cs_test_beta_1", object: "checkout.session", url: "https://checkout.stripe.test/pay/cs_test_beta_1" }));
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "mock: not here" } }));
    }
  });
});
await new Promise((r) => mockStripe.listen(STRIPE_PORT, "127.0.0.1", r));

/* ── BOOT THE WORLD ───────────────────────────────────── */
const child = spawn("node", ["server/dist/index.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env, DATA_DIR, PORT,
    STRIPE_SECRET_KEY: "sk_test_drive_beta",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`,
    BETA_PLAY_DIR: PLAY_DIR,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
child.stdout.on("data", (d) => (bootLog += d));
child.stderr.on("data", (d) => (bootLog += d));
for (let i = 0; i < 60; i++) {
  if (child.exitCode !== null) { console.error("server exited:\n", bootLog); process.exit(1); }
  try { const r = await fetch(`${BASE}/api/health`); if (r.ok) break; } catch { /* not up */ }
  await sleep(500);
}

const db = new Database(join(DATA_DIR, "app.db"), { readonly: true });
async function call(action, args, token) {
  const res = await fetch(`${BASE}/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${JSON.stringify(data)}`);
  return data?.data ?? data;
}
async function betaStatus(token) {
  const res = await fetch(`${BASE}/api/beta/status`, { headers: token ? { "x-tender-token": token } : {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
function signWebhook(payload, secret = WEBHOOK_SECRET) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}
async function deliverWebhook(event, secret) {
  const payload = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signWebhook(payload, secret) },
    body: payload,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const buyer = await call("claimTender", { password: PW, tenderName: "Beta Buyer" });
const buyerId = db.prepare("SELECT id FROM tenders WHERE code = ?").get(buyer.tender.code).id;
const other = await call("claimTender", { password: PW, tenderName: "Beta Bystander" });

/* ── §A STATUS ────────────────────────────────────────── */
console.log("§A status");
{
  const anon = await betaStatus(null);
  ok("§A no session is refused (403)", anon.status === 403, JSON.stringify(anon));
  const fresh = await betaStatus(buyer.token);
  ok("§A a fresh Tender does not own the beta", fresh.status === 200 && fresh.data.owned === false, JSON.stringify(fresh));
  ok("§A the price is the ruled $5", fresh.data.priceCents === 500 && fresh.data.priceLabel === "$5.00", JSON.stringify(fresh.data));
}

/* ── §B CHECKOUT ──────────────────────────────────────── */
console.log("§B checkout");
{
  const res = await fetch(`${BASE}/api/beta/checkout`, {
    method: "POST", headers: { "content-type": "application/json", "x-tender-token": buyer.token }, body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  ok("§B checkout opens Stripe's page", res.status === 200 && data.url === "https://checkout.stripe.test/pay/cs_test_beta_1", JSON.stringify(data));
  const form = new URLSearchParams(lastCheckoutBody);
  ok("§B the session is the beta good at $5", form.get("line_items[0][price_data][unit_amount]") === "500"
    && (form.get("line_items[0][price_data][product_data][name]") ?? "").includes("Awokin Beta"), lastCheckoutBody.slice(0, 400));
  ok("§B the Tender's id rides in the metadata", form.get("metadata[kind]") === "awokin_beta"
    && form.get("metadata[tender_id]") === String(buyerId), lastCheckoutBody.slice(0, 400));
}

/* ── §C THE WEBHOOK GRANT ─────────────────────────────── */
console.log("§C the webhook grant");
{
  const event = {
    id: "evt_beta_1", object: "event", type: "checkout.session.completed",
    data: { object: {
      id: "cs_test_beta_1", object: "checkout.session",
      payment_status: "paid", client_reference_id: `tender:${buyerId}`,
      metadata: { kind: "awokin_beta", tender_id: String(buyerId) },
    } },
  };
  const forged = await deliverWebhook(event, "whsec_not_the_secret");
  ok("§C a wrongly-signed delivery is refused (400)", forged.status === 400, JSON.stringify(forged));
  const before = await betaStatus(buyer.token);
  ok("§C the forged delivery granted nothing", before.data.owned === false);
  const good = await deliverWebhook(event);
  ok("§C the signed delivery is accepted (200)", good.status === 200, JSON.stringify(good));
  const after = await betaStatus(buyer.token);
  ok("§C the buyer now owns the beta", after.data.owned === true, JSON.stringify(after.data));
  await deliverWebhook(event);
  const rows = db.prepare("SELECT tender_id AS t, stripe_session_id AS s FROM beta_entitlements").all();
  ok("§C redelivery grants no second row — exactly one stands",
    rows.length === 1 && rows[0].t === buyerId && rows[0].s === "cs_test_beta_1", JSON.stringify(rows));
  const packEvent = {
    id: "evt_pack_1", object: "event", type: "checkout.session.completed",
    data: { object: {
      id: "cs_test_pack_1", object: "checkout.session",
      payment_status: "paid", client_reference_id: `tender:${buyerId}`, metadata: {},
    } },
  };
  await deliverWebhook(packEvent);
  const ledger = db.prepare("SELECT reason FROM credit_ledger WHERE reference = 'cs_test_pack_1'").all();
  ok("§C a pack-shaped event still credits the pack ledger", ledger.length === 1 && ledger[0].reason === "stripe_pack", JSON.stringify(ledger));
  const again = await fetch(`${BASE}/api/beta/checkout`, {
    method: "POST", headers: { "content-type": "application/json", "x-tender-token": buyer.token }, body: "{}",
  });
  ok("§B a buyer is refused a second checkout (409)", again.status === 409, String(again.status));
}

/* ── §D THE PLAY DOOR ─────────────────────────────────── */
console.log("§D the play door");
{
  const enterOther = await fetch(`${BASE}/api/beta/enter`, {
    method: "POST", headers: { "content-type": "application/json", "x-tender-token": other.token }, body: "{}",
  });
  ok("§D a Tender without the buy-in cannot enter (403)", enterOther.status === 403, String(enterOther.status));
  const enter = await fetch(`${BASE}/api/beta/enter`, {
    method: "POST", headers: { "content-type": "application/json", "x-tender-token": buyer.token }, body: "{}",
  });
  const enterData = await enter.json().catch(() => ({}));
  const cookie = enter.headers.get("set-cookie") ?? "";
  ok("§D the buyer enters — the door is /play/", enter.status === 200 && enterData.url === "/play/", JSON.stringify(enterData));
  ok("§D the play cookie is scoped to /play/ and httpOnly",
    cookie.includes("awokin_play=") && cookie.includes("Path=/play") && cookie.includes("HttpOnly"), cookie);
  const playCookie = cookie.split(";")[0];
  const noCookie = await fetch(`${BASE}/play/`);
  const noCookieBody = await noCookie.text();
  ok("§D no cookie meets the closed door, never the game",
    noCookie.status === 403 && noCookieBody.includes("bought in") && !noCookieBody.includes("AWOKIN-BETA-PLAY-MARKER"), String(noCookie.status));
  const stranger = await fetch(`${BASE}/play/`, { headers: { cookie: `awokin_play=${other.token}` } });
  ok("§D a non-buyer's session meets the closed door", stranger.status === 403, String(stranger.status));
  const inGame = await fetch(`${BASE}/play/`, { headers: { cookie: playCookie } });
  const inGameBody = await inGame.text();
  ok("§D the buyer's cookie opens the game", inGame.status === 200 && inGameBody.includes("AWOKIN-BETA-PLAY-MARKER"), String(inGame.status));
  const pck = await fetch(`${BASE}/play/index.pck`, { headers: { cookie: playCookie } });
  ok("§D the game files ride the same door", pck.status === 200 && (await pck.text()) === "PCK-STUB-BYTES", String(pck.status));
  const pckOut = await fetch(`${BASE}/play/index.pck`);
  ok("§D the game files refuse the cookieless", pckOut.status === 403, String(pckOut.status));
}

child.kill("SIGTERM");
mockStripe.close();
await sleep(300);
console.log(`\ndrive-awokin-beta: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
