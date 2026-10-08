# Simulation Findings — 2026-10-08

## Territory Growth Simulation (30 days)

**CRITICAL: Exponential growth without friction.**
- Turtle (no binding): 1959 purified tiles, 2035 hand, 65 field in 30 days.
- Balanced: 2094 tiles, 2184 hand.
- Aggressive: 2321 tiles, 2398 hand.

**Problems:**
1. Passive purification too fast (30%/day when power > weight).
2. Birth-on-purify compounds: each tile → new Awoken → more hand → more energy → more deploys.
3. Energy cap grows unbounded (3000+ by day 30).
4. No limiting factor on expansion.

**Recommendations:**
- Passive purification should require ADJACENCY (not total field power).
- Add purification cooldown per tile (e.g., 24h after one purifies nearby).
- Cap births: maybe 1 per day max, or require energy cost.
- Energy cap should have a hard ceiling (e.g., 50 max).

## Multiplayer Champion Lending

**Tested scenarios:**
1. Hard event (30 power): Solo LOSE → +1 helper WIN (+21 power).
2. Very hard (45 power): Solo LOSE, +1 helper LOSE, +2 helpers WIN (+42).
3. Weak helper (+6 power): Still LOSE, but can tip close battles.

**Design decisions needed:**
- **Risk on loss:** Recommend lent champions enter 4h re-coalescence on defeat. Creates trust/stakes.
- **Rewards:** Recommend host gets territory, helpers get twin newborn (Bloodline law).
- **Async vs sync:** Recommend async — helper pre-selects 3 champions, they fight when host triggers event.

## Implemented Changes

1. **Auto-place:** No visible battle points. Tap card → Awoken goes to next keystone on center.
2. **3-Awoken direct attack:** Select 3, tap cursed tile → deploy all three for direct purification.
3. **First hex lore:** Sending 3-4 into the cursed heart explains the purification — overwhelming force breaks the dark.
