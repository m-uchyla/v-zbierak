(function (root) {
'use strict';

const UNITS = Object.freeze([
  { id: 'spear', name: 'Pikinier', short: 'Pika', carry: 25 },
  { id: 'sword', name: 'Miecznik', short: 'Miecz', carry: 15 },
  { id: 'axe', name: 'Topornik', short: 'Topór', carry: 10 },
  { id: 'archer', name: 'Łucznik', short: 'Łuk', carry: 10, archery: true },
  { id: 'light', name: 'Lekki kawalerzysta', short: 'LK', carry: 80 },
  { id: 'marcher', name: 'Łucznik na koniu', short: 'ŁNK', carry: 50, archery: true },
  { id: 'heavy', name: 'Ciężki kawalerzysta', short: 'CK', carry: 50 },
  { id: 'knight', name: 'Rycerz', short: 'Rycerz', carry: 100 },
]);

const TIERS = Object.freeze([
  { id: 1, name: 'Ambitni amatorzy', lootFactor: 0.1 },
  { id: 2, name: 'Cierpliwi ciułacze', lootFactor: 0.25 },
  { id: 3, name: 'Zawodowi zbieracze', lootFactor: 0.5 },
  { id: 4, name: 'Specjaliści surowcowi', lootFactor: 0.75 },
]);

// Punkt startowy dla świata 233 (prędkość gry 1,25); w interfejsie można go zmienić.
const DEFAULT_DURATION_FACTOR = 1.25 ** -0.55;

function assertFiniteRange(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`Nieprawidłowa wartość: ${label}.`);
  }
}

function expeditionSeconds(carry, lootFactor, { durationFactor, initialSeconds, exponent }) {
  if (carry <= 0) return 0;
  // Wzór klienta gry: ( (100 × (ładowność × loot_factor)^2)^exponent + początek ) × factor.
  return Math.round(((100 * (carry * lootFactor) ** 2) ** exponent + initialSeconds) * durationFactor);
}

function splitResources(loot) {
  const wood = Math.round(loot / 3);
  const clay = wood;
  return { wood, clay, iron: loot - wood - clay };
}

function calculatePlan({ counts, tiers, selectedUnits = {}, availableUnits = {}, carryFactor = 1, durationFactor = DEFAULT_DURATION_FACTOR, initialSeconds = 1800, exponent = 0.45 }) {
  assertFiniteRange(carryFactor, 0.01, 100, 'mnożnik ładowności');
  assertFiniteRange(durationFactor, 0.01, 100, 'współczynnik czasu');
  assertFiniteRange(initialSeconds, 0, 86400, 'początkowy czas');
  assertFiniteRange(exponent, 0.01, 2, 'wykładnik czasu');
  if (!Array.isArray(tiers) || tiers.length !== TIERS.length) throw new RangeError('Nieprawidłowe poziomy zbieractwa.');

  const remaining = {};
  let totalUnits = 0;
  let totalCarry = 0;
  for (const unit of UNITS) {
    const count = selectedUnits[unit.id] === false || availableUnits[unit.id] === false ? 0 : counts[unit.id] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000_000) throw new RangeError(`Nieprawidłowa liczba jednostek: ${unit.name}.`);
    remaining[unit.id] = count;
    totalUnits += count;
    totalCarry += count * unit.carry * carryFactor;
  }

  const active = tiers.filter(tier => tier.active);
  for (const tier of active) assertFiniteRange(tier.lootFactor, 0.001, 10, `mnożnik łupu poziomu ${tier.id}`);
  if (new Set(tiers.map(tier => tier.id)).size !== TIERS.length || tiers.some(tier => !TIERS.some(def => def.id === tier.id))) {
    throw new RangeError('Nieprawidłowe identyfikatory poziomów.');
  }

  const allocations = Object.fromEntries(tiers.map(tier => [tier.id, Object.fromEntries(UNITS.map(unit => [unit.id, 0]))]));
  const weightSum = active.reduce((sum, tier) => sum + 1 / tier.lootFactor, 0);
  const targets = Object.fromEntries(active.map(tier => [tier.id, totalCarry * (1 / tier.lootFactor) / weightSum]));
  // Największe całe partie jako pierwsze: zwykle wystarczy jedna wartość na poziom.
  const orderedUnits = [...UNITS].sort((a, b) => (remaining[b.id] * b.carry - remaining[a.id] * a.carry) || (a.carry - b.carry));
  let remainingUnits = totalUnits;

  for (let tierIndex = 0; tierIndex < active.length - 1; tierIndex += 1) {
    const tier = active[tierIndex];
    const laterTiers = active.length - tierIndex - 1;
    let allocatedCarry = 0;
    let allocatedCount = 0;

    for (const unit of orderedUnits) {
      const gap = targets[tier.id] - allocatedCarry;
      if (gap <= 0) break;
      const maxTake = Math.min(remaining[unit.id], Math.max(0, remainingUnits - laterTiers));
      if (maxTake === 0) continue;
      const unitCarry = unit.carry * carryFactor;
      const take = Math.min(maxTake, Math.round(gap / unitCarry));
      if (take === 0) continue;
      allocations[tier.id][unit.id] += take;
      remaining[unit.id] -= take;
      remainingUnits -= take;
      allocatedCount += take;
      allocatedCarry += take * unitCarry;
    }

    if (allocatedCount === 0 && remainingUnits > laterTiers) {
      const smallest = [...UNITS].filter(unit => remaining[unit.id] > 0).sort((a, b) => a.carry - b.carry)[0];
      if (smallest) {
        allocations[tier.id][smallest.id] += 1;
        remaining[smallest.id] -= 1;
        remainingUnits -= 1;
      }
    }
  }

  if (active.length) {
    const last = allocations[active.at(-1).id];
    for (const unit of UNITS) last[unit.id] += remaining[unit.id];
  }

  const results = tiers.map(tier => {
    const assigned = allocations[tier.id];
    const carry = UNITS.reduce((sum, unit) => sum + assigned[unit.id] * unit.carry * carryFactor, 0);
    const loot = tier.active ? Math.round(carry * tier.lootFactor) : 0;
    return {
      id: tier.id,
      name: TIERS.find(def => def.id === tier.id).name,
      active: tier.active,
      lootFactor: tier.lootFactor,
      targetCarry: targets[tier.id] ?? 0,
      counts: assigned,
      carry,
      loot,
      resources: splitResources(loot),
      seconds: tier.active ? expeditionSeconds(carry, tier.lootFactor, { durationFactor, initialSeconds, exponent }) : 0,
    };
  });

  const totalResources = results.reduce((sum, tier) => ({
    wood: sum.wood + tier.resources.wood,
    clay: sum.clay + tier.resources.clay,
    iron: sum.iron + tier.resources.iron,
  }), { wood: 0, clay: 0, iron: 0 });
  return { totalCarry, totalUnits, activeCount: active.length, totalLoot: results.reduce((sum, tier) => sum + tier.loot, 0), totalResources, results };
}

const calculator = { UNITS, TIERS, DEFAULT_DURATION_FACTOR, expeditionSeconds, splitResources, calculatePlan };
if (typeof module === 'object' && module.exports) module.exports = calculator;
else root.VZbierakCalculator = calculator;
})(globalThis);
