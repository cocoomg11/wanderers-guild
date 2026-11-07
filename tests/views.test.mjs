import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../scripts/character-model.mjs";
import * as PV from "../scripts/professions-view.mjs";
import * as SV from "../scripts/setup-view.mjs";
import { addStarter, upsert, normalizeProfessions } from "../scripts/professions-model.mjs";
import { defaultRanks, RARITIES } from "../scripts/ranks-model.mjs";

const defs = upsert(addStarter(undefined, ["smith", "herb", "cook"]).list, { name: "<b>Evil</b>", kind: "crafting", tools: ["smith"], notes: "a & b" }).list;
const v = C.professionsView({ name: "Ma<ren>", level: 5, pb: 3, tools: { smith: 1, cook: 1 } }, defs, undefined, { showUnlearned: true, crafting: true });

test("Professions window: cards, rows, placeholders, escaping", () => {
  const html = PV.professionsHTML(v);
  assert.ok(html.startsWith(`<div class="wg-prof">`));
  assert.ok(html.includes("Ma&lt;ren&gt;") && !html.includes("Ma<ren>"));
  assert.ok(html.includes("&lt;b&gt;Evil&lt;/b&gt;") && html.includes("a &amp; b"));
  assert.equal((html.match(/data-action="wgCraft"/g) ?? []).length, 2 * 2 + 0, "Smithing and Evil: Craft + Recipes; Cooking (secondary) has none");
  assert.ok(html.includes(`data-what="recipes"`));
  const off = PV.professionsHTML(C.professionsView({ name: "M", pb: 3, tools: { smith: 1, herb: 1 } }, defs, undefined, {}));
  assert.ok(!off.includes("wgCraft"), "Crafting off: no Craft or Recipes buttons");
  assert.ok(!off.includes("wgGather") && !off.includes("wgComing"), "Gathering off: no Gather button");
  const gather = PV.professionsHTML(C.professionsView({ name: "M", pb: 3, tools: { herb: 1 } }, defs, undefined, { gathering: true }));
  assert.equal((gather.match(/data-action="wgGather"/g) ?? []).length, 1, "Herbalism: Gather");
  assert.equal(PV.actionOf("gather"), "wgGather");
  assert.ok(html.includes(`aria-current="step"`));
  assert.ok(html.includes("Not learned"));
  assert.ok(html.includes("Crafting and gathering results are posted to chat"));
  assert.ok(!/wc-r\d/.test(html), "no literal core revision");
});

test("Professions window: empty world and no professions learned", () => {
  const empty = C.professionsView({ name: "A", pb: 2, tools: {} }, undefined, undefined, { isGM: true });
  assert.ok(PV.professionsHTML(empty).includes(`data-action="wgSetup"`));
  assert.ok(!PV.professionsHTML({ ...empty, isGM: false }).includes("wgSetup"));
  const none = C.professionsView({ name: "A", pb: 2, tools: {} }, defs, undefined);
  assert.match(PV.professionsHTML(none), /This world has 4 to choose from/);
});

test("setup shell and pages", () => {
  const html = SV.shellHTML("ranks", "<p>x</p>", { version: "0.1.0" });
  assert.equal((html.match(/class="wc-nav[ "]/g) ?? []).length, SV.NAV.length);
  assert.ok(html.includes(`aria-current="page"`));
  assert.equal(SV.pickPage("nope"), "professions");
  const tools = [{ key: "smith", label: "Smith's tools" }, { key: "herb", label: "Herbalism kit" }];
  const skills = [{ key: "sur", label: "Survival" }];
  const list = normalizeProfessions(defs).list;
  const page = SV.professionsPage({ list, tools, skills, editing: list[0].id, warnings: ["careful <x>"] });
  assert.ok(page.includes(`data-form="profession"`) && page.includes("careful &lt;x&gt;"));
  assert.ok(page.includes(`name="tools" value="cook" checked`), "a linked tool the world lacks is still shown, ticked");
  assert.ok(SV.professionsPage({ list: [], tools, skills }).includes("Add starter set"));
  const ranks = SV.ranksPage({ rows: defaultRanks().rows, rarities: RARITIES });
  assert.equal((ranks.match(/name="bonus\.\d+"/g) ?? []).length, 5);
  assert.ok(SV.settingsPage({ rows: [{ key: "showUnlearned", label: "L", hint: "H", value: true }] }).includes(`data-setting="showUnlearned" checked`));
  assert.ok(SV.healthPage({ report: [{ title: "T", lines: [{ level: "ok", text: "fine" }] }] }).includes("fine"));
  assert.ok(SV.dataPage({ rows: [{ key: "professions", label: "P", count: 0, ticked: true, text: "none" }] }).includes("disabled"));
});

test("form readers", () => {
  const p = SV.readProfessionForm([["id", ""], ["name", "X"], ["kind", "gathering"], ["tools", "herb"], ["tools", "smith"], ["actions", "gather"], ["icon", "leaf"], ["check", "sur"], ["notes", "n"], ["junk", "y"]]);
  assert.deepEqual(p, { tools: ["herb", "smith"], actions: ["gather"], name: "X", kind: "gathering", icon: "leaf", check: "sur", notes: "n" });
  const rows = SV.readRanksForm([["bonus.1", "3"], ["name.1", "B"], ["rarity.1", "rare"], ["bonus.0", "2"], ["name.0", "A"], ["rarity.0", ""], ["other", "x"]]);
  assert.deepEqual(rows, [{ bonus: 2, name: "A", rarity: "" }, { bonus: 3, name: "B", rarity: "rare" }]);
  assert.deepEqual([SV.nextNavIndex("ArrowDown", 4, 5), SV.nextNavIndex("ArrowUp", 0, 5), SV.nextNavIndex("End", 1, 5), SV.nextNavIndex("x", 1, 5)], [0, 4, 4, -1]);
});
