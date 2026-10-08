#!/usr/bin/env node
/**
 * Territory growth simulation — Awoken planet game loop.
 *
 * Models the DESIGNED loop (not all of it is in code yet):
 *   - First Trial: team of 4 (power >= 7) breaks the center curse -> 1 purified
 *     tile + ring of 6 cursed tiles, +1 newborn birth.
 *   - Each new purified tile births one new Awoken (PLANET GAME LOOP design).
 *   - Passive purification (design under discussion): each cursed tile adjacent
 *     to purified land has a 30% chance per day to purify when total field
 *     power exceeds the tile's curse weight.
 *   - Energy cap = 5 + power-scaled bonus per Awoken in hand
 *     (1-3 pwr:+1, 4-6:+2, 7-9:+3, 10+:+4). Deploy cost = 2 + 1 per 3 power.
 *   - ASSUMPTION (stated): energy refills fully each 24h.
 *   - Newborn power: sum of 3 piece stats (1-3 each) -> 3..9, mean ~6.
 *   - Curse weight of ring n = 3 + 2n (escalating frontier).
 *
 * Strategies:
 *   - turtle:    deploys nothing beyond the trial; passive purification only.
 *   - balanced:  deploys up to 2 Awoken/day onto frontier defense + 1 direct
 *                 attack when energy allows.
 *   - aggressive: spends all energy on direct attacks (3-Awoken rule) + deploys.
 *
 * Friction variant ("with-friction"): adjacency required for passive purify,
 * 24h cooldown per tile after one nearby purifies, birth cap 1/day,
 * energy ceiling 50.
 *
 * Seeded RNG -> reproducible. Run: node sims/territory-growth.js
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 30;
const NEWBORN = (rnd) => 3 + Math.floor(rnd() * 3) + Math.floor(rnd() * 3) + Math.floor(rnd() * 3); // 3..9
const energyBonus = (p) => 1 + Math.floor((p - 1) / 3);
const deployCost = (p) => 2 + Math.floor(p / 3);

function simulate(strategy, friction, seed) {
  const rnd = mulberry32(seed);
  // starter deck: 8 random creatures
  const hand = Array.from({ length: 8 }, () => NEWBORN(rnd));
  // First Trial: the 4 strongest form the team and stand on the center tile.
  const team = [...hand].sort((a, b) => b - a).slice(0, 4);
  for (const p of team) hand.splice(hand.indexOf(p), 1);
  let field = [...team];
  let purified = 1;         // center tile from trial
  let ring = 1;             // current frontier ring number
  let frontier = 6;         // cursed tiles available at frontier
  let cooldown = {};        // ring -> day it last purified nearby
  let birthsToday = 0;
  let day = 0;

  const fieldPower = () => field.reduce((s, p) => s + p, 0);
  const energyCap = () => {
    const cap = 5 + hand.reduce((s, p) => s + energyBonus(p), 0);
    return friction ? Math.min(cap, 50) : cap;
  };

  for (day = 0; day < DAYS; day++) {
    birthsToday = 0;
    const cap = energyCap();
    let energy = cap; // stated assumption: full refill daily

    // 1) Passive purification of frontier tiles.
    const weight = 3 + 2 * ring;
    let frontierLeft = frontier;
    while (frontierLeft > 0) {
      if (friction) {
        if (cooldown[ring] === day) break; // 24h cooldown after one nearby purify
        // adjacency required: only one frontier tile reachable at a time
      }
      const canPurify = fieldPower() >= weight;
      if (!canPurify) break;
      if (rnd() < 0.30) {
        frontierLeft--;
        purified++;
        const newborn = NEWBORN(rnd);
        if (!friction || birthsToday < 1) { hand.push(newborn); birthsToday++; }
        if (friction) cooldown[ring] = day;
        if (frontierLeft === 0) { ring++; frontier = 6 * ring; frontierLeft = frontier; }
        // turtle stops here each day (only passive)
        if (strategy === "turtle") break;
      } else break; // one attempt per tile per day
    }

    // 2) Direct attacks (3-Awoken rule), balanced/aggressive.
    if (strategy !== "turtle") {
      const maxAttacks = strategy === "aggressive" ? 99 : 1;
      let attacks = 0;
      while (attacks < maxAttacks && hand.length >= 3) {
        const trio = [...hand].sort((a, b) => b - a).slice(0, 3);
        const cost = trio.reduce((s, p) => s + deployCost(p), 0);
        if (energy < cost) break;
        energy -= cost;
        for (const p of trio) hand.splice(hand.indexOf(p), 1);
        field.push(...trio);
        purified++;
        const newborn = NEWBORN(rnd);
        if (!friction || birthsToday < 1) { hand.push(newborn); birthsToday++; }
        attacks++;
      }
    }

    // 3) Deploy for defense (raises field power for passive purify).
    if (strategy === "aggressive") {
      while (hand.length > 2) {
        const p = hand.sort((a, b) => b - a)[0];
        const cost = deployCost(p);
        if (energy < cost) break;
        energy -= cost;
        hand.splice(hand.indexOf(p), 1);
        field.push(p);
      }
    } else if (strategy === "balanced" && hand.length > 4) {
      const p = hand.sort((a, b) => b - a)[0];
      const cost = deployCost(p);
      if (energy >= cost) {
        energy -= cost;
        hand.splice(hand.indexOf(p), 1);
        field.push(p);
      }
    }
  }

  return {
    strategy, friction,
    days: DAYS,
    purifiedTiles: purified,
    handSize: hand.length,
    fieldSize: field.length,
    totalAwoken: hand.length + field.length,
    finalEnergyCap: energyCap(),
    fieldPower: fieldPower(),
  };
}

const strategies = ["turtle", "balanced", "aggressive"];
const out = [];
for (const s of strategies) {
  for (const f of [false, true]) {
    out.push(simulate(s, f, 20261008));
  }
}
console.log(JSON.stringify(out, null, 2));
