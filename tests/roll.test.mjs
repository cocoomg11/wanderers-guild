import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyRoll, usedRolls } from "../scripts/roll-model.mjs";
import { allowedDays, DAYS_MAX, ROLL_MAX_AGE_MS } from "../scripts/gather-model.mjs";

// Test numbers are made up.
const d20 = (/** @type {number[]} */ ...results) => ({ faces: 20, results: results.map((r, i) => ({ result: r, active: i === 0 })) });
const skill = { kind: /** @type {const} */ ("skill"), key: "sur", bonus: 5, ability: "wis" };
const tool = { kind: /** @type {const} */ ("tool"), key: "herb", bonus: 3, ability: "int" };

test("verifyRoll: one d20 plus the character's own bonus passes", () => {
  assert.deepEqual(verifyRoll({ total: 17, dice: [d20(12)], skill: "sur", ability: "wis" }, skill), { ok: true, die: 12, bonus: 5 });
  assert.equal(verifyRoll({ total: 4, dice: [d20(1)], tool: "herb" }, tool).ok, true);
  assert.equal(verifyRoll({ total: 18, dice: [{ faces: 20, results: [{ result: 9, active: false }, { result: 15, active: true }] }], tool: "herb" }, tool).ok, true, "advantage: the kept die");
  assert.equal(verifyRoll({ total: 8, dice: [d20(5)] }, tool).ok, true, "no check key on the message: bonus decides");
  assert.equal(verifyRoll({ total: 2, dice: [d20(4)] }, { ...tool, bonus: -2 }).ok, true, "negative bonus");
});

test("verifyRoll: forged or uncheckable rolls are refused", () => {
  const bad = (/** @type {any} */ f, /** @type {any} */ e = skill) => { const v = verifyRoll(f, e); assert.equal(v.ok, false); return /** @type {any} */ (v).error; };
  assert.match(bad({ total: 40, dice: [d20(12)], skill: "sur" }), /bonus \(\+28\) isn't the character's \(\+5\)/);
  assert.match(bad({ total: 19, dice: [d20(12)], skill: "sur" }), /situational/, "a typed situational bonus can't be checked");
  assert.match(bad({ total: 17, dice: [d20(12), { faces: 4, results: [{ result: 2, active: true }] }], skill: "sur" }), /more than one die/);
  assert.match(bad({ total: 17, dice: [], skill: "sur" }), /more than one die/);
  assert.match(bad({ total: 17, dice: [{ faces: 6, results: [{ result: 6, active: true }] }] }), /isn't a d20/);
  assert.match(bad({ total: 30, dice: [d20(25)] }), /result isn't valid/);
  assert.match(bad({ total: 5, dice: [d20(0)] }), /result isn't valid/);
  assert.match(bad({ total: 17, dice: [{ faces: 20, results: [{ result: 12, active: true }, { result: 3, active: true }] }] }), /result isn't valid/);
  assert.match(bad({ total: 17, dice: [{ faces: 20, results: [] }] }), /result isn't valid/);
  assert.match(bad({ total: 17, dice: [d20(12)], skill: "ath" }), /different check/);
  assert.match(bad({ total: 17, dice: [d20(12)], tool: "herb" }), /different check/, "a tool roll for a skill gather");
  assert.match(bad({ total: 17, dice: [d20(12)], skill: "sur", ability: "int" }), /different ability/);
  assert.match(bad({ total: 17, dice: [d20(12)] }, { ...skill, bonus: null }), /can't be read/);
  assert.match(bad({ total: NaN, dice: [d20(12)] }), /no total/);
  assert.match(bad({ total: 17.5, dice: [d20(12)] }), /no total/);
  assert.match(bad(null), /no total/);
});

test("usedRolls: remembers ids for the roll age, then forgets them", () => {
  const u = usedRolls(1000);
  assert.equal(u.has("a", 0), false);
  u.add("a", 0);
  assert.equal(u.has("a", 500), true, "unsetting the message flag doesn't matter");
  assert.equal(u.has("a", 1001), false, "older than the roll age (the age check refuses it anyway)");
  assert.equal(u.size, 0, "pruned");
  assert.equal(ROLL_MAX_AGE_MS > 0, true);
});

test("allowedDays: a GM's days as sent, a player's capped by the last journey, 1 without one", () => {
  assert.equal(allowedDays(12, { isGM: true, journeyDays: null }), 12);
  assert.equal(allowedDays(99, { isGM: true, journeyDays: 3 }), DAYS_MAX, "clamped");
  assert.equal(allowedDays(30, { isGM: false, journeyDays: 3 }), 3, "a player can't raise the quantity");
  assert.equal(allowedDays(2, { isGM: false, journeyDays: 3 }), 2, "fewer is fine");
  assert.equal(allowedDays(30, { isGM: false, journeyDays: null }), 1, "no journey: 1");
  assert.equal(allowedDays(5, { isGM: false, journeyDays: undefined }), 1);
  assert.equal(allowedDays("x", { isGM: false, journeyDays: 4 }), 1);
  assert.equal(allowedDays(0, { isGM: false, journeyDays: 4 }), 1);
});
