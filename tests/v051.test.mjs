// 0.5.1: fixes before release (serial learns, recipe item sources, batch clamp on approval, better-result rarity warning).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "../scripts/learn-model.mjs";
import * as R from "../scripts/recipes-model.mjs";
import { S } from "../scripts/core.mjs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const W = "Item.abcdefghij123456";
const P = "Compendium.world.recipes.Item.abcdefghij654321";
const copy = (o = {}) => ({ _stats: {}, flags: { "wanderers-guild": { teaches: L.teachesFlag("blade", true, W) } }, ...o });
const src = (teaches, trusted = true) => ({ teaches, trusted });

test("learn, forget, learn from item and craft share the per-actor queue", () => {
  const s = read("scripts/craft-leader.mjs");
  for (const fn of ["onLearn", "onForget", "onLearnFromItem"]) {
    const body = s.slice(s.indexOf(`async function ${fn}(`)); const next = body.indexOf("\nasync function ", 10);
    assert.match(body.slice(0, next < 0 ? undefined : next), /return serial\(data\.actor, async \(\) =>/, `${fn} runs in serial(data.actor)`);
  }
  assert.match(s, /serial\(data\.actor, \(\) => craftNow/);
  assert.match(s, /assessIn\(context\(actor\), recipe, st\.helpers, CM\.clampBatch\(st\.batch, Data\.rules\(\)\)\)/, "decideNow clamps the stored batch");
  assert.ok(!/Number\(st\.batch\) \|\| 1\)/.test(s.slice(s.indexOf("async function decideNow"))), "no raw batch in decideNow");
});

test("teaches flag keeps a source UUID (world or compendium item only)", () => {
  assert.equal(L.teachesFlag("blade", true, W).src, W);
  assert.equal(L.teachesFlag("blade", true, P).src, P);
  for (const bad of ["Actor.abcdefghij123456.Item.abcdefghij654321", "Item.short", "javascript:x", "Compendium.a.b.Actor.abcdefghij123456"]) {
    assert.equal(L.teachesFlag("blade", true, bad).src, "", bad);
    assert.equal(L.normalizeTeaches({ v: 1, recipe: "blade", src: bad })?.src, "", bad);
  }
  assert.deepEqual(L.parseSource(W), { kind: "world", id: "abcdefghij123456" });
  assert.deepEqual(L.parseSource(P), { kind: "pack", pack: "world.recipes", id: "abcdefghij654321" });
  assert.equal(L.parseSource("Actor.abcdefghij123456"), null);
  const d = L.recipeItemData(R.cleanRecipe({ id: "blade", name: "Blade", profession: "smithing", result: { uuid: "Item.x", name: "B" } }), "", s => s, "abcdefghij123456");
  assert.equal(d._id, "abcdefghij123456");
  assert.equal(d.flags["wanderers-guild"].teaches.src, W, "Make recipe item stamps its own UUID");
  assert.equal(L.recipeItemData(R.cleanRecipe({ id: "blade", name: "Blade" }), "", s => s, "bad")._id, undefined);
});

test("sourceRefs: our stamp first, then Foundry's source fields, deduplicated", () => {
  assert.deepEqual(L.sourceRefs(copy()), [W]);
  assert.deepEqual(L.sourceRefs(copy({ _stats: { compendiumSource: P, duplicateSource: W }, flags: { core: { sourceId: P }, "wanderers-guild": { teaches: { recipe: "blade" } } } })), [P, W]);
  assert.deepEqual(L.sourceRefs({ _stats: { duplicateSource: "Actor.abcdefghij123456.Item.abcdefghij654321" } }), [], "an actor's item is never a source");
  assert.deepEqual(L.sourceRefs(null), []);
});

test("verifyTeaches: a trusted source teaching the same recipe vouches; its keep choice wins", () => {
  const t = L.normalizeTeaches({ v: 1, recipe: "blade", consume: false, src: W });
  const ok = L.verifyTeaches(t, [W], new Map([[W, src(L.teachesFlag("blade", true, W))]]));
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.teaches.consume, true, "the copy can't switch itself to keep");
  assert.equal(L.verifyTeaches(t, [], new Map()).code, "noSource");
  assert.equal(L.verifyTeaches(t, [W], new Map()).code, "noSource", "source deleted");
  assert.equal(L.verifyTeaches(t, [W], new Map([[W, src(L.teachesFlag("other"))]])).code, "mismatch", "copy relabelled to another recipe");
  assert.equal(L.verifyTeaches(t, [W], new Map([[W, src(undefined)]])).code, "mismatch", "source unmarked");
  assert.equal(L.verifyTeaches(t, [W], new Map([[W, src(L.teachesFlag("blade"), false)]])).code, "untrusted", "a player-owned world item can't vouch");
  assert.equal(L.verifyTeaches(null, [W], new Map()).code, "noFlag");
  const two = L.verifyTeaches(t, [P, W], new Map([[P, src(L.teachesFlag("other"))], [W, src(L.teachesFlag("blade"))]]));
  assert.equal(two.ok && two.source, W, "the next ref is tried");
});

test("unstampedItems: world recipe items whose src isn't themselves", () => {
  const items = [
    { uuid: W, name: "Old", teaches: { v: 1, recipe: "blade" }, where: "world" },
    { uuid: "Item.zzzzzzzzzz123456", name: "New", teaches: L.teachesFlag("blade", true, "Item.zzzzzzzzzz123456"), where: "world" },
    { name: "Carried", teaches: { v: 1, recipe: "blade" }, where: "Ma" }
  ];
  assert.deepEqual(L.unstampedItems(items), [{ uuid: W, name: "Old" }]);
});

test("leader checks recipe item sources for players unless trusted; setting and docs", () => {
  const s = read("scripts/craft-leader.mjs");
  assert.match(s, /!user\.isGM && !S\.get\("trustRecipeItems"\)/);
  assert.match(s, /LM\.verifyTeaches\(teaches, refs, await teachingSources\(refs\)\)/);
  assert.ok(!/fromUuid\(/.test(s.slice(s.indexOf("async function teachingSources"), s.indexOf("async function onLearnFromItem"))), "no fromUuid when reading sources");
  const row = S.ROWS.find(r => r.key === "trustRecipeItems");
  assert.equal(row?.default, false); assert.match(row?.hint ?? "", /honor system/);
  assert.match(read("README.md"), /Trust recipe items without a source/);
  const gm = read("scripts/learn-gm.mjs");
  assert.match(gm, /teachesFlag\(recipeId, before\?\.consume \?\? true, item\.uuid\)/);
  assert.match(gm, /\{ keepId: true \}/);
});

test("better result rarer than the recipe: a warning (allowed)", () => {
  const r = R.cleanRecipe({ id: "blade", name: "Blade", profession: "smithing", rarity: "common", result: { uuid: "Item.b", name: "B" }, better: { uuid: "Item.f", name: "F", rarity: "rare" } });
  const same = R.cleanRecipe({ id: "b2", name: "Same", profession: "smithing", rarity: "rare", result: { uuid: "Item.b", name: "B" }, better: { uuid: "Item.f", name: "F", rarity: "rare" } });
  const w = R.recipeWarnings({ v: 3, list: [r, same] }, ["smithing"]);
  assert.ok(w.some(x => /rarer than the recipe for: Blade \(allowed/.test(x)));
  assert.ok(!w.some(x => /rarer than the recipe for: .*Same/.test(x)));
  assert.match(read("docs/crafting.md"), /rarer than the recipe/);
});

test("version 0.5.1", () => {
  const m = JSON.parse(read("module.json")); const pkg = JSON.parse(read("package.json"));
  assert.equal(m.version, "0.5.1"); assert.equal(pkg.version, "0.5.1");
  assert.ok(m.download.endsWith("/v0.5.1/module.zip"));
  assert.match(read("CHANGELOG.md"), /^## 0\.5\.1/m);
});
