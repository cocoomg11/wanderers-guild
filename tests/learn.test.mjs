import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../scripts/learn-model.mjs";
import * as R from "../scripts/recipes-model.mjs";
import * as V from "../scripts/crafting-view.mjs";
import * as CV from "../scripts/craft-setup-view.mjs";
import * as PV from "../scripts/professions-view.mjs";
import { pageClick } from "../scripts/sheet-page-model.mjs";
import { defaultRanks, RARITIES } from "../scripts/ranks-model.mjs";
import { cleanProfession } from "../scripts/professions-model.mjs";

const prof = cleanProfession({ id: "smithing", name: "Smithing", tools: ["smith"] });
const recipe = (o = {}) => R.cleanRecipe({ id: "blade", name: "Plain Blade", profession: "smithing", result: { uuid: "Item.abc", name: "Plain Blade" }, ...o });
const facts = (o = {}) => ({ isGM: false, owns: true, playersLearn: true, professions: [prof], tools: { smith: 1 }, pb: 2, ranks: defaultRanks(), known: R.normalizeKnown(undefined), ...o });
const item = (o = {}) => ({ teaches: L.teachesFlag("blade", true), qty: 1, ...o });

test("recipeBook v2: learn route, v1 reads as rank, import accepts v1 and v2", () => {
  assert.equal(R.RECIPES_VERSION, 2);
  assert.deepEqual(R.LEARN_ROUTES, ["rank", "item", "gm"]);
  const v1 = R.normalizeRecipes({ v: 1, list: [{ id: "a", name: "A" }, { id: "b", name: "B", learn: "item" }] });
  assert.equal(v1.v, 2);
  assert.deepEqual(v1.list.map(r => r.learn), ["rank", "item"], "v1 without a route reads as rank");
  const v2 = R.normalizeRecipes({ v: 2, list: [{ name: "A", learn: "gm" }, { name: "B", learn: "trainer" }, { name: "C", learn: 3 }] });
  assert.deepEqual(v2.list.map(r => r.learn), ["gm", "rank", "rank"], "unknown routes fall back to rank");
  assert.equal(R.cleanRecipe({ name: "New" }).learn, "rank", "default for a new recipe");
  for (const v of [1, 2]) assert.equal(R.readRecipesImport(JSON.stringify({ format: R.RECIPES_FORMAT, v, list: [{ name: "X", learn: "item" }] })).ok, true, `v${v}`);
  assert.equal(R.readRecipesImport(JSON.stringify({ v: 3, list: [] })).ok, false, "newer refused");
  const round = R.readRecipesImport(R.exportRecipes(v2));
  assert.deepEqual(round.list.map(r => r.learn), ["gm", "rank", "rank"]);
  assert.match(R.exportRecipes(v2), /"v": 2/);
});

test("teaches flag: normalizer, consume default, bad shapes", () => {
  assert.deepEqual(L.normalizeTeaches({ v: 1, recipe: "blade" }), { v: 1, recipe: "blade", consume: true });
  assert.deepEqual(L.normalizeTeaches({ v: 1, recipe: "blade", consume: false }), { v: 1, recipe: "blade", consume: false });
  assert.deepEqual(L.normalizeTeaches({ recipe: "blade" }), { v: 1, recipe: "blade", consume: true }, "no version reads as v1");
  for (const bad of [null, undefined, "x", {}, { v: 1, recipe: "Bad Id" }, { v: 1, recipe: "<b>" }, { v: 9, recipe: "blade" }]) assert.equal(L.normalizeTeaches(bad), null, JSON.stringify(bad));
  assert.deepEqual(L.teachesFlag("blade"), { v: 1, recipe: "blade", consume: true });
  assert.deepEqual(L.teachesFlag("blade", false), { v: 1, recipe: "blade", consume: false });
});

test("itemOnActor: the item must be embedded on that actor", () => {
  const a = "Actor.abcdefghij123456";
  assert.equal(L.itemOnActor(`${a}.Item.abcdefghij654321`, a), true);
  assert.equal(L.itemOnActor("Actor.zzzzzzzzzz123456.Item.abcdefghij654321", a), false, "another actor's item");
  assert.equal(L.itemOnActor("Item.abcdefghij654321", a), false, "a world item");
  assert.equal(L.itemOnActor(`${a}.Item.abc.ActiveEffect.def`, a), false, "not an item");
  assert.equal(L.itemOnActor(`${a}.Item.`, a), false);
  assert.equal(L.itemOnActor(`${a}2.Item.abcdefghij654321`, a), false, "a prefix isn't the actor");
  const tok = "Scene.abcdefghij123456.Token.abcdefghij654321.Actor.abcdefghij123456";
  assert.equal(L.itemOnActor(`${tok}.Item.abcdefghij000000`, tok), true, "unlinked token actors");
  assert.equal(L.itemOnActor("x", ""), false);
});

test("assessLearn: rank route and every refusal", () => {
  assert.equal(L.assessLearn(facts(), recipe(), "rank").ok, true);
  assert.equal(L.assessLearn(facts(), null, "rank").code, "missing");
  assert.equal(L.assessLearn(facts(), recipe(), /** @type {any} */ ("trainer")).code, "via");
  assert.equal(L.assessLearn(facts({ owns: false }), recipe(), "rank").code, "owner");
  assert.equal(L.assessLearn(facts({ known: { v: 1, ids: ["blade"] } }), recipe(), "rank").code, "known");
  assert.equal(L.assessLearn(facts(), recipe({ auto: true }), "rank").code, "known", "auto recipes are known");
  assert.equal(L.assessLearn(facts(), recipe({ learn: "gm" }), "rank").code, "gmOnly");
  assert.equal(L.assessLearn(facts(), recipe({ learn: "item" }), "rank").code, "itemOnly");
  assert.equal(L.assessLearn(facts({ playersLearn: false }), recipe(), "rank").code, "switch");
  assert.equal(L.assessLearn(facts(), recipe({ profession: "gone" }), "rank").code, "profession");
  assert.equal(L.assessLearn(facts({ tools: { smith: 0.5 } }), recipe(), "rank").code, "profession", "half proficiency isn't the profession");
  const rare = L.assessLearn(facts(), recipe({ rarity: "rare" }), "rank");
  assert.equal(rare.code, "rank"); assert.equal(rare.need?.name, "Adept"); assert.match(rare.reason, /needs Adept \+4/);
  assert.equal(L.assessLearn(facts({ pb: 4 }), recipe({ rarity: "rare" }), "rank").ok, true);
  assert.equal(L.assessLearn(facts({ pb: null }), recipe({ rarity: "rare" }), "rank").code, "rank");
  assert.equal(L.assessLearn(facts(), recipe(), "rank").consume, false);
});

test("assessLearn: item route, consume / keep", () => {
  const ok = L.assessLearn(facts({ item: item() }), recipe({ learn: "item" }), "item");
  assert.deepEqual([ok.ok, ok.consume], [true, true]);
  const keep = L.assessLearn(facts({ item: item({ teaches: L.teachesFlag("blade", false) }) }), recipe({ learn: "item" }), "item");
  assert.deepEqual([keep.ok, keep.consume], [true, false]);
  assert.equal(L.assessLearn(facts({ item: item() }), recipe({ learn: "rank" }), "item").ok, true, "a rank recipe can be learned from an item too");
  assert.equal(L.assessLearn(facts({ item: item(), playersLearn: false }), recipe({ learn: "item" }), "item").ok, true, "the switch is only for Learn");
  assert.equal(L.assessLearn(facts({ item: item() }), recipe({ learn: "gm" }), "item").code, "gmOnly");
  assert.equal(L.assessLearn(facts({ item: item({ teaches: L.teachesFlag("other") }) }), recipe(), "item").code, "noItem", "teaches another recipe");
  assert.equal(L.assessLearn(facts({ item: item({ teaches: null }) }), recipe(), "item").code, "noItem");
  assert.equal(L.assessLearn(facts(), recipe(), "item").code, "noItem", "no item at all");
  assert.equal(L.assessLearn(facts({ item: item({ qty: 0 }) }), recipe(), "item").code, "noItem", "used up");
  const above = L.assessLearn(facts({ item: item() }), recipe({ learn: "item", rarity: "veryRare" }), "item");
  assert.equal(above.code, "rank", "rank still applies to recipe items"); assert.equal(above.consume, false);
  assert.equal(L.assessLearn(facts({ item: item(), owns: false }), recipe(), "item").code, "owner");
  assert.equal(L.assessLearn(facts({ item: item(), known: { v: 1, ids: ["blade"] } }), recipe(), "item").code, "known", "nothing used up when known");
});

test("assessLearn: GM route", () => {
  assert.equal(L.assessLearn(facts({ isGM: true, owns: true }), recipe({ learn: "gm", rarity: "legendary" }), "gm").ok, true, "a GM teaches anything");
  assert.equal(L.assessLearn(facts({ isGM: true, tools: {} }), recipe({ profession: "gone" }), "gm").ok, true);
  assert.equal(L.assessLearn(facts(), recipe(), "gm").code, "gm", "a player can't use the GM route");
  assert.equal(L.assessLearn(facts({ isGM: true, known: { v: 1, ids: ["blade"] } }), recipe(), "gm").code, "known");
});

test("useUpPlan: lower a stack, delete the last, keep", () => {
  assert.deepEqual(L.useUpPlan({ id: "i1", qty: 3 }, true), { update: { _id: "i1", "system.quantity": 2 } });
  assert.deepEqual(L.useUpPlan({ id: "i1", qty: 1 }, true), { delete: "i1" });
  assert.deepEqual(L.useUpPlan({ id: "i1", qty: 0 }, true), { delete: "i1" });
  assert.equal(L.useUpPlan({ id: "i1", qty: 3 }, false), null);
});

test("learnState and visibleRows: Show vs Hide", () => {
  const st = (o) => L.learnState({ knows: false, route: "rank", rankOk: true, playersLearn: true, hasItem: false, gm: false, ...o });
  assert.equal(st({ knows: true }), "known");
  assert.equal(st({ gm: true }), "teach");
  assert.equal(st({}), "learn");
  assert.equal(st({ rankOk: false }), "rank");
  assert.equal(st({ playersLearn: false }), "gm");
  assert.equal(st({ route: "item" }), "needsItem");
  assert.equal(st({ route: "item", hasItem: true }), "item");
  assert.equal(st({ route: "item", hasItem: true, rankOk: false }), "rank");
  assert.equal(st({ route: "gm" }), "gm");
  assert.equal(st({ route: "gm", hasItem: true }), "gm");
  const rows = [{ learnState: "known" }, { learnState: "learn" }, { learnState: "item", hasItem: true }, { learnState: "needsItem" }, { learnState: "gm" }];
  assert.equal(L.visibleRows(rows, { gm: false, hide: false }).length, 5);
  assert.deepEqual(L.visibleRows(rows, { gm: false, hide: true }).map(r => r.learnState), ["known", "item"]);
  assert.deepEqual(L.visibleRows(rows, { gm: false, hide: true, craft: true }).map(r => r.learnState), ["known"]);
  assert.equal(L.visibleRows(rows, { gm: true, hide: true }).length, 5, "GMs see everything");
});

test("recipeItemRows and recipe item data", () => {
  const book = [recipe(), recipe({ id: "epic", name: "Epic <Thing>", rarity: "legendary" })];
  const rows = L.recipeItemRows([
    { uuid: "Actor.a.Item.i1", name: "Recipe: Plain Blade", img: "", qty: 1, teaches: L.teachesFlag("blade") },
    { uuid: "Actor.a.Item.i2", name: "Recipe: Epic", img: "", qty: 1, teaches: L.teachesFlag("epic", false) },
    { uuid: "Actor.a.Item.i3", name: "Old", img: "", qty: 1, teaches: L.teachesFlag("gone") }
  ], book, facts());
  assert.deepEqual(rows.map(r => r.ok), [true, false, false]);
  assert.match(rows[0].text, /uses this item up/);
  assert.match(rows[1].text, /^needs /);
  assert.equal(rows[2].recipe, "");
  const d = L.recipeItemData(recipe({ name: "A <b>", rarity: "rare" }), "Smith & Co", s => s.replace(/</g, "&lt;").replace(/&(?!lt;)/g, "&amp;"));
  assert.equal(d.type, "loot"); assert.equal(d.name, "Recipe: A <b>"); assert.equal(d.system.rarity, "rare");
  assert.deepEqual(d.flags["wanderers-guild"].teaches, { v: 1, recipe: "blade", consume: true });
  assert.ok(d.system.description.value.includes("A &lt;b>") && d.system.description.value.includes("Smith &amp; Co"));
  assert.equal(L.recipeItemData(recipe()).system.rarity, undefined, "mundane: no rarity");
});

test("health lines for recipe items", () => {
  const book = [recipe(), recipe({ id: "found", name: "Found", learn: "item" }), recipe({ id: "lost", name: "Lost", learn: "item" }), recipe({ id: "secret", name: "Secret", learn: "gm" })];
  const lines = L.recipeItemLines(book, [
    { name: "R1", teaches: L.teachesFlag("found"), where: "world" },
    { name: "R2", teaches: L.teachesFlag("deleted"), where: "Maren" },
    { name: "R3", teaches: L.teachesFlag("secret"), where: "world" },
    { name: "Junk", teaches: { nope: 1 }, where: "world" }
  ]);
  const text = lines.map(l => `${l.level}: ${l.text}`).join("\n");
  assert.match(text, /warn: Recipe items teaching a recipe that no longer exists: R2 \(Maren\)/);
  assert.match(text, /warn: Recipe items teaching a GM-only recipe .*R3/);
  assert.match(text, /warn: Learned by a recipe item, but no item teaches: Lost/);
  assert.ok(!/no item teaches: .*Found/.test(text));
  assert.match(text, /info: Recipe items: 3 \(2 in the Items sidebar, 1 carried\)/);
  assert.deepEqual(L.recipeItemLines([recipe()], []), [{ level: "info", text: "No recipe items yet." }]);
});

test("learn card and hook payload", () => {
  const c = V.learnCardHTML({ actorName: "Ma<ren>", recipeName: "Blade & <b>", rarity: "", img: "", source: "item" });
  assert.ok(c.includes("Ma&lt;ren&gt;") && c.includes("Blade &amp; &lt;b&gt;") && !c.includes("<b>Blade"));
  assert.ok(c.includes("from a recipe item") && c.includes("learned"));
  assert.ok(V.learnCardHTML({ actorName: "A", recipeName: "B", rarity: "", img: "", source: "gm" }).includes("from the GM"));
  assert.ok(!V.learnCardHTML({ actorName: "A", recipeName: "B", rarity: "", img: "", source: "rank" }).includes("from "));
  assert.deepEqual(L.learnedPayload("a1", "blade", "item"), { actorId: "a1", recipeId: "blade", source: "item" });
  assert.equal(L.learnedPayload("a1", "blade", "x").source, "gm");
  const f = L.learnCardFlag("Actor.a", "blade", "rank");
  assert.deepEqual([f.v, f.actor, f.recipe, f.source], [1, "Actor.a", "blade", "rank"]);
});

// ------------------------------------------------------------------ views

const row = (o) => ({ id: "x", name: "X", rarity: "", rarityLabel: "Mundane", knows: false, rankOk: true, learned: true, need: null, group: "Weapons", img: "", source: "", route: "rank", hasItem: false, ...o });
const view = (o = {}) => ({ mode: "recipes", actorName: "A", profession: { id: "smithing", name: "Smithing", icon: "M0 0" }, rankText: "Novice +2", craftsUpTo: "", gm: false, playersLearn: true, economyNote: "", query: "", filter: "all", selected: null, helpers: 0, helpersMax: 0, helperDivides: false, hoursPerDay: null, failText: "", approval: false, noGM: false, money: () => "", ...o });

test("Recipes page: groups and buttons per state", () => {
  const rows = [
    row({ id: "k", name: "Known one", knows: true, learnState: "known" }),
    row({ id: "l", name: "Learn me", learnState: "learn" }),
    row({ id: "i", name: "From item", route: "item", hasItem: true, itemUuid: "Actor.a.Item.i\"1", itemName: "Recipe: <x>", learnState: "item" }),
    row({ id: "r", name: "Too rare", rarity: "rare", rankOk: false, need: { name: "Adept", bonus: 4, rarity: "rare" }, learnState: "rank" }),
    row({ id: "n", name: "Needs item", route: "item", learnState: "needsItem" }),
    row({ id: "g", name: "Secret", route: "gm", learnState: "gm" })
  ];
  const p = V.recipesPageHTML(view({ rows }));
  for (const [t, n] of [["Known", 1], ["Can learn", 2], ["Needs a higher rank", 1], ["Needs a recipe item", 1], ["Ask your GM", 1]]) assert.match(p, new RegExp(`${t}<span class="r">${n}<`), t);
  assert.ok(p.indexOf("Known<") < p.indexOf("Can learn<") && p.indexOf("Can learn<") < p.indexOf("Needs a higher rank<") && p.indexOf("Needs a recipe item<") < p.indexOf("Ask your GM<"), "section order");
  assert.equal((p.match(/data-action="wgLearn"/g) ?? []).length, 1);
  assert.equal((p.match(/data-action="wgLearnItem"/g) ?? []).length, 1);
  assert.ok(p.includes(`data-item="Actor.a.Item.i&quot;1"`), "item UUID escaped");
  assert.ok(p.includes("Recipe: &lt;x&gt;") && !p.includes("Recipe: <x>"));
  assert.ok(p.includes("needs Adept +4"));
  assert.ok(p.includes("wg-unknown"), "not-known rows are greyed");
  assert.match(V.recipesPageHTML(view({ rows, noGM: true })), /wgLearnItem"[^>]*disabled/);
});

test("Recipes page: Show vs Hide", () => {
  const rows = [row({ id: "k", name: "Known one", knows: true, learnState: "known" }), row({ id: "l", name: "Learn me", learnState: "learn" }), row({ id: "i", name: "From item", hasItem: true, itemUuid: "Actor.a.Item.i1", learnState: "item" }), row({ id: "g", name: "Secret", learnState: "gm" })];
  const show = V.recipesPageHTML(view({ rows }));
  assert.ok(show.includes("Learn me") && show.includes("Secret"));
  const hide = V.recipesPageHTML(view({ rows, hideUnknown: true }));
  assert.ok(hide.includes("Known one") && hide.includes("From item") && !hide.includes("Learn me") && !hide.includes("Secret"));
  const gm = V.recipesPageHTML(view({ rows, hideUnknown: true, gm: true }));
  assert.ok(gm.includes("Secret") && gm.includes("Learn me"), "GMs see every recipe");
  const empty = V.recipesPageHTML(view({ rows: [rows[1]], hideUnknown: true }));
  assert.match(empty, /No Smithing recipes known yet/);
  // The Craft page under Hide: known recipes only.
  const craftRows = [{ ...row({ id: "k", name: "Known one", knows: true }), materials: [], problems: [], timeNotes: [], hours: null, price: null, cost: null, charge: 0, dc: null, tool: null, status: "ok", canCraft: false, qty: 1, notes: "", toolTotal: "" }, { ...row({ id: "u", name: "Unknown one" }), materials: [], problems: ["Recipe unknown."], timeNotes: [], hours: null, price: null, cost: null, charge: 0, dc: null, tool: null, status: "unknown", canCraft: false, qty: 1, notes: "", toolTotal: "" }];
  const c = V.craftPageHTML(/** @type {any} */ (view({ mode: "craft", rows: craftRows, hideUnknown: true })));
  assert.ok(c.includes("Known one") && !c.includes("Unknown one"));
  assert.ok(V.craftPageHTML(/** @type {any} */ (view({ mode: "craft", rows: craftRows }))).includes("Unknown one"));
});

test("setup: Learned by, Taught by item, Teach to…", () => {
  const book = R.normalizeRecipes({ v: 2, list: [{ id: "a", name: "A", profession: "smithing", learn: "item" }, { id: "b", name: "B", profession: "smithing", learn: "gm" }, { id: "c", name: "C", auto: true }] });
  const profs = [{ key: "smithing", label: "Smithing" }];
  const rar = RARITIES.map(r => ({ key: r.key, label: r.label }));
  const page = CV.recipesPage({ list: book.list, professions: profs, rarities: rar, editing: "a", json: "", teachItems: [{ uuid: "Item.abcdefghij123456", name: "Recipe: <A>", img: "", consume: false }] });
  assert.ok(page.includes(`<option value="item" selected>`), "the route is selected");
  assert.ok(page.includes("recipe item") && page.includes("GM only"), "badges in the list");
  assert.ok(page.includes(`data-wg-drop="teach"`) && page.includes(`data-action="teachMake" data-id="a"`));
  assert.ok(page.includes("Recipe: &lt;A&gt;") && page.includes(`data-wg-keep="Item.abcdefghij123456" checked`));
  assert.ok(page.includes(`data-action="teachRemove" data-item="Item.abcdefghij123456"`));
  assert.equal((page.match(/data-action="recTeach"/g) ?? []).length, 3);
  assert.match(page, /data-action="recTeach" data-id="c"[^>]*disabled/, "an everyone recipe needs no teaching");
  const fresh = CV.recipesPage({ list: [], professions: profs, rarities: rar, editing: "new", json: "" });
  assert.ok(fresh.includes(`<option value="rank" selected>`), "new recipes: Rank");
  assert.ok(fresh.includes("Save the recipe first"), "no drop zone before the recipe exists");
  // Round trip: the form's route goes back into the recipe.
  const r = CV.readRecipeForm([["name", "X"], ["learn", "gm"]]);
  assert.equal(r.learn, "gm");
  assert.equal(R.cleanRecipe(r)?.learn, "gm");
  assert.equal(R.cleanRecipe(CV.readRecipeForm([["name", "X"], ["learn", "<script>"]]))?.learn, "rank");
  const t = CV.teachToHTML({ recipe: "A <b>", actors: [{ uuid: "Actor.x", name: "Ma<ren>", known: true, note: "" }, { uuid: "Actor.y", name: "Bo", known: false, note: "no player" }] });
  assert.ok(t.includes("A &lt;b&gt;") && t.includes("Ma&lt;ren&gt;") && t.includes(`value="Actor.x" checked disabled`) && t.includes(`value="Actor.y">`) && t.includes("no player"));
  assert.match(CV.teachToHTML({ recipe: "A", actors: [] }), /No characters/);
});

test("Professions window and toolkit page: recipe items", () => {
  const v = { name: "A", subtitle: "", defined: 1, cards: [], others: [], unlearned: [], hiddenUnlearned: 0, isGM: false, level: null, pbText: "", canUse: true,
    recipeItems: [{ uuid: "Actor.a.Item.i1", name: "Recipe: <B>", img: "", recipe: "B", ok: true, text: "Learning uses this item up." }, { uuid: "Actor.a.Item.i2", name: "Old", img: "", recipe: "", ok: false, text: "That recipe no longer exists." }] };
  const w = PV.professionsHTML(/** @type {any} */ (v));
  assert.ok(w.includes("Recipe items") && w.includes("Recipe: &lt;B&gt;") && w.includes(`data-action="wgLearnItem" data-item="Actor.a.Item.i1"`));
  assert.equal((w.match(/wgLearnItem/g) ?? []).length, 1, "only the usable one has a button");
  assert.ok(w.includes("Teaches a recipe that no longer exists"));
  const g = PV.professionsHTML(/** @type {any} */ (v), { guest: true });
  assert.ok(g.includes(`data-wg-act="wgLearnItem"`) && !g.includes(`data-action="wgLearnItem"`), "guest pages use data-wg-act");
  assert.ok(!PV.professionsHTML(/** @type {any} */ ({ ...v, canUse: false })).includes("wgLearnItem"), "observers get no button");
  assert.ok(!PV.professionsHTML(/** @type {any} */ ({ ...v, recipeItems: [] })).includes("Recipe items"));
  const btn = { disabled: false, dataset: { wgAct: "wgLearnItem", item: "Actor.a.Item.i1" } };
  assert.deepEqual(pageClick({ closest: () => btn }), { act: "wgLearnItem", prof: "", what: "", item: "Actor.a.Item.i1" });
});
