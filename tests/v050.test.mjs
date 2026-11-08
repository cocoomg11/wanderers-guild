// 0.5.0: better results and batches. Every number below is a made-up test value, not a rulebook figure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../scripts/craft-model.mjs";
import * as R from "../scripts/recipes-model.mjs";
import * as V from "../scripts/crafting-view.mjs";
import * as CV from "../scripts/craft-setup-view.mjs";
import { REQUESTS } from "../scripts/core.mjs";
import { readRequest } from "../vendor/wanderers-core/index.mjs";
import { defaultRanks } from "../scripts/ranks-model.mjs";
import { cleanProfession } from "../scripts/professions-model.mjs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const smith = cleanProfession({ id: "smithing", name: "Smithing", tools: ["smith"] });
const better = { qty: 1, uuid: "Item.fine", name: "Fine Blade", img: "fine.webp", type: "weapon", rarity: "uncommon" };
const blade = R.cleanRecipe({ id: "blade", name: "Blade", profession: "smithing", hours: 3, cost: 2, result: { uuid: "Item.blade", name: "Blade", img: "b.webp", type: "weapon", qty: 2 }, materials: [{ uuid: "Item.bar", name: "Bar", qty: 3 }], better });
const plain = R.cleanRecipe({ id: "plain", name: "Plain", profession: "smithing", result: { uuid: "Item.p", name: "Plain", type: "loot" } });
const inv = [{ id: "i1", name: "Bar", qty: 10, sources: ["Item.bar"] }];
const rules = C.normalizeRules({ v: 2, dc: 12, betterMargin: 5, batchMax: 4, chargeCoin: true, rounding: "none" });
const base = { recipe: blade, profession: smith, rules, ranks: defaultRanks(), facts: { pb: 2, tools: { smith: 1 } }, known: R.normalizeKnown({ v: 1, ids: ["blade", "plain"] }), inventory: inv, purse: 100000, values: C.BOOK_VALUES, worldValues: C.BOOK_VALUES };

test("recipeBook v3: better result cleaned, v2 reads with none", () => {
  assert.equal(R.RECIPES_VERSION, 3);
  const v2 = R.normalizeRecipes({ v: 2, list: [{ id: "a", name: "A", learn: "item" }] });
  assert.equal(v2.v, 3);
  assert.deepEqual(v2.list[0].better, R.noBetter(), "a v2 recipe has no better result");
  assert.equal(v2.list[0].learn, "item", "the 0.4 field is kept");
  assert.equal(R.hasBetter(v2.list[0]), false);
  assert.deepEqual(blade.better, better);
  assert.equal(R.hasBetter(blade), true);
  const odd = R.cleanBetter({ qty: -3, uuid: "javascript:x", name: "N", img: "a b.png", rarity: "mythic" });
  assert.deepEqual(odd, R.noBetter(), "junk: no qty, no item, no leftovers without a uuid");
  assert.equal(R.cleanBetter({ qty: 5000 }).qty, R.QTY_MAX);
  assert.equal(R.hasBetter({ better: R.cleanBetter({ qty: 2 }) }), true, "extra quantity alone is a better result");
  assert.equal(R.readRecipesImport(JSON.stringify({ v: 2, list: [{ name: "X" }] })).ok, true, "v2 import still read");
  const round = R.readRecipesImport(R.exportRecipes({ v: 3, list: [blade] }));
  assert.deepEqual(round.list[0].better, better, "export / import keeps it");
  assert.ok(R.recipeWarnings({ v: 3, list: [R.cleanRecipe({ name: "S", profession: "smithing", result: { uuid: "Item.s" }, better: { uuid: "Item.s" } })] }, ["smithing"]).some(w => /changes nothing/.test(w)));
});

test("craftRules v2: betterMargin and batchMax, v1 reads as off, empty defaults", () => {
  assert.equal(C.RULES_VERSION, 2);
  const d = C.defaultRules();
  assert.deepEqual([d.betterMargin, d.batchMax], [null, null], "no figures ship: both off");
  const v1 = C.normalizeRules({ v: 1, dc: 10 });
  assert.deepEqual([v1.v, v1.dc, v1.betterMargin, v1.batchMax], [2, 10, null, null]);
  const r = C.normalizeRules({ v: 2, betterMargin: "4.4", batchMax: 999 });
  assert.deepEqual([r.betterMargin, r.batchMax], [4, C.BATCH_LIMIT]);
  assert.equal(C.normalizeRules({ v: 2, batchMax: 1 }).batchMax, null, "1 means one at a time: off");
  assert.equal(C.normalizeRules({ v: 2, betterMargin: 0 }).betterMargin, 0, "a margin of 0 is allowed (DC or more)");
  assert.equal(C.normalizeRules({ v: 2, betterMargin: "x" }).betterMargin, null);
  assert.ok(C.rulesStatus(rules).set.includes("batches") && C.rulesStatus(rules).set.includes("a better-result margin"));
  assert.equal(C.readRulesImport(JSON.stringify({ v: 1, dc: 9 })).ok, true, "v1 import still read");
  assert.equal(C.readRulesImport(JSON.stringify({ v: 3 })).ok, false, "newer refused");
});

test("clampBatch: 1..batchMax, never more than asked", () => {
  assert.equal(C.clampBatch(3, rules), 3);
  assert.equal(C.clampBatch(9, rules), 4);
  assert.equal(C.clampBatch(0, rules), 1);
  assert.equal(C.clampBatch("x", rules), 1);
  assert.equal(C.clampBatch(2.9, rules), 2);
  assert.equal(C.clampBatch(5, C.defaultRules()), 1, "batches off: one");
});

test("assess with a batch: materials, time, cost and charge × N; makes × N", () => {
  const one = C.assess(base);
  const three = C.assess({ ...base, batch: 3 });
  assert.equal(one.batch, 1); assert.equal(three.batch, 3);
  assert.deepEqual(three.materials.map(m => [m.need, m.each, m.ok]), [[9, 3, true]]);
  assert.equal(three.hours, one.hours * 3);
  assert.ok(three.timeNotes.includes("batch of 3"));
  assert.equal(three.cost, one.cost * 3); assert.equal(three.charge, one.charge * 3);
  assert.equal(three.makes, 6, "2 per craft × 3");
  assert.equal(three.batchMax, 4);
  const four = C.assess({ ...base, batch: 4 });
  assert.equal(four.materialsOk, false, "12 bars needed, 10 carried");
  assert.ok(four.problems.includes("Missing materials."));
  assert.equal(C.assess({ ...base, batch: 99 }).batch, 4, "clamped inside assess");
  assert.equal(C.assess({ ...base, batch: 3, rules: { ...rules, batchMax: null } }).batch, 1, "batches off");
  const poor = C.assess({ ...base, batch: 3, purse: one.charge * 2 });
  assert.equal(poor.coinOk, false, "coin × N");
});

test("consumePlan × N", () => {
  const p = C.consumePlan(inv, blade.materials, 3);
  assert.deepEqual(p.updates, [{ _id: "i1", "system.quantity": 1 }]);
  assert.ok(C.consumePlan(inv, blade.materials, 4).error);
});

test("better outcome: needs DC + margin + a better result on the recipe", () => {
  const a = C.assess(base);
  assert.equal(a.betterAt, 17);
  assert.equal(C.isBetter(true, 17, a.betterAt), true);
  assert.equal(C.isBetter(true, 16, a.betterAt), false);
  assert.equal(C.isBetter(false, 30, a.betterAt), false, "a failure is never better");
  assert.equal(C.assess({ ...base, rules: { ...rules, dc: null } }).betterAt, null, "no DC: no better result");
  assert.equal(C.assess({ ...base, rules: { ...rules, betterMargin: null } }).betterAt, null, "no margin: off");
  assert.equal(C.assess({ ...base, recipe: plain }).betterAt, null, "recipe without one");
  assert.equal(C.isBetter(true, 40, null), false);
  assert.equal(C.assess({ ...base, rules: { ...rules, betterMargin: 0 } }).betterAt, 12);
});

test("resultPlan and betterText", () => {
  assert.deepEqual(C.resultPlan(blade, { batch: 1, better: false }), { uuid: "Item.blade", name: "Blade", img: "b.webp", type: "weapon", rarity: "", qty: 2, better: false });
  assert.deepEqual(C.resultPlan(blade, { batch: 3, better: true }), { uuid: "Item.fine", name: "Fine Blade", img: "fine.webp", type: "weapon", rarity: "uncommon", qty: 9, better: true }, "(2 + 1) × 3 of the better item");
  const extra = R.cleanRecipe({ ...blade, better: { qty: 2 } });
  assert.deepEqual([C.resultPlan(extra, { batch: 2, better: true }).uuid, C.resultPlan(extra, { batch: 2, better: true }).qty], ["Item.blade", 8], "extra only: the normal item, (2 + 2) × 2");
  assert.equal(C.resultPlan(plain, { batch: 2, better: true }).better, false, "no better result on the recipe");
  assert.equal(C.betterText(blade), "Fine Blade ×3 instead");
  assert.equal(C.betterText(extra), "2 more");
  assert.equal(C.betterText(plain), "");
});

test("usesNotice, usedList and the crafted payload with a batch", () => {
  const a = C.assess({ ...base, batch: 3 });
  assert.equal(C.usesNotice(a.materials, { fail: "lose", batch: 3 }), "A batch of 3 uses up: 9× Bar (taken when you roll, success or failure).");
  assert.equal(C.usesNotice([], { fail: "lose", batch: 2 }), "A batch of 2 uses up nothing from the inventory.");
  assert.deepEqual(C.usedList(a.materials), ["9× Bar"]);
  assert.deepEqual(C.usedList(blade.materials, 2), ["6× Bar"]);
  assert.deepEqual(C.craftedPayload({ actorId: "a", recipeId: "r", success: false, better: true, batch: 0, messageId: "m", extra: "x" }), { actorId: "a", recipeId: "r", success: false, better: false, batch: 1, messageId: "m" });
});

test("craft request: qty optional, integer 1..BATCH_LIMIT", () => {
  const rid = "abcdefgh12345678-1-mw5o4v5z";
  const req = data => readRequest(REQUESTS, { action: "request", kind: "craft", rid, data }).ok;
  const ok = { actor: "Actor.abcdefghij123456", recipe: "blade", roll: "abcdefghij123456", helpers: 0 };
  assert.equal(req(ok), true, "no qty: still read (1)");
  assert.equal(req({ ...ok, qty: 3 }), true);
  assert.equal(req({ ...ok, qty: C.BATCH_LIMIT }), true);
  for (const qty of [0, C.BATCH_LIMIT + 1, 2.5, "3", null]) assert.equal(req({ ...ok, qty }), false, `qty ${qty}`);
  assert.equal(req({ ...ok, better: true }), false, "no better field: the leader decides");
});

test("leader: batch clamped and re-assessed, consumed × batch, better from the assessment", () => {
  const src = read("scripts/craft-leader.mjs");
  assert.match(src, /CM\.clampBatch\(data\.qty \?\? 1, rules\)/);
  assert.match(src, /assessIn\(context\(actor\), recipe, data\.helpers, batch\)/);
  assert.match(src, /CM\.consumePlan\(inv, recipe\.materials, a\.batch\)/);
  assert.match(src, /CM\.isBetter\(success, st\.total \?\? null, a\.betterAt\)/);
  assert.ok(!/data\.better|data\.betterAt/.test(src), "never trusts a better result from the payload");
  assert.match(read("scripts/crafting.mjs"), /qty: a\.batch/);
});

const rowOf = (a, extra = {}) => ({ ...a, group: "Weapons", img: "b.webp", notes: "", qty: 2, toolTotal: "+4", source: "", learnState: "known", betterText: C.betterText(blade), ...extra });
const view = { mode: "craft", actorName: "Ma", profession: { id: "smithing", name: "Smithing", icon: "M0 0" }, rankText: "Novice +2", craftsUpTo: "", gm: false, playersLearn: true, economyNote: "book values", query: "", filter: "all", selected: "blade", helpers: 0, helpersMax: 0, helperDivides: false, hoursPerDay: null, failText: "x", failRule: "lose", approval: false, noGM: false, money: n => `<i data-money="${n}"></i>` };

test("Craft page: batch input only with batches on, better line, multiplied notice", () => {
  const a3 = C.assess({ ...base, batch: 3, toolLabels: { smith: "Smith's tools" } });
  const html = V.craftPageHTML({ ...view, rows: [rowOf(a3)], batch: 3 });
  assert.match(html, /data-wg-batch[^>]*|max="4"[^>]*data-wg-batch/);
  assert.ok(html.includes('value="3" data-wg-batch'));
  assert.ok(html.includes("A batch of 3 uses up: 9× Bar"));
  assert.ok(html.includes("makes 6") && html.includes("(batch of 3)"));
  assert.ok(html.includes("(3 each)"));
  assert.ok(html.includes("Better result") && html.includes("Fine Blade ×3 instead") && html.includes("on 17 or more"));
  const off = C.assess({ ...base, rules: { ...rules, batchMax: null, betterMargin: null } });
  const h2 = V.craftPageHTML({ ...view, rows: [rowOf(off)] });
  assert.ok(!h2.includes("data-wg-batch"), "batches off: no input");
  assert.ok(h2.includes("no margin set"), "the recipe has one but the rules are off");
  const none = V.craftPageHTML({ ...view, rows: [rowOf(C.assess({ ...base, recipe: plain }), { betterText: "", id: "blade" })] });
  assert.ok(!none.includes("Better result"));
  const esc = V.craftPageHTML({ ...view, rows: [rowOf(a3, { betterText: "<b>x</b>" })] });
  assert.ok(esc.includes("&lt;b&gt;x&lt;/b&gt;") && !esc.includes("<b>x</b>"));
});

test("craft card: batch and better lines", () => {
  const c = { state: "done", actorName: "Ma", recipeName: "Blade", rarity: "", img: "fine.webp", qty: 9, toolLabel: "Smith's tools", total: 18, dc: 12, timeText: "", reason: "", used: ["9× Bar"], coin: "", approvalAsked: false, batch: 3, better: true, betterName: "Fine <Blade>", betterAt: 17 };
  const html = V.cardHTML(c);
  assert.ok(html.includes("3 in one check"));
  assert.ok(html.includes("Better result") && html.includes("Fine &lt;Blade&gt; ×9") && html.includes("(17 or more)"));
  const plainCard = V.cardHTML({ ...c, batch: 1, better: false, betterName: "", betterAt: 17 });
  assert.ok(!plainCard.includes("in one check") && !plainCard.includes("wg-better"));
  assert.ok(V.cardHTML({ ...c, state: "pending", better: false }).includes("better result on 17"), "a pending card says what a better result needs");
  assert.ok(!V.cardHTML({ ...c, state: "failed", better: true }).includes("wg-better"), "a failure never shows it");
});

test("setup: recipe editor better box round-trips; rules page fields", () => {
  const html = CV.recipeEditor(blade, { professions: [{ key: "smithing", label: "Smithing" }], rarities: [{ key: "uncommon", label: "Uncommon" }] });
  assert.ok(html.includes('data-wg-drop="better"') && html.includes('name="better.qty"') && html.includes('value="Item.fine"') && html.includes("Fine Blade · Uncommon"));
  const read1 = CV.readRecipeForm([["name", "Blade"], ["result.uuid", "Item.blade"], ["better.qty", "2"], ["better.uuid", " Item.fine "]]);
  assert.deepEqual(read1.better, { qty: 2, uuid: "Item.fine" });
  assert.deepEqual(R.cleanRecipe(read1).better, { qty: 2, uuid: "Item.fine", name: "", img: "", type: "", rarity: "" });
  assert.deepEqual(CV.readRecipeForm([["better.qty", "-4"], ["better.uuid", ""]]).better, { qty: 0, uuid: "" });
  const page = CV.rulesPage({ rules, rarities: [], ranks: [], status: C.rulesStatus(rules), json: "{}" });
  assert.ok(page.includes('name="betterMargin"') && page.includes('value="5"') && page.includes('name="batchMax"') && page.includes('value="4"'));
  const empty = CV.rulesPage({ rules: C.defaultRules(), rarities: [], ranks: [], status: C.rulesStatus(C.defaultRules()), json: "{}" });
  assert.match(empty, /name="betterMargin" value=""/); assert.match(empty, /name="batchMax" value=""/);
  const back = C.normalizeRules(CV.readRulesForm([["betterMargin", "3"], ["batchMax", "6"]]));
  assert.deepEqual([back.betterMargin, back.batchMax], [3, 6]);
  const cleared = C.normalizeRules(CV.readRulesForm([["betterMargin", ""], ["batchMax", ""]]));
  assert.deepEqual([cleared.betterMargin, cleared.batchMax], [null, null]);
});

test("health: better item lines; versions", () => {
  const h = read("scripts/health.mjs");
  assert.match(h, /Better result item not found/);
  assert.match(h, /Batches: /);
  const m = JSON.parse(read("module.json")); const pkg = JSON.parse(read("package.json"));
  assert.equal(m.version, "0.5.0"); assert.equal(pkg.version, "0.5.0");
  assert.ok(m.download.endsWith("/v0.5.0/module.zip"));
  assert.match(read("CHANGELOG.md"), /^## 0\.5\.0/m);
});
