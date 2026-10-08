#!/usr/bin/env node
/**
 * Multiplayer champion-lending simulation — Unraveling events.
 *
 * Scenario: one Tender (host) faces an Unraveling event of power E.
 * The host invites helpers; each helper sends 3 champions (their 3 strongest
 * Awoken). Combined power must meet or beat the event.
 *
 * Deck model: each Tender has 20 Awoken, powers drawn 3..9 (sum of 3 piece
 * stats 1-3, mean ~6). Champion = top 3 by power.
 *
 * Risk model (design recommendation): lent champions that LOSE enter 4h
 * re-coalescence (can't act). On victory they return immediately.
 *
 * Reward model (Bloodline law): on victory, each helper receives a twin
 * newborn (power 3..9).
 *
 * Run: node sims/champion-lending.js
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

const DECK = 20;
const power = (rnd) => 3 + Math.floor(rnd() * 3) + Math.floor(rnd() * 3) + Math.floor(rnd() * 3);
const deck = (rnd) => Array.from({ length: DECK }, () => power(rnd));
const champions = (d) => [...d].sort((a, b) => b - a).slice(0, 3);
const sum = (a) => a.reduce((s, p) => s + p, 0);

function runScenario(eventPower, nHelpers, weakHelper, trials, seed) {
  const rnd = mulberry32(seed);
  let wins = 0;
  let soloWins = 0;
  let helperPowerSum = 0;
  let riskEvents = 0; // lent champions locked in re-coalescence after a loss
  for (let t = 0; t < trials; t++) {
    const host = sum(champions(deck(rnd)));
    let help = 0;
    for (let h = 0; h < nHelpers; h++) {
      const helperDeck = weakHelper
        ? Array.from({ length: DECK }, () => 3 + Math.floor(rnd() * 3)) // weak: powers 3..5
        : deck(rnd);
      help += sum(champions(helperDeck));
    }
    helperPowerSum += help;
    if (host >= eventPower) soloWins++;
    if (host + help >= eventPower) {
      wins++;
    } else if (nHelpers > 0) {
      riskEvents++; // defeat: all lent champions enter 4h re-coalescence
    }
  }
  return {
    eventPower, helpers: nHelpers, weakHelper,
    trials,
    soloWinRate: +(soloWins / trials).toFixed(3),
    winRate: +(wins / trials).toFixed(3),
    uplift: +((wins - soloWins) / trials).toFixed(3),
    avgHelperPower: +(helperPowerSum / trials).toFixed(1),
    defeatRiskRate: +(riskEvents / trials).toFixed(3),
  };
}

const trials = 20000;
const out = [];
for (const eventPower of [30, 45]) {
  for (const nHelpers of [0, 1, 2]) {
    out.push(runScenario(eventPower, nHelpers, false, trials, eventPower * 1000 + nHelpers));
  }
}
// Weak-helper edge case on the 30-power event.
out.push(runScenario(30, 1, true, trials, 777001));
out.push(runScenario(30, 2, true, trials, 777002));

console.log(JSON.stringify(out, null, 2));
