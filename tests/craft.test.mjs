import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../scripts/craft-model.mjs";
import { cleanRecipe, normalizeKnown } from "../scripts/recipes-model.mjs";
import { defaultRanks } from "../scripts/ranks-model.mjs";
import { cleanProfession } from "../scripts/professions-model.mjs";

// Every number below is a made-up test value, not a rulebook figure.
const rules = C.normalizeRules({ v: 1, timeHours: 2, timePerGp: 5, rounding: "hour", hoursPerDay: 6, materialPct: 40, consumablePct: 50, dc: 11,
  byRarity: { rare: { hours: 30, cost: 300, dc: 17 } }, helpersMax: 2, helperDivides: true, rankTime: { 3: 50 } });
const smith = cleanProfession({ id: "smithing", name: "Smithing", tools: ["smith", "mason"] });
const blade = cleanRecipe({ id: "blade", name: "Blade", profession: "smithing", result: { uuid: "Item.blade", name: "Blade", type: "weapon", price: { value: 10, denomination: "gp" } }, materials: [{ uuid: "Item.bar", name: "Bar", qty: 3 }, { name: "Grip", qty: 1 }] });
const inv = [{ id: "i1", name: "Iron bar", qty: 2, sources: ["Item.bar"] }, { id: "i2", name: "Bar", qty: 5, sources: ["Compendium.a.b.Item.bar"] }, { id: "i3", name: " grip ", qty: 1, sources: [] }];
const world = C.BOOK_VALUES;
const base = { recipe: blade, profession: smith, rules, ranks: defaultRanks(), facts: { pb: 2, tools: { smith: 1 } }, known: normalizeKnown({ v: 1, ids: ["blade"] }), inventory: inv, purse: 10000, values: world, worldValues: world, toolLabels: { smith: "Smith's tools" } };

test("default rules: nothing set, neutral", () => {
  const d = C.normalizeRules(undefined);
  assert.deepEqual([d.timeHours, d.timePerGp, d.materialPct, d.dc, d.hoursPerDay], [null, null, null, null, null]);
  assert.deepEqual([d.consumablePct, d.helpersMax, d.helperDivides, d.failMaterials, d.chargeCoin], [100, 0, false, "lose", false], "a failure uses the materials up by default");
  assert.ok(Object.values(d.byRarity).every(r => r.hours === null && r.cost === null && r.dc === null));
  assert.deepEqual(C.rulesStatus(d).set, []);
  assert.equal(C.rulesStatus(rules).unset.length, 0);
});

test("normalizeRules clamps and drops junk", () => {
  const r = C.normalizeRules({ v: 1, dc: 99, materialPct: -3, rounding: "weird", failMaterials: "x", helpersMax: 99, rankTime: { 3: 100, 4: "abc", 99: 50, 5: 80 }, byRarity: { rare: { dc: "12.6" }, nope: { dc: 3 } }, timePerGp: 0 });
  assert.equal(r.dc, 40); assert.equal(r.materialPct, 0); assert.equal(r.rounding, "hour"); assert.equal(r.failMaterials, "lose");
  assert.equal(C.normalizeRules({ v: 1, failMaterials: "keep" }).failMaterials, "keep", "the GM's option stays");
  assert.equal(r.helpersMax, C.HELPERS_MAX); assert.deepEqual(r.rankTime, { 5: 80 }); assert.equal(r.byRarity.rare.dc, 13);
  assert.ok(!("nope" in r.byRarity)); assert.equal(r.timePerGp, null);
});

test("rules import / export", () => {
  const back = C.readRulesImport(C.exportRules(rules));
  assert.equal(back.ok, true); assert.deepEqual(back.rules, rules);
  assert.equal(C.readRulesImport(JSON.stringify({ dc: 9 })).rules.dc, 9, "a bare rules object");
  assert.equal(C.readRulesImport("[]").ok, false);
  assert.match(C.readRulesImport(JSON.stringify({ format: "wanderers-guild.recipes" })).error, /not crafting rules/);
  assert.match(C.readRulesImport(JSON.stringify({ v: 4 })).error, /newer/);
});

test("money: price, gp, purse, pay with change", () => {
  assert.equal(C.priceAmount({ value: 2.5, denomination: "sp" }, world), 25);
  assert.equal(C.priceAmount(null, world), null);
  const three = { gp: 10000, sp: 100, cp: 1 };
  assert.equal(C.priceAmount({ value: 1, denomination: "gp" }, three), 10000);
  assert.equal(C.gpAmount(1.5, world), 150); assert.equal(C.amountGp(250, world), 2.5);
  assert.equal(C.purseTotal({ gp: 1, sp: 2, cp: 3, pp: "x" }, world), 123);
  assert.deepEqual(C.payPlan({ gp: 1, sp: 0, cp: 5 }, 7, world).currency, { pp: 0, gp: 0, ep: 0, sp: 9, cp: 8 }, "breaks the gold, change in silver and copper");
  assert.deepEqual(C.payPlan({ gp: 2, cp: 50 }, 50, world).currency, { pp: 0, gp: 2, ep: 0, sp: 0, cp: 0 });
  assert.equal(C.payPlan({ cp: 3 }, 4, world).error, "Not enough coin.");
  const p = C.payPlan({ gp: 1 }, 1, three);
  assert.equal(C.purseTotal(p.currency, three), 9999);
});

test("materials: match by source or name, consume plan", () => {
  assert.equal(C.haveOf(inv, blade.materials[0]), 7, "the stack from that item, and stacks with the same name");
  assert.equal(C.haveOf(inv, { uuid: "Item.bar", name: "", qty: 1, img: "" }), 2, "a UUID alone matches only its source");
  assert.equal(C.haveOf(inv, { uuid: "", name: "GRIP", qty: 1, img: "" }), 1);
  assert.equal(C.haveOf(inv, { uuid: "Compendium.a.b.Item.bar", name: "Bar", qty: 1, img: "" }), 5, "a UUID match or the same name (\"Iron bar\" is neither)");
  const plan = C.consumePlan(inv, [{ uuid: "Item.bar", name: "Bar", qty: 6, img: "" }]);
  assert.deepEqual(plan, { updates: [{ _id: "i2", "system.quantity": 1 }], deletes: ["i1"] });
  assert.match(C.consumePlan(inv, blade.materials, 3).error, /Not enough Bar/);
  assert.deepEqual(C.consumePlan(inv, [{ uuid: "", name: "grip", qty: 1, img: "" }], 1), { updates: [], deletes: ["i3"] });
});

test("assess: a mundane recipe with time and cost from the price", () => {
  const a = C.assess({ ...base, inventory: [...inv, { id: "i4", name: "Bar", qty: 1, sources: ["Item.bar"] }] });
  assert.equal(a.canCraft, true, a.problems.join("; "));
  assert.equal(a.status, "ok");
  assert.equal(a.hours, 4, "2 hours per 5 gp of a 10 gp item");
  assert.equal(a.cost, 400, "40 % of 10 gp, in copper");
  assert.equal(a.charge, 0, "not charged unless the rules say so");
  assert.equal(a.dc, 11); assert.equal(a.rarityLabel, "Mundane"); assert.deepEqual(a.tool, { key: "smith", mult: 1, label: "Smith's tools" });
});

test("assess: problems, rank, unknown, coin", () => {
  const short = C.assess({ ...base, inventory: inv.slice(0, 2) });
  assert.equal(short.materialsOk, false); assert.equal(short.status, "missing"); assert.deepEqual(short.problems, ["Missing materials."]);
  const unknown = C.assess({ ...base, known: normalizeKnown(undefined) });
  assert.equal(unknown.status, "unknown");
  const rare = cleanRecipe({ ...blade, result: { ...blade.result, rarity: "rare" } });
  const r = C.assess({ ...base, recipe: rare });
  assert.equal(r.status, "rank"); assert.equal(r.need.name, "Adept"); assert.match(r.problems.join(" "), /Needs Adept \+4/);
  assert.equal(r.dc, 17, "the rarity table's DC"); assert.equal(r.cost, 30000); assert.equal(r.hours, 30);
  const noTool = C.assess({ ...base, facts: { pb: 2, tools: { smith: 0.5 } } });
  assert.match(noTool.problems[0], /Needs the Smithing profession/);
  const charged = C.assess({ ...base, rules: { ...rules, chargeCoin: true }, purse: 100 });
  assert.equal(charged.charge, 400); assert.equal(charged.coinOk, false);
  assert.equal(C.assess({ ...base, profession: null }).problems[0], "The recipe's profession doesn't exist.");
  const noLink = C.assess({ ...base, profession: cleanProfession({ id: "smithing", name: "Odd", tools: [] }) });
  assert.match(noLink.problems[0], /no linked tool/);
});

test("assess: time modifiers, rounding, consumables, overrides, no DC", () => {
  const potion = cleanRecipe({ ...blade, materials: [], result: { ...blade.result, type: "consumable", rarity: "rare" } });
  const adept = { ...base, recipe: potion, facts: { pb: 4, tools: { smith: 1 } } };
  const a = C.assess(adept);
  assert.equal(a.hours, 15, "consumables take 50 %"); assert.equal(a.cost, 15000);
  assert.deepEqual(a.timeNotes, ["consumable 50%"]);
  const helped = C.assess({ ...adept, helpers: 5 });
  assert.equal(helped.hours, 5, "two helpers at most, each divides: 15 / 3");
  const apprentice = C.assess({ ...base, inventory: [], facts: { pb: 3, tools: { smith: 2 } } });
  assert.equal(apprentice.hours, 2, "the rank's 50 %"); assert.equal(apprentice.tool.mult, 2);
  const days = C.assess({ ...base, rules: { ...rules, rounding: "day" } });
  assert.equal(days.hours, 6, "up to a working day of 6 hours");
  const own = C.assess({ ...base, recipe: { ...blade, hours: 1.5, cost: 2, dc: 8 } });
  assert.deepEqual([own.hours, own.cost, own.dc], [2, 200, 8]);
  const bare = C.assess({ ...base, rules: C.normalizeRules(undefined) });
  assert.deepEqual([bare.hours, bare.cost, bare.dc], [null, null, null]);
  assert.equal(C.outcome(12, null), true, "no DC set: the roll crafts it"); assert.equal(C.outcome(1, null), true); assert.equal(C.outcome(11, 11), true); assert.equal(C.outcome(10, 11), false);
});

test("rank helpers, tools, spending, decisions, time text", () => {
  const t = defaultRanks();
  assert.equal(C.minRankFor("", t), null); assert.equal(C.minRankFor("veryRare", t).name, "Expert");
  assert.equal(C.minRankFor("artifact", t), null);
  assert.equal(C.rankAllows("", null), true); assert.equal(C.rankAllows("common", null), false);
  assert.deepEqual(C.craftTool(smith, { tools: { smith: 1, mason: 2 } }), { key: "mason", mult: 2 });
  assert.equal(C.craftTool(smith, { tools: { smith: 0.5 } }), null);
  assert.equal(C.spends(false, rules), true, "default: used up on a failure"); assert.equal(C.spends(false, { ...rules, failMaterials: "keep" }), false); assert.equal(C.spends(true, { ...rules, failMaterials: "keep" }), true);
  assert.deepEqual(C.decide({ dc: 10, total: 12 }, "approve"), { success: true });
  assert.equal(C.decide({ dc: null, total: 12 }, "approve"), null);
  assert.deepEqual(C.decide({ dc: null, total: 3 }, "success"), { success: true });
  assert.deepEqual(C.decide({ dc: 10, total: 3 }, "refuse"), { refuse: true });
  assert.equal(C.decide({ dc: 10, total: 3 }, "bogus"), null);
  assert.equal(C.hoursText(0.5), "30 minutes"); assert.equal(C.hoursText(1), "1 hour");
  assert.equal(C.hoursText(9, 6), "9 hours (1.5 days of 6 hours)"); assert.equal(C.hoursText(null), "");
});

test("materials from the inventory: typed names match carried items, the notice says what goes", () => {
  const typed = cleanRecipe({ ...blade, materials: [{ name: "Copper Bar", qty: 2 }, { name: "Weak Flux", qty: 1 }] });
  const carried = [{ id: "c1", name: "copper  bar", qty: 3, sources: ["Item.other"] }, { id: "f1", name: "Weak Flux", qty: 1, sources: [] }];
  const a = C.assess({ ...base, recipe: typed, inventory: carried });
  assert.deepEqual(a.materials.map(m => [m.name, m.have, m.need, m.ok]), [["Copper Bar", 3, 2, true], ["Weak Flux", 1, 1, true]]);
  assert.equal(a.canCraft, true, a.problems.join("; "));
  assert.deepEqual(C.consumePlan(carried, typed.materials), { updates: [{ _id: "c1", "system.quantity": 1 }], deletes: ["f1"] });
  assert.equal(C.assess({ ...base, recipe: typed, inventory: carried.slice(0, 1) }).problems[0], "Missing materials.");
  assert.deepEqual(C.usedList(typed.materials), ["2× Copper Bar", "1× Weak Flux"]);
  assert.equal(C.usesNotice(a.materials, { fail: "lose" }), "Crafting uses up: 2× Copper Bar, 1× Weak Flux (taken when you roll, success or failure).");
  assert.equal(C.usesNotice(a.materials, { fail: "keep" }), "Crafting uses up: 2× Copper Bar, 1× Weak Flux (taken when you roll, on success; kept on a failure).");
  assert.match(C.usesNotice(a.materials, { fail: "lose", charge: true, approval: true }), /Weak Flux, the coin cost \(taken when the GM decides/);
  assert.equal(C.usesNotice([], { fail: "lose" }), "Crafting uses up nothing from the inventory.");
});
