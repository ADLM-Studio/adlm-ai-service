// Unit families for /bill-match: no AWS, no database.
//
//   node scripts/test-bill-match-units.js
import assert from "node:assert/strict";
import { canonicalUnit, unitsMatch } from "../src/services/billMatchUnits.js";

const same = [
  ["m2", "Sq.m"], ["m²", "M2"], ["sqm", "m2"], ["m3", "Cu.m"], ["m³", "m3"],
  ["No.", "Nr"], ["nos", "each"], ["Tonne", "t"], ["kg", "Kgs"], ["L.S", "Sum"],
  ["Item", "item"], ["Lin m", "m"],
];
for (const [a, b] of same) assert.ok(unitsMatch(a, b), `${a} should match ${b}`);

const different = [
  ["m2", "m3"], ["m", "m2"], ["nr", "kg"], ["sum", "m2"], ["item", "nr"], ["day", "m3"],
  ["", "m2"], ["m2", ""], ["bag", "bag"],
];
for (const [a, b] of different) assert.ok(!unitsMatch(a, b), `${a} should not match ${b}`);

assert.equal(canonicalUnit("Sq. M"), "m2");
assert.equal(canonicalUnit("widget"), "");
console.log(`bill-match units: ${same.length + different.length + 2} checks pass`);
