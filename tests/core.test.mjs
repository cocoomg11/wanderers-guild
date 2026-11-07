import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { F, S, REQUESTS, RECORDS } from "../scripts/core.mjs";
import { ID, HOOKS } from "../scripts/const.mjs";
import { normalizeProfessions } from "../scripts/professions-model.mjs";
import { normalizeRanks } from "../scripts/ranks-model.mjs";
import { normalizeRecipes } from "../scripts/recipes-model.mjs";
import { normalizeRules } from "../scripts/craft-model.mjs";
import { normalizeGatherRules } from "../scripts/gather-model.mjs";
import { readRequest } from "../vendor/wanderers-core/index.mjs";

const RID = "abcdefgh12345678-1-mw5o4v5z";
const req = (kind, data) => readRequest(REQUESTS, { action: "request", kind, rid: RID, data });

test("request schemas: what each kind accepts and refuses", () => {
  const actor = "Actor.abcdefghij123456";
  assert.equal(req("learnRecipe", { actor, recipe: "blade" }).ok, true);
  assert.equal(req("learnRecipe", { actor, recipe: "blade", user: "x" }).ok, false, "no payload user field");
  assert.equal(req("learnRecipe", { actor, recipe: "Bad Id" }).ok, false);
  assert.equal(req("learnRecipe", { actor: "not a uuid", recipe: "blade" }).ok, false);
  assert.equal(REQUESTS.forgetRecipe.from, "gm"); assert.equal(REQUESTS.craftDecide.from, "gm");
  assert.equal(REQUESTS.learnRecipe.from, undefined); assert.equal(REQUESTS.craft.from, undefined);
  assert.equal(req("craft", { actor, recipe: "blade", roll: "abcdefghij123456", helpers: 0 }).ok, true);
  assert.equal(req("craft", { actor, recipe: "blade", roll: "abcdefghij123456", helpers: 1.5 }).ok, false);
  assert.equal(req("craft", { actor, recipe: "blade", roll: "abcdefghij123456", helpers: 99 }).ok, false);
  assert.equal(req("craft", { actor, recipe: "blade", roll: "x", helpers: 0 }).ok, false, "the roll is a message id");
  assert.equal(req("craft", { actor, recipe: "blade", roll: "abcdefghij123456", helpers: 0, total: 30 }).ok, false, "no total from the client");
  assert.equal(req("craftDecide", { message: "abcdefghij123456", choice: "approve" }).ok, true);
  assert.equal(req("craftDecide", { message: "abcdefghij123456", choice: "explode" }).ok, false);
  const g = { actor, profession: "herbalism", roll: "abcdefghij123456" };
  assert.equal(req("gather", { ...g, node: "Scene.abcdefghij123456.Note.abcdefghij654321" }).ok, true);
  assert.equal(req("gather", { ...g, scene: "abcdefghij123456" }).ok, true);
  assert.equal(req("gather", { ...g, token: "Scene.abcdefghij123456.Token.abcdefghij654321" }).ok, true);
  assert.equal(req("gather", { ...g, scene: "abcdefghij123456", total: 20 }).ok, false, "no total from the client");
  assert.equal(req("gather", { ...g, scene: "abcdefghij123456", user: "x" }).ok, false, "no payload user field");
  assert.equal(req("gather", { ...g, roll: "nope", scene: "abcdefghij123456" }).ok, false);
  assert.equal(req("gather", { ...g, profession: "Bad Id", scene: "abcdefghij123456" }).ok, false);
  assert.equal(REQUESTS.gather.from, undefined); assert.equal(REQUESTS.gatherReset.from, "gm");
  assert.equal(req("gatherReset", {}).ok, true);
});

// core.mjs binds core to this module. These definitions throw on a typo (duplicate key, bad type, a need that isn't a feature), so
// importing them here catches the mistake in CI instead of in a live world.
test("features, settings and requests are well formed", () => {
  assert.deepEqual(F.FEATURES.map(f => f.id), ["professions", "sheetButton", "crafting", "gathering", "toolkitPage"]);
  assert.deepEqual(F.FEATURES.find(f => f.id === "gathering").needs, ["professions"]);
  assert.deepEqual(F.FEATURES.find(f => f.id === "toolkitPage").needs, ["professions"]);
  assert.deepEqual(F.FEATURES.find(f => f.id === "crafting").needs, ["professions"]);
  assert.ok(F.FEATURES.every(f => f.key === `feature-${f.id}`));
  assert.deepEqual(F.FEATURES.find(f => f.id === "sheetButton").needs, ["professions"]);
  assert.deepEqual(S.ROWS.map(r => r.key), ["professionList", "rankTable", "showUnlearned", "recipeBook", "craftRules", "playersLearn", "craftApproval", "worldCoins", "gatherRules", "gatherReset", "gatherOnce", "gatherArea", "gatherJourney", "debugLog"]);
  assert.deepEqual(Object.keys(REQUESTS), ["learnRecipe", "forgetRecipe", "craft", "craftDecide", "gather", "gatherReset"]);
  assert.equal(HOOKS.crafted, `${ID}.crafted`);
  assert.equal(HOOKS.ready, `${ID}.ready`);
  assert.equal(HOOKS.gathered, `${ID}.gathered`);
  assert.deepEqual([...RECORDS], ["professionList", "rankTable", "recipeBook", "craftRules", "gatherRules", "gatherReset", "windowPlacement"]);
});

test("record defaults are what the normalizers give for nothing stored", () => {
  const row = k => S.ROWS.find(r => r.key === k);
  assert.deepEqual(row("professionList").default, normalizeProfessions(undefined));
  assert.deepEqual(row("rankTable").default, normalizeRanks(undefined));
  assert.deepEqual(row("recipeBook").default, normalizeRecipes(undefined));
  assert.deepEqual(row("craftRules").default, normalizeRules(undefined));
  assert.deepEqual([row("playersLearn").default, row("craftApproval").default, row("worldCoins").default], [true, false, false]);
  assert.deepEqual(row("gatherRules").default, normalizeGatherRules(undefined));
  assert.ok(row("gatherRules").default.tiers.every(t => t.dc === null), "no rulebook figures ship");
  assert.deepEqual([row("gatherOnce").default, row("gatherArea").default, row("gatherJourney").default], [true, true, true]);
  assert.ok(S.ROWS.filter(r => !r.hidden).every(r => r.tab === "settings" && r.label && r.hint));
});

test("module.json agrees with const.mjs and the house rules", () => {
  const m = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.equal(m.id, ID);
  assert.equal(m.title, "Wanderer's Guild");
  assert.equal(m.socket, true);
  assert.deepEqual(m.compatibility, { minimum: "13", verified: "14.370" });
  assert.ok(!("maximum" in m.compatibility));
  assert.equal(m.manifest, `https://github.com/cocoomg11/${ID}/releases/latest/download/module.json`);
  assert.equal(m.download, `https://github.com/cocoomg11/${ID}/releases/download/v${m.version}/module.zip`);
  assert.deepEqual(m.relationships.systems.map(s => [s.id, s.compatibility.verified]), [["dnd5e", "6.0.6"]]);
  assert.deepEqual(m.relationships.recommends.map(r => r.id).sort(), ["item-piles", "wayfarers-toolkit"]);
  assert.ok(!m.relationships.requires, "optional modules are never required");
  assert.equal(m.styles[0], "vendor/wanderers-core/styles/wanderers-ui.css");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, m.version);
});

test("the vendored core is the pinned release and CI uses the same tag", () => {
  const lock = JSON.parse(readFileSync(new URL("../wanderers-core.lock.json", import.meta.url), "utf8"));
  assert.equal(lock.source, "release");
  const ci = readFileSync(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  assert.match(ci, new RegExp(`module-checks\\.yml@v${lock.version.replace(/\./g, "\\.")}\\b`));
  const rel = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  for (const dir of ["module.json", "scripts", "styles", "lang", "vendor"]) assert.ok(rel.includes(` ${dir}`), dir);
  assert.ok(rel.includes("'vendor/wanderers-core/testing/*'"));
});
