// test43 — THE DECK'S ASPECT BUTTONS (Nigel, 2026-10-18): in My
// Deck the card dots weave and deepen aspects for attunement
// points. Proven here against the real API on a scratch server:
// the ladder price (weave 1st/2nd/3rd aspect = 1/2/3 points of the
// element woven); a short pool refuses and spends nothing; the
// FIRST pick may be any element and SEALS the Awokin — a woven or
// stored aspect of another element is refused after, and the seal
// is per-Awokin; the stack caps at three; deepening a worn aspect
// still climbs the ladder; and applyAspect's add-to-upgrade (a
// stored piece of a worn element raises it) survives the seal,
// because deepening a worn aspect is not a new pick.
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_DIR = mkdtempSync(join(tmpdir(), "awoken-test43-"));
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = "39961";
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await import("../server/dist/index.js");
await sleep(2500);

const db = new Database(join(DATA_DIR, "app.db"));
const now = Date.now();

async function api(action, args, token) {
  const res = await fetch(`http://127.0.0.1:39961/api/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-tender-token": token } : {}) },
    body: JSON.stringify(args ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const errText = (r) => String(r.data?.error ?? r.data?.message ?? "");

// ── A tender ─────────────────────────────────────────────────
const claim = await api("claimTender", { password: "test-password-1", tenderName: "Dot Tester" });
check("tender claimed", claim.status === 200 && !!claim.data.token, JSON.stringify(claim.data).slice(0, 120));
const token = claim.data.token;
const tenderId = db.prepare("SELECT id FROM tenders WHERE tender_name = 'Dot Tester'").get().id;
const ownerKey = `tender:${tenderId}`;

// ── Stock the pool of pieces (direct seed; the scratch world
// starts empty by design) ────────────────────────────────────
const insAsset = db.prepare("INSERT INTO layer_assets (name, category, rarity, power, toughness, element, image_blob_key, mime_type, created_at) VALUES (?, ?, 'common', ?, ?, ?, ?, 'image/png', ?)");
const bodyId = Number(insAsset.run("Test Body", "body", 2, 2, "sky", "test/body.png", now).lastInsertRowid);
const skyPieces = ["Aspect of First Sky", "Aspect of Second Sky", "Aspect of Third Sky", "Aspect of Fourth Sky"]
  .map(n => Number(insAsset.run(n, "aspect", null, null, "sky", `test/${n}.png`, now).lastInsertRowid));
const stonePieces = ["Aspect of First Stone", "Aspect of Second Stone"]
  .map(n => Number(insAsset.run(n, "aspect", null, null, "stone", `test/${n}.png`, now).lastInsertRowid));
insAsset.run("Aspect of First Root", "aspect", null, null, "root", "test/root.png", now);

const insAwokin = db.prepare("INSERT INTO awakened (name, minted_name, image_blob_key, composition_json, collection, owner_name, owner_key, created_at) VALUES (?, ?, ?, ?, 'tender', 'Dot Tester', ?, ?)");
const composition = JSON.stringify([{ source_id: `db:${bodyId}`, name: "Test Body", category: "body", rarity: "common", power: 2, toughness: 2, element: "sky" }]);
const dotlingId = Number(insAwokin.run("Dotling", "Dotling", "test/dotling.png", composition, ownerKey, now).lastInsertRowid);
const rootlingId = Number(insAwokin.run("Rootling", "Rootling", "test/rootling.png", composition, ownerKey, now).lastInsertRowid);

const setPool = (el, pts) => db.prepare("INSERT INTO aspect_attunement (owner_key, element, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_key, element) DO UPDATE SET points = excluded.points")
  .run(ownerKey, el, pts, now);
const pool = (el) => db.prepare("SELECT points FROM aspect_attunement WHERE owner_key = ? AND element = ?").get(ownerKey, el)?.points ?? 0;
const wornOf = (id) => JSON.parse(db.prepare("SELECT composition_json FROM awakened WHERE id = ?").get(id).composition_json)
  .filter(l => l.category === "aspect");

// ── A short pool refuses, and spends nothing ─────────────────
let r = await api("weaveAspect", { awakenedId: dotlingId, element: "sky" }, token);
check("weave with an empty pool is refused at the ladder's price", r.status >= 400 && /costs 1/.test(errText(r)), errText(r));
check("nothing was woven and nothing spent", wornOf(dotlingId).length === 0 && pool("sky") === 0);

setPool("sky", 10); setPool("stone", 10); setPool("root", 5);

// ── First pick: any element, 1 point — and it seals ──────────
r = await api("weaveAspect", { awakenedId: dotlingId, element: "sky" }, token);
check("first weave stands at Lv I for 1 point", r.status === 200 && r.data.cost === 1 && r.data.stacked === 1 && r.data.sealed === "sky", JSON.stringify(r.data).slice(0, 160));
check("the sky pool paid exactly 1", pool("sky") === 9, `pool=${pool("sky")}`);
check("the worn aspect carries its element and level", wornOf(dotlingId).length === 1 && wornOf(dotlingId)[0].aspectElement === "sky" && wornOf(dotlingId)[0].aspectLevel === 1);

r = await api("weaveAspect", { awakenedId: dotlingId, element: "stone" }, token);
check("the seal refuses another element's weave", r.status >= 400 && /sealed to sky/.test(errText(r)), errText(r));
check("the refused weave spent nothing", pool("stone") === 10 && wornOf(dotlingId).length === 1);

// ── The ladder climbs: 2, then 3, each a distinct piece ──────
r = await api("weaveAspect", { awakenedId: dotlingId, element: "sky" }, token);
check("second weave costs 2", r.status === 200 && r.data.cost === 2 && r.data.stacked === 2 && pool("sky") === 7, JSON.stringify(r.data).slice(0, 120));
r = await api("weaveAspect", { awakenedId: dotlingId, element: "sky" }, token);
check("third weave costs 3", r.status === 200 && r.data.cost === 3 && r.data.stacked === 3 && pool("sky") === 4, JSON.stringify(r.data).slice(0, 120));
const wornIds = wornOf(dotlingId).map(l => l.source_id);
check("three distinct aspects stand woven", new Set(wornIds).size === 3, wornIds.join(","));

r = await api("weaveAspect", { awakenedId: dotlingId, element: "sky" }, token);
check("a fourth weave is refused — the stack is full", r.status >= 400 && /stack is full/.test(errText(r)), errText(r));
check("the full-stack refusal spent nothing", pool("sky") === 4);

// ── Deepening still climbs the ladder ────────────────────────
const firstKey = wornOf(dotlingId)[0].source_id;
r = await api("deepenAspect", { awakenedId: dotlingId, targetAspectKey: firstKey }, token);
check("deepening the first aspect I→II costs 1", r.status === 200 && r.data.newLevel === 2 && pool("sky") === 3, JSON.stringify(r.data).slice(0, 120));

// ── The seal binds the stored-piece door too ─────────────────
const insInv = db.prepare("INSERT INTO aspect_inventory (owner_key, aspect_asset_id, created_at) VALUES (?, ?, ?)");
const stoneInvId = Number(insInv.run(ownerKey, stonePieces[0], now).lastInsertRowid);
r = await api("applyAspect", { awakenedId: dotlingId, inventoryAspectId: stoneInvId }, token);
check("a stored stone piece is refused by the sky seal", r.status >= 400 && /sealed to sky/.test(errText(r)), errText(r));
check("the refused piece was not consumed", !!db.prepare("SELECT id FROM aspect_inventory WHERE id = ?").get(stoneInvId));

// ── …but raising a worn element with a stored piece stands ───
const skyInvId = Number(insInv.run(ownerKey, skyPieces[3], now).lastInsertRowid);
r = await api("applyAspect", { awakenedId: dotlingId, inventoryAspectId: skyInvId }, token);
check("a stored sky piece raises a worn sky aspect (add-to-upgrade)", r.status === 200 && r.data.upgraded === true && r.data.cost === 1 && pool("sky") === 2, JSON.stringify(r.data).slice(0, 160));
const levels = wornOf(dotlingId).map(l => l.aspectLevel ?? 1).sort();
check("the stack's levels now stand 1, 2, 2", JSON.stringify(levels) === "[1,2,2]", levels.join(","));

// ── The gifts are real: +1/+1 per weave, deepen, upgrade ─────
const bonus = db.prepare("SELECT bonus_power, bonus_toughness FROM awakened WHERE id = ?").get(dotlingId);
check("five gifts stand on the Awokin (+5/+5)", bonus.bonus_power === 5 && bonus.bonus_toughness === 5, JSON.stringify(bonus));

// ── The seal is per-Awokin ───────────────────────────────────
r = await api("weaveAspect", { awakenedId: rootlingId, element: "root" }, token);
check("another Awokin's first pick is still free — root seals root", r.status === 200 && r.data.sealed === "root" && pool("root") === 4, JSON.stringify(r.data).slice(0, 120));

console.log(`\ntest43: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
