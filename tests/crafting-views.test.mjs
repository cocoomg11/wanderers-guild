import { test } from "node:test";
import assert from "node:assert/strict";
import * as V from "../scripts/crafting-view.mjs";
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import * as CV from "../scripts/craft-setup-view.mjs";
import { assess, normalizeRules, BOOK_VALUES, defaultRules, RULES_VERSION } from "../scripts/craft-model.mjs";
import { cleanRecipe, normalizeKnown, normalizeRecipes } from "../scripts/recipes-model.mjs";
import { defaultRanks, RARITIES } from "../scripts/ranks-model.mjs";
import { cleanProfession } from "../scripts/professions-model.mjs";
import { learnState } from "../scripts/learn-model.mjs";

const prof = cleanProfession({ id: "smithing", name: "Smithing", tools: ["smith"] });
const mk = (o, extra = {}) => {
  const recipe = cleanRecipe({ profession: "smithing", result: { uuid: "Item.x", name: o.name, img: "x.webp", type: "weapon", price: { value: 4, denomination: "gp" } }, ...o });
  const a = assess({ recipe, profession: prof, rules: normalizeRules({ v: 1, dc: 12 }), ranks: defaultRanks(), facts: { pb: 2, tools: { smith: 1 } }, known: normalizeKnown({ v: 1, ids: ["known-one", "<x>"] }), inventory: [], purse: 0, values: BOOK_VALUES, worldValues: BOOK_VALUES, toolLabels: { smith: "Smith's tools" } });
  const route = o.learn ?? "rank";
  const row = { ...a, group: o.group ?? "Weapons", img: "x.webp", notes: o.notes ?? "", qty: 1, toolTotal: "+4", source: o.auto ? "everyone" : "", route, ...extra };
  return { ...row, learnState: learnState({ knows: row.knows, route, rankOk: row.rankOk, playersLearn: true, hasItem: !!row.hasItem, gm: false }) };
};
/** Rows as a given viewer sees them (the window computes learnState per user). */
const as = (list, o) => list.map(r => ({ ...r, learnState: learnState({ knows: r.knows, route: r.route, rankOk: r.rankOk, playersLearn: o.playersLearn ?? true, hasItem: !!r.hasItem, gm: !!o.gm }) }));
const rows = [mk({ id: "known-one", name: "Known <one>", notes: "a & b" }), mk({ id: "auto", name: "Everyone's", auto: true, group: "Tools" }), mk({ id: "rare", name: "Rare Thing", result: { uuid: "Item.y", name: "Rare Thing", rarity: "rare" } }), mk({ id: "new", name: "Unknown" })];
const base = { mode: "craft", actorName: "Ma<ren>", profession: { id: "smithing", name: "Smithing", icon: "M0 0" }, rankText: "Novice +2", craftsUpTo: "Common", gm: false, playersLearn: true, economyNote: "book values", query: "", filter: "all", rows, selected: null, helpers: 0, helpersMax: 0, helperDivides: false, hoursPerDay: null, failText: "Kept", approval: false, noGM: false, money: n => `<i data-money="${n}"></i>` };

test("Craft page: list, detail, escaping, time note, disabled craft", () => {
  const html = V.craftPageHTML(base);
  assert.ok(html.includes("Ma&lt;ren&gt;") && !html.includes("Ma<ren>"));
  assert.ok(html.includes("Known &lt;one&gt;") && html.includes("a &amp; b"));
  assert.equal((html.match(/data-action="wgPick"/g) ?? []).length, 4);
  assert.ok(html.includes(`data-money="400"`), "the value through the caller's money()");
  assert.ok(html.includes("not set (Crafting rules)"), "no time rule: says so");
  assert.ok(html.includes("DC 12"));
  assert.ok(/data-action="wgCraftNow"[^>]*>/.test(html));
  assert.ok(V.craftPageHTML({ ...base, selected: "rare" }).includes("Adept +4 or higher"), "the rare recipe names the rank it needs");
  assert.ok(html.includes("wg-st-unk"), "an unknown recipe is marked");
  assert.ok(!/wc-r\d/.test(html));
  const sel = V.craftPageHTML({ ...base, selected: "rare" });
  assert.match(sel, /wgCraftNow"[^>]*disabled/);
  const can = V.craftPageHTML({ ...base, selected: "auto" });
  assert.ok(!/wgCraftNow"[^>]*disabled/.test(can), "known, mundane, no materials: craftable");
  assert.match(V.craftPageHTML({ ...base, selected: "auto", noGM: true }), /No GM is connected/);
  assert.match(V.craftPageHTML({ ...base, selected: "auto", locked: true }), /wgCraftNow"[^>]*disabled/);
  assert.ok(V.craftPageHTML({ ...base, rows: [] }).includes("No recipes for Smithing yet"));
});

test("Craft page: search, filter, groups", () => {
  assert.deepEqual(V.searchRows(rows, "tools").map(r => r.id), ["auto"]);
  assert.deepEqual(V.groupRows(rows).map(g => [g.label, g.rows.length]), [["Weapons", 3], ["Tools", 1]]);
  const can = V.craftPageHTML({ ...base, filter: "can" });
  assert.equal((can.match(/data-action="wgPick"/g) ?? []).length, 2, "the known and the everyone recipe");
  assert.ok(V.craftPageHTML({ ...base, query: "zzz" }).includes("Nothing matches"));
  assert.ok(V.craftPageHTML({ ...base, helpersMax: 2 }).includes("data-wg-helpers"));
});

test("Recipes page: sections and buttons by role", () => {
  const p = V.recipesPageHTML({ ...base, mode: "recipes" });
  assert.match(p, /Known<span class="r">2/); assert.match(p, /Can learn<span class="r">1/); assert.match(p, /Needs a higher rank<span class="r">1/);
  assert.equal((p.match(/data-action="wgLearn"/g) ?? []).length, 1, "a player learns what their rank allows");
  assert.ok(!p.includes("wgForget"));
  assert.ok(p.includes("with the profession"));
  const off = V.recipesPageHTML({ ...base, mode: "recipes", playersLearn: false, rows: as(rows, { playersLearn: false }) });
  assert.ok(!off.includes(`data-action="wgLearn"`) && off.includes("Ask your GM"));
  const gm = V.recipesPageHTML({ ...base, mode: "recipes", gm: true, rows: as(rows, { gm: true }) });
  assert.equal((gm.match(/data-action="wgLearn"/g) ?? []).length, 2, "the GM teaches anything");
  assert.equal((gm.match(/data-action="wgForget"/g) ?? []).length, 1, "not the everyone recipe");
  assert.equal(V.craftWindowHTML({ ...base, mode: "recipes" }), p);
});

test("chat card: states, GM buttons, escaping", () => {
  const c = { state: "pending", actorName: "A<b>", recipeName: "Blade", rarity: "", img: "", qty: 2, toolLabel: "Smith's tools", total: 14, dc: 12, timeText: "4 hours", reason: "", used: [], coin: "", approvalAsked: true };
  const pending = V.cardHTML(c);
  assert.ok(pending.includes("A&lt;b&gt;") && pending.includes("14 vs DC 12") && pending.includes("Approve success"));
  assert.ok(pending.includes("wg-gm-only") && pending.includes("wg-player-only"));
  assert.ok(pending.includes(V.TIME_NOTE));
  assert.ok(pending.startsWith(`<div class="${UI_CLASSES.join(" ")} wg-chat`), "core's root from UI_CLASSES");
  const approvalNoDc = V.cardHTML({ ...c, dc: null });
  assert.ok(approvalNoDc.includes(`data-wg-choice="success"`) && approvalNoDc.includes(`data-wg-choice="failure"`) && approvalNoDc.includes("The GM approves each craft"));
  assert.ok(!approvalNoDc.includes("no DC set: crafted"), "only a finished craft says so");
  const done = V.cardHTML({ ...c, state: "done", used: ["3× Bar <x>"], coin: "<i>5</i>" });
  assert.ok(!done.includes("data-wg-choice") && done.includes("Crafted") && done.includes("Used up") && done.includes("3× Bar &lt;x&gt;") && done.includes("<i>5</i>"));
  const noDc = V.cardHTML({ ...c, state: "done", dc: null, approvalAsked: false, used: ["1× Bar"] });
  assert.ok(noDc.includes("14") && noDc.includes("no DC set: crafted") && !noDc.includes("vs DC"));
  assert.ok(V.cardHTML({ ...c, state: "error", reason: "Nope <b>" }).includes("Nope &lt;b&gt;"));
  assert.equal(V.qualityOf(""), "common"); assert.equal(V.qualityOf("veryRare"), "epic");
});

test("setup: recipes page and editor", () => {
  const book = normalizeRecipes({ v: 1, list: [{ id: "a", name: "A <x>", profession: "smithing", auto: true, materials: [{ name: "Bar", qty: 2 }] }, { id: "b", name: "B", profession: "gone" }] });
  const profs = [{ key: "smithing", label: "Smithing" }];
  const rar = RARITIES.map(r => ({ key: r.key, label: r.label }));
  const page = CV.recipesPage({ list: book.list, professions: profs, rarities: rar, editing: "a", json: "{\"x\":\"<y>\"}", warnings: ["w <z>"] });
  assert.ok(page.includes("A &lt;x&gt;") && page.includes("gone (missing)") && page.includes("w &lt;z&gt;"));
  assert.ok(page.includes(`data-form="recipe"`) && page.includes(`name="mat.name.0" maxlength="80" value="Bar"`));
  assert.ok(page.includes(`data-wg-drop="result"`) && page.includes(`data-wg-drop="mat.new"`));
  assert.ok(page.includes("&lt;y&gt;"), "the JSON box is escaped");
  assert.ok(page.includes(`data-action="ioImport" data-kind="recipes"`));
  const filtered = CV.recipesPage({ list: book.list, professions: profs, rarities: rar, json: "", filter: "smithing" });
  assert.equal((filtered.match(/data-action="recEdit"/g) ?? []).length, 1);
  const draft = CV.recipesPage({ list: [], professions: profs, rarities: rar, editing: "new", draft: { name: "Draft", materials: [{ uuid: "Item.q", name: "", qty: 4 }] }, json: "" });
  assert.ok(draft.includes(`value="Draft"`) && draft.includes(`value="Item.q"`) && draft.includes("New recipe"));
});

test("setup: recipe form reader", () => {
  const r = CV.readRecipeForm([["id", ""], ["name", "X"], ["profession", "smithing"], ["result.uuid", " Item.a "], ["result.qty", "3"], ["mat.name.1", "B"], ["mat.qty.1", "2"], ["mat.uuid.0", "Item.m"], ["mat.qty.0", "x"], ["dc", ""], ["hours", "1.5"], ["auto", "on"], ["junk", "1"]]);
  assert.deepEqual(r, { result: { uuid: "Item.a", qty: 3 }, materials: [{ uuid: "Item.m", name: "", qty: 1 }, { uuid: "", name: "B", qty: 2 }], auto: true, name: "X", profession: "smithing", dc: null, hours: 1.5 });
});

test("setup: rules page and reader (empty by default, hints to fill in)", () => {
  const html = CV.rulesPage({ rules: defaultRules(), rarities: RARITIES.map(r => ({ key: r.key, label: r.label })), ranks: defaultRanks().rows, status: { set: [], unset: ["a DC"] }, json: "{}" });
  assert.ok(html.includes("Fill these in from your rules") && html.includes("Nothing is set yet"));
  assert.ok(html.includes(`name="timeHours" value=""`), "empty, not a shipped number");
  assert.ok(html.includes(`name="rarity.rare.cost" value=""`) && html.includes(`name="rankTime.6" value=""`));
  assert.ok(html.includes("calendar is never advanced"));
  const raw = CV.readRulesForm([["timeHours", "2"], ["timePerGp", "5"], ["rounding", "day"], ["rarity.rare.hours", "30"], ["rarity.rare.dc", ""], ["rankTime.3", "50"], ["rankTime.4", ""], ["chargeCoin", "on"], ["consumablePct", ""]]);
  assert.equal(raw.v, RULES_VERSION);
  const r = normalizeRules(raw);
  assert.deepEqual([r.timeHours, r.timePerGp, r.rounding, r.byRarity.rare.hours, r.byRarity.rare.dc, r.chargeCoin, r.consumablePct], [2, 5, "day", 30, null, true, 100]);
  assert.deepEqual(r.rankTime, { 3: 50 });
});

test("Craft page: what the craft uses up is said before the roll, next to the button and as its tooltip", () => {
  const withMats = [mk({ id: "known-one", name: "Pot", materials: [{ name: "Copper Bar", qty: 2 }, { name: "Weak Flux", qty: 1 }] })];
  const html = V.craftPageHTML({ ...base, rows: withMats });
  const text = "Crafting uses up: 2× Copper Bar, 1× Weak Flux (taken when you roll, success or failure).";
  assert.ok(html.includes(`<p class="wg-uses" role="note" data-wg-uses>${text}</p>`), "the notice in the footer");
  assert.match(html, new RegExp(`data-action="wgCraftNow"[^>]*title="${text.replace(/[().]/g, "\\$&")}"`), "the button's tooltip");
  assert.ok(html.includes("in the inventory: have / need") && html.includes("0 / 2"));
  assert.ok(V.craftPageHTML({ ...base, rows: withMats, failRule: "keep" }).includes("on success; kept on a failure"));
  assert.ok(V.craftPageHTML({ ...base, rows: withMats, approval: true }).includes("taken when the GM decides"));
  assert.ok(!html.includes("type=\"checkbox\"") && !html.includes("confirm"), "no confirm step");
  const noDc = mk({ id: "auto", name: "Free", auto: true });
  const bare = assess({ recipe: cleanRecipe({ id: "auto", auto: true, profession: "smithing", result: { uuid: "Item.x", name: "Free" } }), profession: prof, rules: normalizeRules(undefined), ranks: defaultRanks(), facts: { pb: 2, tools: { smith: 1 } }, known: normalizeKnown(undefined), inventory: [], purse: 0, values: BOOK_VALUES, worldValues: BOOK_VALUES });
  const free = V.craftPageHTML({ ...base, rows: [{ ...noDc, ...bare, group: "x", img: "", notes: "", qty: 1, toolTotal: "", source: "everyone" }] });
  assert.ok(free.includes("no DC set: the roll crafts it") && free.includes("no DC is set, so the roll crafts it"), "no DC: nothing waits for the GM");
  assert.ok(!/wgCraftNow"[^>]*disabled/.test(free));
});
