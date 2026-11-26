// MINT AWOKIN BETA REDEEM CODES (Nigel, ruled 2026-11-25 — a batch
// of one-time codes, one per person). Run where the world's
// database lives:
//
//   DATA_DIR=/srv/awoken-data node scripts/mint-beta-codes.mjs [count]
//
// Prints each new code once, in its hand-out dress (XXXX-XXXX).
// Codes are stored bare; the redeem door forgives case, dashes
// and spaces when a Tender types one in. Unspent codes stay
// unspent until a Tender redeems one — the row then names them.
import { join } from "node:path";
import { randomInt } from "node:crypto";
import Database from "../node_modules/better-sqlite3/lib/index.js";

const DATA_DIR = process.env.DATA_DIR;
if (!DATA_DIR) {
  console.error("DATA_DIR is not set — point it at the world's data directory.");
  process.exit(1);
}
const count = Math.max(1, Math.min(500, Number(process.argv[2] ?? 20) || 20));
// No I, L, O, 0 or 1 — a code read aloud or scribbled down
// cannot be mistaken for another letter.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const db = new Database(join(DATA_DIR, "app.db"));
db.exec(`CREATE TABLE IF NOT EXISTS beta_codes (
  code TEXT PRIMARY KEY NOT NULL,
  redeemed_by INTEGER,
  redeemed_at INTEGER,
  created_at INTEGER NOT NULL
);`);
const insert = db.prepare("INSERT INTO beta_codes (code, created_at) VALUES (?, ?)");
const minted = [];
while (minted.length < count) {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  try {
    insert.run(code, Date.now());
    minted.push(code);
  } catch {
    // A collision with a standing code — draw again.
  }
}
db.close();
for (const code of minted) console.log(`${code.slice(0, 4)}-${code.slice(4)}`);
console.error(`minted ${minted.length} one-time beta codes`);
