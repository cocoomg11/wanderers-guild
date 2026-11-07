import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../scripts/recipes-model.mjs";

const sword = { name: "Plain Blade", profession: "smithing", result: { uuid: "Compendium.x.items.Item.abc", name: "Plain Blade", type: "weapon", rarity: "", price: { value: 10, denomination: "gp" }, qty: 1 }, materials: [{ uuid: "Item.bar", name: "Metal bar", qty: 3 }] };

test("cleanRecipe: defaults, overrides, junk", () => {
  assert.equal(R.cleanRecipe(null), null);
  assert.equal(R.cleanRecipe({ name: " " }), null);
  const r = R.cleanRecipe(sword);
  assert.equal(r.id, "plain-blade");
  assert.deepEqual([r.dc, r.hours, r.cost, r.auto, r.rarity], [null, null, null, false, ""]);
  assert.equal(R.cleanRecipe({ result: { name: "From item" } }).name, "From item", "the item's name when none is given");
  const odd = R.cleanRecipe({ name: "x", dc: "99", hours: "abc", cost: -5, rarity: "mythic", profession: "Bad Id!", materials: [{}, { name: "Herb", qty: 0 }, { uuid: "not a uuid" }], result: { uuid: "javascript:alert(1)", img: "a\"b.png", price: { value: "x" } } });
  assert.equal(odd.dc, R.DC_MAX); assert.equal(odd.hours, null); assert.equal(odd.cost, 0); assert.equal(odd.rarity, ""); assert.equal(odd.profession, "");
  assert.deepEqual(odd.materials, [{ uuid: "", name: "Herb", img: "", qty: 1 }]);
  assert.equal(odd.result.uuid, ""); assert.equal(odd.result.img, ""); assert.equal(odd.result.price, null);
  assert.equal(R.cleanRecipe({ name: "x", materials: Array.from({ length: 30 }, (_, i) => ({ name: `m${i}` })) }).materials.length, R.MATERIALS_MAX);
});

test("normalizeRecipes: order, unique ids, cap, versions", () => {
  assert.deepEqual(R.normalizeRecipes(undefined), { v: 1, list: [] });
  const s = R.normalizeRecipes({ v: 1, list: [sword, sword, null, { name: "" }] });
  assert.deepEqual(s.list.map(r => r.id), ["plain-blade", "plain-blade-2"]);
  assert.equal(R.normalizeRecipes({ v: 1, list: Array.from({ length: 400 }, (_, i) => ({ name: `R${i}` })) }).list.length, R.RECIPES_MAX);
  assert.deepEqual(R.normalizeRecipes({ v: 5, list: [sword] }).list, [], "a newer shape isn't guessed at");
});

test("rarity: override, item, none", () => {
  const r = R.cleanRecipe({ ...sword, result: { ...sword.result, rarity: "rare" } });
  assert.equal(R.recipeRarity(r), "rare");
  assert.equal(R.recipeRarity({ ...r, rarity: "uncommon" }), "uncommon");
  assert.equal(R.recipeRarity({ ...r, rarity: "none" }), "");
});

test("upsert, remove, recipesFor, merge", () => {
  let r = R.upsertRecipe(undefined, sword);
  assert.equal(r.id, "plain-blade");
  r = R.upsertRecipe(r.list, { id: "plain-blade", name: "Better Blade", profession: "smithing" });
  assert.deepEqual(r.list.list.map(x => x.name), ["Better Blade"]);
  assert.match(R.upsertRecipe(r.list, {}).error, /needs a name/);
  r = R.upsertRecipe(r.list, { name: "Tonic", profession: "alchemy" });
  assert.deepEqual(R.recipesFor(r.list, "alchemy").map(x => x.id), ["tonic"]);
  assert.deepEqual(R.removeRecipe(r.list, "tonic").list.map(x => x.id), ["plain-blade"]);
  const m = R.mergeRecipes(r.list, [{ id: "tonic", name: "Tonic II" }, { name: "Salve" }, null]);
  assert.deepEqual([m.added, m.replaced, m.skipped], [1, 1, 1]);
  assert.deepEqual(m.list.list.map(x => x.name), ["Better Blade", "Tonic II", "Salve"]);
  const full = { v: 1, list: Array.from({ length: R.RECIPES_MAX }, (_, i) => ({ name: `R${i}` })) };
  assert.match(R.upsertRecipe(full, { name: "one more" }).error, /at most/);
});

test("export and import round trip, refusals", () => {
  const book = R.upsertRecipe(undefined, sword).list;
  const text = R.exportRecipes(book);
  const back = R.readRecipesImport(text);
  assert.equal(back.ok, true); assert.deepEqual(back.list, book.list);
  assert.equal(R.readRecipesImport(JSON.stringify([sword, {}])).dropped, 1, "a bare list works; unreadable ones are counted");
  assert.equal(R.readRecipesImport("{nope").ok, false);
  assert.match(R.readRecipesImport(JSON.stringify({ format: "other.thing", list: [] })).error, /not recipes/);
  assert.match(R.readRecipesImport(JSON.stringify({ v: 9, list: [] })).error, /newer/);
  assert.equal(R.readRecipesImport(JSON.stringify({ x: 1 })).ok, false);
});

test("warnings", () => {
  const book = R.normalizeRecipes({ v: 1, list: [{ name: "A" }, { name: "B", profession: "gone", result: { uuid: "Item.x" } }] });
  const w = R.recipeWarnings(book, ["smithing"]);
  assert.equal(w.length, 3);
  assert.match(w[0], /No profession picked for: A/); assert.match(w[1], /no longer exists for: B/); assert.match(w[2], /No result item for: A/);
});

test("known recipes: normalize, learn, forget, cap, auto", () => {
  assert.deepEqual(R.normalizeKnown(undefined), { v: 1, ids: [] });
  assert.deepEqual(R.normalizeKnown({ v: 1, ids: ["a", "a", "Bad!", 3] }).ids, ["a"]);
  let k = R.learn(undefined, "a"); assert.equal(k.changed, true);
  k = R.learn(k.known, "a"); assert.equal(k.changed, false);
  assert.equal(R.learn(k.known, "Bad!").error, "Not a recipe id.");
  assert.deepEqual(R.forget(k.known, "a"), { known: { v: 1, ids: [] }, changed: true });
  const full = { v: 1, ids: Array.from({ length: R.KNOWN_MAX }, (_, i) => `r${i}`) };
  assert.match(R.learn(full, "one-more").error, /at most/);
  assert.equal(R.normalizeKnown({ v: 1, ids: [...full.ids, "x", "y"] }).ids.length, R.KNOWN_MAX);
  const r = R.cleanRecipe({ name: "x", auto: true });
  assert.equal(R.knows(r, R.normalizeKnown(undefined)), true);
  assert.equal(R.knows({ ...r, auto: false }, { v: 1, ids: ["x"] }), true);
});
