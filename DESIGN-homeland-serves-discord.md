# THE HOMELAND SERVES DISCORD — design + inventory

Nigel's rulings, 2026-10-28: 11:31 "instead of making all of the changes to
discord can we just push the new homeland as it is to the discord with its
current rules?" · 11:55 tap + words "Yes — the homeland itself serves
Discord; stop the programme and build that" · "It still give the ability to
search for a starseed, creating a new table" · "As well as host homeland."

AMENDMENT 1 (11:57): the old Table page is NOT deleted. It stops being the
Discord seat's game and stays as a TEST GROUND tab in the Discord interface.
AMENDMENT 2 (11:57): the Discord interface gains a tab bar — the
homeland-served room (the seat), the TEST GROUND (the old page), CAMPAIGN
MODE (the Push 42 3D storyteller board + console, embedded as a tab;
internals not rebuilt; flag if it cannot be tabbed as it stands).

## p1-buildings inspection (directed in the brief)

`programme/p1-buildings` tip is `58f9553` — identical to its base (the Stone
Cast commit). The branch carries NO commits of its own: the buildings-port
build was stopped before any port code was written. Nothing to discard;
the port approach is superseded regardless.

## Base

Branch `build/homeland-serves-discord` off main `dcf4595` (Push 47) +
merge of `programme/parity-closing` (`f9e863f`): B23 sky words (`77983da`)
and B7 Shard Rain pool split at home (`0599111`) — both homeland-side, both
stay.

## Inventory (from the code, 2026-10-28)

- The homeland engine (`server/src/actions.ts`, ~17k lines) keys EVERY land
  table by `owner_key`: territory_tiles, territory_buildings, build_pieces,
  hex_walls, territory_workings, star_seeds, field_placements, wave_state.
  `ownerKeyFor(ctx)` = `tender:<id>` for a signed-in Tender — ONE key serves
  as both the Tender's account and their land. Settle helpers are already
  parameterized by that key (`settleHomelandBattle(ownerKey, …)`,
  `computeTileLight(ownerKey, …)`, `loadBuildPieces(ownerKey)` …), and
  settlement is lazy + watermarked inside `getTerritory` — so several
  readers of one land converge on ONE settled state.
- Actions are dispatched generically: `POST /api/<name>` in index.ts builds
  `ActionContext {visitorId, tender, tenderToken, workshopAuthorized}`.
  That dispatch is the seam where a room context enters.
- The Table (`server/src/table.ts`, ~9.3k lines) is a WebSocket room engine
  with its OWN simulation (field/dark/workings in memory), the homeland
  PORT for hosted lands (loadHomelandPort/saveHomelandPort, the retired
  one-element bank — parity N43), Discord auth/bind routes
  (/api/table/config|auth|bind|bind-intro), the intro door
  (client TableIntro, self-contained: {authToken, initialMode, onComplete,
  onCancel}), hosted-land door records in ui_config under
  `table.homelandDoor.<ownerKey>` {privacy, passwordHash}, MAX_SEATED 8,
  room furniture in the Room record (tale[], dice via "roll", pack, party
  serves, seed growth).
- The client Table page is featherweight by design (table-main.ts knocks
  on Discord's door before importing anything heavy) and mounts
  TableApp → `<Table/>`, which already contains BOTH the casual room and
  the campaign room (CampaignBoard3D lazily + StorytellerConsole; campaign
  rooms are `campaign-<key>` room ids). The tab bar therefore lives in
  TableApp's mount: Seat (new) / Test Ground (`<Table/>` untouched) /
  Campaign (`<Table/>` entered at its campaign door).
- The homeland face (client Territory.tsx) is a component
  ({tenderItems, assets, onUpdate, …}) that polls `api.getTerritory()`
  itself; api.ts has one fetch helper (two sites) attaching
  X-Tender-Token — the seam for an X-Room-Seat header.
- A fresh homeland is dealt by `generateFirstWorld(ownerKey)` (heartland +
  frontier). A fresh TABLE land today is a radius-6 disc, 127 tiles.
  Door One deals the disc under a synthetic key `roomland:<roomCode>`,
  with a star_seeds row at its heart (level 1), one safe square
  (ensureOneSafeSquare — the homeland's own fresh-map law), and lets the
  homeland's frontier law grow it from there.

## The build

### Server — the room layer (`server/src/rooms.ts`, new)

Rooms as a LAYER over the homeland, not a fork of it:

- Room record (in memory, as Table rooms are today): code, door
  ("instance" | "homeland"), landOwnerKey, hostTenderId, hostName,
  createdAt, tale[], seats: Map<tenderId|"watch", Seat>.
- Seat: {tenderId|null, name, watcher, tileId (the seat's figure stand on
  the land), classKey, weaponKey, lastSeenAt}. Seat tokens
  (Map token → {code, tenderId, watcher}) resolve the room context for
  action dispatch and are exported for index.ts.
- Routes (registered before the static bundle, beside registerTableRoutes):
  - POST /api/room/enter {door, room?, password?} — identity = the Tender
    session (X-Tender-Token), the same proof the web seat uses today.
    · door "homeland": the room stands on the CALLER's own homeland
      (code `homeland-<tenderId>`); the land's ui_config door record
      governs guests (privacy/password — the same record the old seat
      reads, so the word is one word on both seats).
    · door "starseed": a NEW room (fresh code) on a fresh instance land
      dealt as above. Searching for a starseed creates a new table.
    · door "join": enter the named room as it stands (either door's
      land); passworded land asks its word; watch=true seats a watcher
      (no Tender session needed).
    Seats capped at 8 seated (watchers uncapped, as today).
  - POST /api/room/stand {tileId} — move my figure's stand on the land.
  - POST /api/room/leave.
  - GET  /api/room/state — seats (figure stands, names, class, weapon,
    tender level), the seed strip (the land seed's stage + fed count,
    read from star_seeds by land key), the tale.
  - POST /api/room/roll {label, sides, count} — the dice box: rolls are
    appended to the room's tale (as the old seat's rolls are written
    into its Tale) and returned.
  - POST /api/room/door {privacy, password?} — the host sets their
    homeland room's word (writes the same ui_config door record).
- Presence: seats heartbeat through /api/room/state polls; a seat unseen
  for 90 s is marked away (its figure stays standing, as a held seat
  does at the old Table).

### Server — the context split (`server/src/actions.ts`)

- `ActionContext.room?: {code, landOwnerKey, watcher}` — resolved in
  index.ts from the X-Room-Seat header; refused when the seat's Tender
  is not the request's Tender.
- `landKeyFor(ctx)` = room land ?? `ownerKeyFor(ctx)`;
  `actorKeyFor(ctx)` = `ownerKeyFor(ctx)`. With no room, land == actor
  and every converted handler is behaviour-identical solo.
- `field_placements` gains `actor_key` (schema.ts + store.ts DDL +
  backfill actor_key = owner_key): owner_key is the LAND a placement
  stands on; actor_key is the Tender whose Awoken it is. The four insert
  sites set it (handler sites from the acting ctx; settle-internal
  sites default to the land key, which is the land Tender's own).
  "My fielded" reads in converted handlers go by actor_key; "the land's
  field" reads stay by owner_key.
- Converted handlers (land derivation → landKeyFor; account spots —
  deck ownership, the energy purse, grimoire, progress, inventory —
  → actorKeyFor): getTerritory, setTenderTile (room mode: moves the
  SEAT's stand), beginBuild, pourBuild, attuneTile, setPlacementFollow,
  summonAwoken, moveAwoken, placeBuildPiece, removeBuildPiece,
  stopBuildPiece, strikeBuildPiece, castMapWorking, looseBlade,
  settleMarches, settleIncursions, settleSeedCalm, failIncursion,
  settleSeedMissions, getSeeds, ensureFirstSeed, getFirstSeedEvent,
  deployFirstSeed, startFirstSeedHold, fetchSeed, holdSeed, callToArms,
  getCalls, getBastion, stageAwokin, unstageAwokin, sendToBastion,
  setHandMember, createBastionInstance, getIncursions, defeatIncursion,
  setPatrol, setMarch, recallMarch, getWave, getBuildings, placeBuilding,
  demolishBuilding, damageTileHp, damageAwokenHp, setShrineMode,
  claimBonusTile, resolveWavePull, claimSpark, igniteWildfire,
  attackTile, setStance, resolveBattle, harvestWheat, getHall,
  fundHallEnergy, fundHallElement, beginHallUpgrade, houseAwoken,
  setLighthouse, bindingHealTick.
- In room mode getTerritory serves: the LAND's settled state (one shared
  fight, settled once in the land's rows), the ACTOR's purse, the
  SEAT's own stand as the `tender` view (each seat sees their own
  figure where they stand it), and `roomSeats` — every seat's figure
  (name, class, weapon, tile) for the face to draw.
- The dispatcher refuses, in room mode, land-touching handlers that were
  NOT converted (plain words, no silent wrong-land act):
  claimFirstSeedReward, endFirstSeedRun, commitToConfluence,
  setChampion, addFieldToParty, getAspectAttunement (its attunement
  read is the actor's — it passes; listed here only if its land read
  proves load-bearing in the edit pass). Watcher seats may call
  getTerritory and the room routes only.
  Account-only handlers (grimoire, zodiac, decks, party, inventory…)
  pass in room mode untouched — a Tender's own book is theirs wherever
  they stand.

### Client

- api.ts: a module room-seat slot (setRoomSeat/clearRoomSeat); the fetch
  helper adds X-Room-Seat when set.
- `client/src/RoomSeat.tsx` (new): the seat tab's face.
  · Doors: reads ?land=homeland / ?land=new / ?room=CODE (the Bastion
    door's own URLs, unchanged); otherwise offers the two doors and a
    join-by-code, in the Bastion panel's words.
  · Identity: a Tender session seats directly; without one, the funnel
    — TableIntro (the Push 36 intro door: Begin / I already have a
    Tender → account → wake → class + weapon) — the invite funnel
    standing at the invite door, as commissioned.
  · The face: the homeland's own Territory component, fed the seat's
    own studio (getStudio: their deck, their assets), over a
    QueryClientProvider; room furniture as an overlay panel — the
    party panel (seats + their fielded companies' standing, from the
    territory payload's placements grouped by actor), the seed strip
    (stage + fed), the dice box, the Tale.
  · Seat figures: Territory draws the payload's `tender` view (the
    seat's own stand); `roomSeats` figures are drawn by the same
    figure rendering for the other seats.
- TableApp.tsx: the Discord interface shell — a tab bar (The Room /
  Test Ground / Campaign) over the three seats; Test Ground mounts
  `<Table/>` exactly as today; Campaign mounts `<Table/>` entered at
  its campaign door; the Seat tab mounts RoomSeat. table-main.ts's
  featherweight knock is untouched.

### Retirement (as amended)

The /table route and the Discord door open the shell whose FIRST tab is
the new seat. table.ts's engine keeps serving the Test Ground tab (and
the campaign rooms the Campaign tab enters) — it stops being the seat's
game; nothing is deleted. The homeland PORT code paths
(loadHomelandPort/saveHomelandPort) are no longer the seat's road;
they remain only inside the test ground's own hosted rooms.

## Carries and flags (to be confirmed in the final report)

- CARRY (room furniture, from the old seat's behaviour): MAX_SEATED 8;
  watcher seats; the hosted-land door record (one word, both seats);
  dice rolls written into the Tale; held seats (step-away grace).
- FLAG — guest earnings: what a guest's fells pay the guest (XP divides
  by owner in the homeland's pot machinery — divideXpPotByOwner already
  splits by placement actor once actor_key exists; drops land in the
  LAND's pack roads at home). Ruled 2026-10-24 only as "friends bring
  their own Awoken; changes real both ways". No new ruling invented:
  the homeland's own reckoning runs as it stands.
- FLAG — guest Tender-body wounding: the homeland's tender-body settle
  (settleTenderBody/woundTender) is the LAND Tender's body. A guest's
  figure stands as presence; the curse's blows at a guest's BODY have
  no homeland ruling. Not invented in this build: guests' Awoken fight
  and fall by homeland law; their figures do not take body wounds.
- FLAG — guest seed-feeding: the passive draw (settleSeedFeeding)
  drinks for the land Tender standing on the seed, as at home. A guest
  standing on the seed feeds through the same read only if their stand
  is the seat stand served to the engine — decided in the edit pass;
  if it cannot ride honestly, it is flagged, not faked.

## Proofs

prepush + scripts/drive-room-seat.mjs (new): two Tenders, one hosted
homeland (a guest's act changes the host's real land; the host's own
read agrees), the starseed door (127 tiles + heart seed), one shared
fight settled once, a Discord-shaped arrival binding + seating
(bind-intro road), an invite-link arrival seating, the password gate,
Awoken building (Stone Cast) working in a room, watcher read-only.
Solo regressions: drive-hex-build, drive-stone-cast, drive-pieces-faces.
Tab-bar drive/screenshots: seat tab, test ground tab (old page),
campaign tab (the 3D board). Screenshots →
~/workspace/homeland-discord-proof/.

## As built (2026-10-28, the build's own record)

- server/src/rooms.ts (new): the room layer — room registry,
  seat ledger, the two doors plus join-by-code, the homeland
  door record read/written at the SAME ui_config key the old
  seat uses (one word on both seats; compared with
  tenders.verifyPassword — the word is scrypt-salted), the
  dice box + Tale on the room record, instance lands dealt at
  radius 6 / 127 tiles with the heart purified in the
  standing shape and a held seed standing at it.
- actions.ts: ActionContext.room; landKeyFor/actorKeyFor; 56
  handlers re-derived; placement rows carry actor_key
  (schema + store migration + backfill); getTerritory serves
  guestAwoken payloads whenever a land holds foreign company
  (room or the host's later solo read alike).
- index.ts: the seat seam in the action dispatch (a seat
  binds to its own Tender, or to a watcher who may only read)
  + ROOM_REFUSED_ACTIONS in plain words.
- Client: api.ts seat header on both fetch roads +
  setTenderTile rerouted to the seat's stand in a room;
  RoomSeat.tsx (doors, the intro funnel, Territory fed with
  the union of companies, the furniture: party panel, seed
  strip, dice box, Tale, the door's word, invite link);
  Territory roomSeats figures (class idle frame + name) and
  the guest self-stand override; TableApp tab shell (The
  Room / Test Ground / Campaign Mode); Table's campaignDoor
  prop (the campaign tab goes straight to the instance's
  campaign room once Discord's answer stands; away from
  Discord the standing campaign door, marked as the tab's).
- The host's seat stand and their homeland stand are ONE
  record (room/stand writes tender_progress for the host), so
  a host walking in the room walks their homeland.
- Retirement as amended: /table + the Discord activity open
  the tab shell with the Room first; table.ts keeps serving
  the Test Ground and Campaign tabs only. Nothing was
  deleted.

## Flags (unruled or carried, for the report)

- FLAG — guest seed-feeding as built: the passive draw drinks
  for the LAND Tender standing on the seed, exactly as at
  home; guests' seat stands do not feed it. On an instance
  land there is no single Tender, so its heart seed stands
  but does not drink in this build — seats feeding a room's
  seed is unruled.
- FLAG — aspect attunement accrual (getAspectAttunement)
  reads the ACTOR's home field in a room, exactly as their
  solo read does; binders standing on a room's land do not
  accrue. Unruled.
- FLAG — guest Tender-body wounding: not built (see above).
- FLAG — fell drops land in the LAND's pack; any seat may
  claim a drop into their own inventory by the standing
  claimPackDrop road.
- CARRIES from the old seat: 8-seat cap; watcher seats; the
  homeland door record; dice written into the Tale; seats
  held through a 90-second step-away grace.
