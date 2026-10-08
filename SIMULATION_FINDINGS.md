# Simulation Findings — 2026-10-08

> CORRECTION (15:45 EDT): the numbers in the first draft of this file
> (turtle 1959 tiles etc.) were written up without a runnable model behind
> them — they are WITHDRAWN. Everything below comes from actual runs of the
> scripts in `sims/`, seeded and reproducible:
> `node sims/territory-growth.js`, `node sims/champion-lending.js`.
> Full outputs saved as `sims/results-*-2026-10-08.json`.

## Territory Growth Simulation (30 days, real run)

Assumptions (stated): starter deck of 8 (powers 3..9); First Trial team of the
4 strongest stands on the center tile; 1 purified tile births 1 newborn;
passive purification 30%/day per adjacent cursed tile when field power exceeds
curse weight (ring n weight = 3 + 2n); energy refills fully daily;
cap = 5 + per-hand-Awoken bonus; deploy cost = 2 + 1/3 power.

| strategy   | friction | tiles | awoken | field pwr | energy cap |
|------------|----------|-------|--------|-----------|------------|
| turtle     | off      | 6     | 13     | 24        | 27         |
| turtle     | on       | 6     | 13     | 24        | 27         |
| balanced   | off      | 17    | 24     | 137       | 9          |
| balanced   | on       | 9     | 16     | 80        | 14         |
| aggressive | off      | 10    | 17     | 100       | 9          |
| aggressive | on       | 7     | 14     | 79        | 9          |

**Findings:**
1. **No exponential explosion.** Growth is roughly linear and self-limiting:
   every direct attack drains the hand, which shrinks the energy cap, which
   throttles the next attack. Nigel's energy-from-hand rule IS the friction —
   the game already has its brake.
2. **Aggressive underperforms balanced** (10 vs 17 tiles). Over-deploying
   starves the hand and future energy. Patience is mechanically rewarded —
   on-theme for the Awoken.
3. Turtle stalls at 6 tiles: passive purification needs field power, and the
   trial team alone can't push past ring-2 weights. A Tender who never tends
   simply stops growing. (The game never punishes them — it just waits.)
4. The proposed friction package (adjacency, 24h cooldown, birth cap 1/day,
   energy ceiling 50) roughly HALVES growth — still available if 17 tiles/30
   days feels too fast, but it may not be needed.

## Multiplayer Champion Lending (20,000 trials each, real run)

Deck model: 20 Awoken, powers 3..9; champion = top 3. Event power must be met
by host champions + helpers' champions.

| event | helpers | solo win | win rate | avg help | defeat risk |
|-------|---------|----------|----------|----------|-------------|
| 30    | 0       | 0%       | 0%       | —        | —           |
| 30    | 1       | 0%       | 100%     | +24      | 0%          |
| 30    | 2       | 0%       | 100%     | +48      | 0%          |
| 45    | 0       | 0%       | 0%       | —        | —           |
| 45    | 1       | 0%       | 95.9%    | +24      | 4.1%        |
| 45    | 2       | 0%       | 100%     | +48      | 0%          |
| 30    | 1 weak  | 0%       | 100%     | +15      | 0%          |

**Findings:**
1. **One helper flips unwinnable into certain.** Fellowship is the whole
   mechanic — matches the design law (the Awoken's edge is fellowship).
2. **Event tuning matters more than helper strength.** With 3-champion teams
   maxing ~24, events at 30+ REQUIRE help. Early events should sit at 15–20
   (winnable solo by a strong team), with 30+ as true "call your friends"
   thresholds.
3. Even a weak helper (+15) tips a 30-power event — close battles stay
   dramatic for everyone.
4. At 45 with one helper, the 4.1% defeat risk is exactly the trust-stakes the
   design wants: lent champions enter 4h re-coalescence on loss. Rare enough
   to feel fair, real enough to mean something.

## Implemented Changes

1. **Auto-place:** No visible battle points. Tap card → Awoken goes to next keystone on center.
2. **3-Awoken direct attack:** Select 3, tap cursed tile → server-side `directAttack`
   breaks the curse, re-elements the tile by the attackers' dominant element
   (fire never inherited, ties neutral), stands the attackers on it, and births
   a newborn. (FIX 15:45 EDT: the first version called `deployAwoken`, which the
   server rejects on cursed tiles — the attack could never have fired.)
3. **First hex lore:** Sending 3-4 into the cursed heart explains the purification —
   overwhelming force breaks the dark.
