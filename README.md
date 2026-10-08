# Awoken Generator — standalone

A self-hostable port of the Awoken Generator web app. Same React client and
same game logic as the original; the Muse-runtime bindings (action protocol,
managed blob store, managed database, LLM naming) are replaced with standard
pieces: Express, SQLite (via drizzle-orm + better-sqlite3), a content-addressed
file blob store, and curated in-voice naming/flavor pools.

## Run it

Prerequisites: Node 20+ and npm.

```bash
npm install     # install dependencies
npm run build   # build server (tsc) + client (vite)
npm start       # serve on http://localhost:3000
```

Or with env vars:

```bash
PORT=8080 DATA_DIR=/var/lib/awoken npm start
```

Open http://localhost:3000 — the Tender ritual is the default face; the
workshop sits behind the discreet "Workshop" entrance.

## Where data lives

- `DATA_DIR` (default `./data`, relative to where you start the server):
  - `app.db` — SQLite database (layer assets, awakened creatures).
  - `blobs/objects/<shard>/<sha256>` — uploaded PNG bytes, content-addressed.
  - `blob_index` table inside `app.db` maps logical keys (`layer-assets/…`,
    `awakened/…`) to stored objects.
- Back up `DATA_DIR` and you back up everything.

## Docker

```bash
docker build -t awoken-generator .
docker run -p 3000:3000 -v awoken-data:/app/data awoken-generator
```

## Wake credits & pricing

Waking in the Tender face costs one credit per Wake One. Pricing defaults to
**$5.00 = 20 wakes ($0.25 per wake)** and is configurable:

| Env var | Default | Meaning |
|---|---|---|
| `PACK_PRICE_CENTS` | `500` | Price of one wake pack, in cents |
| `CREDITS_PER_PACK` | `20` | Wakes granted per pack |
| `PRICE_PER_WAKE_CENTS` | `25` | Displayed per-wake price |

Credits live in the `credit_ledger` table (`user_id` is present for future
multi-Tender accounts; today there is one implicit owner). The Tender ritual
shows the remaining balance beside Wake One with a "Get more wakes" entry
point; at zero the Wake button becomes the upsell. Wakes from the workshop
face (Nigel's own hand) are always free and never touch the ledger.

## Stripe (test mode only)

Payments are Stripe Checkout in **test mode, always** — a live secret key is
refused at startup. Without keys, the payment endpoints return a plain
explanation instead of failing.

**What Nigel must do (about five minutes):**

1. Create a free account at [stripe.com](https://stripe.com) — stay in
   **test mode** (the "Test mode" toggle in the dashboard).
2. Go to Developers → API keys and copy the **test** secret key
   (`sk_test_…`) and **test** publishable key (`pk_test_…`).
3. Go to Developers → Webhooks → Add endpoint:
   - Endpoint URL: `https://<your-host>/api/stripe/webhook`
   - Events to send: `checkout.session.completed`
   - Copy the **signing secret** (`whsec_…`).
   - (For local testing instead: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the printed secret.)
4. Put the three values in `.env` (see `.env.example`) and restart.
5. Buy a pack with the test card `4242 4242 4242 4242`, any future expiry,
   any CVC. The webhook credits 20 wakes to the ledger.

Endpoints: `GET /api/stripe/config` (public pricing + key status),
`POST /api/stripe/checkout` (returns the Checkout URL),
`POST /api/stripe/portal` (returns the Customer Portal URL for managing
payment methods), `POST /api/stripe/webhook` (Stripe-signed, credits the
ledger exactly once per completed session).

## Deploying it yourself (Nigel's path)

The repository is plain Node + Docker — no GitHub account needed for the
code to exist, and none of these hosts require one either.

1. `git init` is already done in this repo; push it to **your own** GitHub
   repository (private is fine):
   ```bash
   git remote add origin git@github.com:<you>/awoken-generator.git
   git push -u origin main
   ```
2. **Railway** (recommended, ~$5/mo): create an account at railway.app,
   New Project → Deploy from Repo → pick your repo. Railway detects the
   Dockerfile. Add a Volume mounted at `/app/data` (this is what keeps the
   SQLite database and images alive across restarts), then set the env vars
   from `.env.example` in the Railway dashboard (Variables tab) — including
   your Stripe test keys and `APP_URL=https://<your-railway-domain>`.
3. **Fly.io** (~$3/mo): `fly launch` in the repo, `fly volumes create
   awoken_data --size 1`, set secrets with `fly secrets set`, deploy with
   `fly deploy`.
4. **Hetzner VPS** (~$5.20/mo): rent a CAX11, install Docker, copy the repo
   (or `git clone`), `docker build` + `docker run` with a named volume.

Whichever host you choose, point Stripe's webhook at
`https://<your-host>/api/stripe/webhook` afterward.

## API

All endpoints are `POST /api/<name>` with a JSON body, mirroring the original
server actions one-to-one:

| Endpoint | Body | Returns |
|---|---|---|
| `getStudio` | `{}` | `{ assets, awakened, credits }` — Tender-face data: pool pieces, the Tender deck only, and `credits` (`{ balance, packPriceCents, packPriceLabel, creditsPerPack, pricePerWakeCents, checkoutEnabled }`). Credit balance is per-visitor when `X-Visitor-Id` is sent. |
| `getWorkshopStudio` | `{}` | Full studio (assets, all awakened, credits) — requires the workshop token when the workshop is locked. |
| `uploadLayerAsset` | `{ category, imageBase64, mimeType: "image/png" }` | `{ id, name }` |
| `updateLayerAssetStats` | `{ id, power, toughness }` | `{ ok, rarity }` |
| `renameLayerAsset` | `{ id, name }` | `{ ok }` |
| `deleteLayerAsset` | `{ id }` | `{ ok }` |
| `saveAwoken` | `{ layers, imageBase64, collection, ownerName }` | `{ id, name, iteration, empowerment, flavor_text }` |
| `renameAwoken` | `{ id, name }` | `{ ok }` |
| `deleteAwoken` | `{ id }` | `{ ok }` |

Images: `GET /blobs/<base64url(logical key)>` → PNG bytes.
Health: `GET /api/health`.

Errors are `{ error: "message" }` with a 4xx/5xx status.

### Welcome ritual (free wakes)

Visitor identity is soft: the client mints a UUID on first visit, keeps it in
`localStorage`, and sends it as the `X-Visitor-Id` header. Clearing storage
starts over — real Tender accounts will replace this one day.

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/welcome` | — (header only) | `{ welcomeGranted, needsSeed, welcome, freeWake, freeWakeAvailable, nextFreeWakeAt }` — `welcome`/`freeWake` are `{ awakened, respinsUsed, respinsRemaining }` or `null` |
| `POST /api/welcome/seed` | `{ layers, imageBase64 }` | the held-apart greeting Awoken (first visit; idempotent) |
| `POST /api/welcome/claim` | `{ slot: "welcome" \| "free" }` | `{ ok, awakenedId }` — moves the waiting Awoken into the Tender deck |
| `POST /api/welcome/reconstitute` | `{ slot, layers, imageBase64 }` | the re-woven Awoken — once per waiting Awoken (403 after) |
| `POST /api/welcome/free-wake` | `{ layers, imageBase64 }` | the new waiting Awoken — 429 unless a free wake has gathered |

Rules: first visit grants 20 wake credits (reason `welcome`, a bonus on top of
nothing) and holds one greeting Awoken apart with "Add to deck" /
"Reconstitute matter". A free wake gathers every 4 hours (`FREE_WAKE_MS`),
one at a time — unclaimed = lost, never stacked, never announced (pull only,
per the Anti-Duolingo law).

### The Grove Fund

`$1` of every `$5` wake pack accrues toward planting native trees
(`GROVE_PER_PACK_CENTS=100`, configurable). The Stripe webhook accrues it
automatically on each paid pack.

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/grove` | — | `{ centsAccrued, dollarsAccrued, treesPlanted, perPackCents, perPackLabel }` |
| `POST /api/grove/record-planting` | `{ trees, note? }` | `{ ok, treesPlanted }` — workshop use |

**Monthly routine (manual):** check `GET /api/grove`, donate the accrued
dollars to One Tree Planted (or another native-species project, ~$1/tree),
then `POST /api/grove/record-planting` with `{ "trees": N, "note": "..." }`.
Convention: `centsAccrued` is lifetime dollars grown (never decreases);
`treesPlanted` counts trees actually planted. A future Ecologi auto-plant
integration can hook into the same accumulator (see the comment in
`server/src/grove.ts`).

### Workshop lock

Set `WORKSHOP_PASSWORD` in the environment (Railway → Variables). When set:

- the workshop face shows a password prompt instead of the studio;
- `POST /api/workshop/unlock { password }` mints a token (valid ~30 days),
  kept in the browser's `sessionStorage` and sent as `X-Workshop-Token`;
- all workshop endpoints require it — layer asset upload/rename/delete/stats,
  awoken delete, and `getWorkshopStudio` (the creator's full data, which the
  workshop face now uses instead of `getStudio`).

`GET /api/workshop/status` → `{ locked }` (public). The Tender ritual,
welcome, free wakes, lore, grove counter, and Stripe endpoints stay public.
When `WORKSHOP_PASSWORD` is unset the workshop stays open exactly as before,
and the server logs a loud warning at startup.

## Notes on the port

- Piece names and birth flavor text were generated by an LLM in the original.
  Here they come from curated pools in `server/src/naming.ts` — same voice,
  no network needed.
- Upload validation is unchanged: true PNGs, exactly 750 × 971
  (the client still normalizes 2550 × 3300 Procreate exports first).
- Rarity still derives from power + toughness (2–3 common, 4 uncommon,
  5 rare, 6 mythic); aura opacity still follows average rarity.
- Duplicate empowerment is intact: re-waking an identical form flags the
  iteration and grants +1/+1 to every copy.
- This is a snapshot port. The original keeps evolving in its own environment;
  future changes here are code changes.
