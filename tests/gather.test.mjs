import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../scripts/gather-model.mjs";
import { cleanProfession } from "../scripts/professions-model.mjs";

const herb = cleanProfession({ id: "herbalism", name: "Herbalism", kind: "gathering", tools: ["herb"], check: "sur" });
const mining = cleanProfession({ id: "mining", name: "Mining", kind: "gathering", tools: ["mason"], roll: "tool" });
const leaf = { uuid: "Item.leafleafleafleaf", name: "Leaf", img: "leaf.webp" };
const bloom = { uuid: "Item.bloombloombloombl", name: "Bloom", img: "" };
// Test numbers are made up; nothing here is a rulebook figure.
const rules = G.normalizeGatherRules({ v: 1, tiers: [{ id: "t1", name: "Lowlands", dc: 11 }, { id: "t2", name: "Hills", dc: null }], rareMargin: 4, qty: 2, reach: 2,
  crBands: [{ cr: 4, dc: 9 }, { cr: 1, dc: 7 }], creatures: [{ type: "beast", profession: "herbalism", item: leaf, rare: bloom }], areas: [{ profession: "herbalism", tier: "", item: leaf }] });
const node = G.normalizeNode({ profession: "herbalism", name: "Patch", item: leaf, rare: bloom, tier: "", dc: null, qty: null, uses: 2 });
const facts = { pb: 3, tools: { herb: 1 } };
const base = { profession: herb, facts, rules, isGM: false, once: true, areaOn: true, epoch: 0 };

test("rules: neutral defaults, every DC empty, caps and clean rows", () => {
  const d = G.normalizeGatherRules(undefined);
  assert.equal(d.tiers.length, 5);
  assert.ok(d.tiers.every(t => t.dc === null), "no DC ships");
  assert.deepEqual([d.rareMargin, d.qty, d.reach, d.crBands.length, d.creatures.length, d.areas.length], [null, 1, 2, 0, 0, 0]);
  assert.deepEqual(G.normalizeGatherRules({ v: 1, tiers: [] }).tiers, [], "the GM may remove every tier");
  assert.deepEqual(rules.crBands.map(b => b.cr), [1, 4], "bands sorted by CR");
  const many = G.normalizeGatherRules({ v: 1, tiers: Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, name: `T${i}` })), creatures: [{ type: "beast", profession: "herbalism" }, { type: "beast", profession: "herbalism" }, { type: "Bad Type", profession: "x" }] });
  assert.equal(many.tiers.length, G.TIERS_MAX);
  assert.equal(many.creatures.length, 1, "duplicates and junk dropped");
  assert.equal(G.cleanRef({ uuid: "not a uuid" }), null);
  assert.equal(G.SRD_DCS.length, 6);
});

test("nodes, marks and the reset record", () => {
  assert.equal(G.normalizeNode({ name: "x" }), null, "a node needs a profession");
  assert.equal(node.uses, 2); assert.equal(node.hidden, false); assert.equal(node.name, "Patch");
  assert.deepEqual(G.spendUse(node).uses, 1);
  assert.equal(G.spendUse({ ...node, uses: null }).uses, null);
  assert.equal(G.spendUse({ ...node, uses: 0 }).uses, 0);
  let m = G.withMark(undefined, G.markKey("sceneAAAAAAAAAAAA", "noteBBBBBBBBBBBB"), 100);
  m = G.withMark(m, G.markKey("sceneAAAAAAAAAAAA"), 200);
  assert.equal(G.markAt(m, "n:sceneAAAAAAAAAAAA.noteBBBBBBBBBBBB"), 100);
  assert.equal(G.markAt(m, "s:sceneAAAAAAAAAAAA"), 200);
  for (let i = 0; i < 150; i++) m = G.withMark(m, G.markKey(`s${i}`), 300 + i);
  assert.equal(m.marks.length, G.MARKS_MAX);
  assert.deepEqual(G.normalizeReset({ v: 1, at: -3 }), { v: 2, at: 0, days: null });
});

test("reset record v2: v1 reads with no days, journey days from hours", () => {
  assert.deepEqual(G.normalizeReset({ v: 1, at: 500 }), { v: 2, at: 500, days: null }, "v1 → v2");
  assert.deepEqual(G.normalizeReset(undefined), { v: 2, at: 0, days: null });
  assert.deepEqual(G.normalizeReset({ v: 2, at: 9, days: 3 }), { v: 2, at: 9, days: 3 });
  assert.equal(G.normalizeReset({ v: 2, at: 9, days: 99 }).days, G.DAYS_MAX, "clamped");
  assert.equal(G.normalizeReset({ v: 2, at: 9, days: 0 }).days, null);
  assert.equal(G.normalizeReset({ v: 2, at: 9, days: "x" }).days, null);
  assert.deepEqual(G.resetRecord(100, 4), { v: 2, at: 100, days: 4 });
  assert.deepEqual(G.resetRecord(100), { v: 2, at: 100, days: null }, "a GM reset has no days");
  assert.deepEqual([1, 24, 25, 48, 49, 0.5].map(G.daysFromHours), [1, 1, 2, 2, 3, 1]);
  assert.deepEqual([0, -5, null, undefined, "x", NaN].map(G.daysFromHours), [null, null, null, null, null, null]);
  assert.equal(G.daysFromHours(24 * 100), G.DAYS_MAX);
  assert.deepEqual([0, 1, 2.4, 30, 31, "7", "x", null].map(G.clampDays), [1, 1, 2, 30, 30, 7, 1, 1]);
});

test("harvested marks v2: one per profession, v1 reads as one entry, capped", () => {
  assert.deepEqual(G.normalizeHarvested({ v: 1, actor: "Actor.a", profession: "skinning", at: 5 }), { v: 2, list: [{ actor: "Actor.a", profession: "skinning", at: 5 }] }, "v1 → one-entry list");
  assert.deepEqual(G.normalizeHarvested({ actor: "Actor.a", profession: "skinning", at: 5 }).list.length, 1, "no version: as v1");
  assert.deepEqual(G.normalizeHarvested(null), { v: 2, list: [] });
  assert.deepEqual(G.normalizeHarvested({ v: 1, at: 0, profession: "skinning" }).list, [], "no time: no mark");
  let h = G.withHarvest(undefined, { actor: "Actor.a", profession: "skinning", at: 1 });
  h = G.withHarvest(h, { actor: "Actor.b", profession: "herbalism", at: 2 });
  assert.deepEqual(G.harvestedFor(h), ["skinning", "herbalism"]);
  h = G.withHarvest(h, { actor: "Actor.c", profession: "skinning", at: 3 });
  assert.deepEqual(h.list.map(m => [m.profession, m.actor]), [["herbalism", "Actor.b"], ["skinning", "Actor.c"]], "one per profession, newest last");
  assert.deepEqual(G.harvestedFor({ v: 2, list: [{ profession: "skinning", at: 1 }, { profession: "skinning", at: 2 }, { profession: "Bad Id", at: 3 }] }), ["skinning"]);
  // A v1 mark upgrades in place when a second profession harvests.
  assert.deepEqual(G.harvestedFor(G.withHarvest({ v: 1, actor: "Actor.a", profession: "skinning", at: 5 }, { actor: "Actor.b", profession: "herbalism", at: 6 })), ["skinning", "herbalism"]);
  for (let i = 0; i < 15; i++) h = G.withHarvest(h, { actor: "Actor.a", profession: `p${i}`, at: 10 + i });
  assert.equal(h.list.length, G.HARVEST_MAX);
  assert.equal(h.list.at(-1).profession, "p14");
});

test("DCs: node, tier, scene tier, CR bands", () => {
  assert.equal(G.crDC(rules, 0.25), 7);
  assert.equal(G.crDC(rules, 3), 9);
  assert.equal(G.crDC(rules, 20), 9, "above every band: the last");
  assert.equal(G.crDC(G.normalizeGatherRules(undefined), 3), null);
  const a = G.assessGather({ ...base, kind: "node", node, sceneTier: "t1", distance: 1, lastAt: 0 });
  assert.equal(a.ok, true, a.problems.join());
  assert.equal(a.dc, 11); assert.equal(a.dcText, "DC 11 (Lowlands)");
  assert.deepEqual(a.roll, { kind: "skill", key: "sur" });
  assert.equal(a.qty, 2, "the page's per-success count");
  const own = G.assessGather({ ...base, kind: "node", node: { ...node, dc: 14, tier: "t2", qty: 1 }, sceneTier: "t1", distance: 1 });
  assert.equal(own.dc, 14); assert.equal(own.tierName, "Hills"); assert.equal(own.qty, 1);
  const none = G.assessGather({ ...base, kind: "node", node, sceneTier: "t2", distance: 0 });
  assert.equal(none.dc, null); assert.equal(none.dcText, "no DC set");
});

test("assess: what stops a gather", () => {
  const p = f => G.assessGather({ ...base, kind: "node", node, sceneTier: "t1", distance: 1, ...f }).problems.join(" ");
  assert.match(p({ distance: 5 }), /Too far/);
  assert.match(p({ distance: null }), /needs a token/);
  assert.equal(p({ distance: null, isGM: true }), "", "GMs skip distance");
  assert.match(p({ lastAt: 50 }), /Already gathered/);
  assert.equal(p({ lastAt: 50, epoch: 60 }), "", "a reset after the mark clears it");
  assert.equal(p({ lastAt: 50, once: false }), "");
  assert.equal(p({ lastAt: 50, node: { ...node, resetAt: 70 } }), "", "the node's own reset");
  assert.match(p({ node: { ...node, uses: 0 } }), /used up/);
  assert.match(p({ node: { ...node, hidden: true } }), /isn't there/);
  assert.equal(p({ node: { ...node, hidden: true }, isGM: true }), "");
  assert.match(p({ node: { ...node, profession: "mining" } }), /another profession/);
  assert.match(p({ node: { ...node, minBonus: 4 } }), /\+4/);
  assert.match(p({ facts: { pb: 3, tools: {} } }), /Needs the Herbalism profession/);
  assert.match(G.assessGather({ ...base, profession: mining, facts: { pb: 2, tools: { mason: 0.5 } }, kind: "area", sceneTier: "t1", distance: 0 }).problems.join(), /Needs the Mining/);
  assert.deepEqual(G.assessGather({ ...base, profession: mining, facts: { pb: 2, tools: { mason: 2 } }, kind: "node", node: { ...node, profession: "mining" }, distance: 0 }).roll, { kind: "tool", key: "mason" });
});

test("area and creatures", () => {
  const area = G.assessGather({ ...base, kind: "area", sceneTier: "t1", sceneName: "Vale", distance: 0, lastAt: 0 });
  assert.equal(area.ok, true); assert.equal(area.dc, 11); assert.equal(area.item.name, "Leaf"); assert.equal(area.where, "Vale");
  assert.match(G.assessGather({ ...base, kind: "area", areaOn: false, sceneTier: "t1", distance: 0 }).problems.join(), /off/);
  assert.match(G.assessGather({ ...base, kind: "area", sceneTier: "t1", distance: null }).problems.join(), /area needs your character's token on this scene/);
  assert.equal(G.assessGather({ ...base, isGM: true, kind: "area", sceneTier: "t1", distance: null }).ok, true, "GMs gather without a token");
  const wolf = { name: "Wolf", type: "beast", cr: 0.25, dead: true, harvested: [], npc: true };
  const c = G.assessGather({ ...base, kind: "creature", creature: wolf, distance: 1 });
  assert.equal(c.ok, true, c.problems.join()); assert.equal(c.dc, 7); assert.equal(c.tierName, "CR 1/4"); assert.equal(c.rare.name, "Bloom");
  const cp = f => G.assessGather({ ...base, kind: "creature", creature: { ...wolf, ...f }, distance: 1 }).problems.join(" ");
  assert.match(cp({ dead: false }), /isn't defeated/);
  assert.match(cp({ harvested: ["herbalism"] }), /already harvested for Herbalism/);
  assert.equal(G.assessGather({ ...base, kind: "creature", creature: { ...wolf, harvested: ["skinning"] }, distance: 1 }).ok, true, "another profession's harvest doesn't block this one");
  assert.match(cp({ type: "fiend" }), /nothing to harvest/);
  assert.match(cp({ npc: false }), /NPC/);
  assert.match(G.assessGather({ ...base, kind: "creature", distance: 1 }).problems.join(), /Target/);
});

test("outcome and what a success gives", () => {
  assert.deepEqual(G.gatherOutcome(10, 11, 4, true), { success: false, rare: false });
  assert.deepEqual(G.gatherOutcome(12, 11, 4, true), { success: true, rare: false });
  assert.deepEqual(G.gatherOutcome(15, 11, 4, true), { success: true, rare: true });
  assert.deepEqual(G.gatherOutcome(15, 11, null, true), { success: true, rare: false }, "no margin: never rare");
  assert.deepEqual(G.gatherOutcome(1, null, 4, true), { success: true, rare: false }, "no DC: success, never rare");
  assert.deepEqual(G.gains({ item: leaf, rare: bloom, qty: 2 }, { success: true, rare: true }).map(g => [g.ref.name, g.qty, g.rare]), [["Bloom", 1, true], ["Leaf", 1, false]]);
  assert.deepEqual(G.gains({ item: leaf, rare: bloom, qty: 1 }, { success: true, rare: true }).map(g => g.ref.name), ["Bloom"]);
  assert.deepEqual(G.gains({ item: leaf, rare: null, qty: 3 }, { success: true, rare: false }).map(g => g.qty), [3]);
  assert.deepEqual(G.gains({ item: leaf, rare: bloom, qty: 3 }, { success: false, rare: false }), []);
  assert.deepEqual(G.gains({ item: null, rare: null, qty: 3 }, { success: true, rare: false }), []);
});

test("quantity per day of the stage: perDay (default) and flat", () => {
  assert.equal(G.normalizeGatherRules(undefined).qtyMode, "perDay");
  assert.equal(G.normalizeGatherRules({ v: 1, qtyMode: "flat" }).qtyMode, "flat");
  assert.equal(G.normalizeGatherRules({ v: 1, qtyMode: "weekly" }).qtyMode, "perDay");
  // rules.qty 2: a node with no qty of its own gives 2 per day.
  const n3 = G.assessGather({ ...base, kind: "node", node, sceneTier: "t1", distance: 1, days: 3 });
  assert.deepEqual([n3.perDay, n3.days, n3.qty, n3.perDayMode], [2, 3, 6, true]);
  assert.equal(G.assessGather({ ...base, kind: "node", node, sceneTier: "t1", distance: 1 }).qty, 2, "default 1 day");
  assert.equal(G.assessGather({ ...base, kind: "node", node, sceneTier: "t1", distance: 1, days: 99 }).days, G.DAYS_MAX, "clamped");
  const area = G.assessGather({ ...base, kind: "area", sceneTier: "t1", distance: 0, days: 4 });
  assert.equal(area.qty, 8);
  const flat = { ...rules, qtyMode: /** @type {const} */ ("flat") };
  const f = G.assessGather({ ...base, rules: flat, kind: "node", node, sceneTier: "t1", distance: 1, days: 3 });
  assert.deepEqual([f.qty, f.days, f.perDayMode], [2, 1, false], "flat: just qty");
  const wolf = { name: "Wolf", type: "beast", cr: 0.25, dead: true, harvested: [], npc: true };
  const c = G.assessGather({ ...base, kind: "creature", creature: wolf, distance: 1, days: 5 });
  assert.deepEqual([c.qty, c.days, c.perDayMode], [2, 1, false], "a creature is harvested once: no days");
  // Rare replaces one of the stage's total.
  assert.deepEqual(G.gains(n3, { success: true, rare: true }).map(g => [g.ref.name, g.qty]), [["Bloom", 1], ["Leaf", 5]]);
  assert.deepEqual(G.gains(n3, { success: true, rare: false }).map(g => [g.ref.name, g.qty]), [["Leaf", 6]]);
  assert.deepEqual(G.gains(n3, { success: false, rare: false }), []);
});

test("import / export, status, warnings, node Note data, distance", () => {
  assert.deepEqual(G.readGatherImport(G.exportGatherRules(rules)), { ok: true, rules });
  assert.equal(G.readGatherImport("{}").ok, false);
  assert.equal(G.readGatherImport("nope").ok, false);
  assert.ok(G.gatherStatus(G.normalizeGatherRules(undefined)).unset.includes("tier DCs"));
  const w = G.gatherWarnings(rules, ["herbalism"], [{ scene: "S", node: { ...node, profession: "gone" } }, { scene: "S", node: { ...node, item: null, rare: null, tier: "t9" } }]);
  assert.equal(w.length, 3);
  const d = G.nodeNoteData(node, { x: 10.4, y: 20.6, icon: "leaf", level: "L1" });
  assert.deepEqual([d.x, d.y, d.text, d.iconSize, d.texture.src, d.levels[0]], [10, 21, "Patch", 48, "modules/wanderers-guild/styles/nodes/leaf.svg", "L1"]);
  assert.equal(d.flags["wanderers-guild"].node, node);
  assert.equal(G.nodeIconPath("../x"), "modules/wanderers-guild/styles/nodes/pick.svg");
  assert.equal(G.cellsBetween({ x: 0, y: 0 }, { x: 300, y: 400 }, 100), 5);
});
