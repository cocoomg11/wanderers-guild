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
  assert.deepEqual(G.normalizeReset({ v: 1, at: -3 }), { v: 1, at: 0 });
  assert.equal(G.harvestedOf({ at: 5, actor: "A" }).actor, "A");
  assert.equal(G.harvestedOf(null), null);
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
  const wolf = { name: "Wolf", type: "beast", cr: 0.25, dead: true, harvested: false, npc: true };
  const c = G.assessGather({ ...base, kind: "creature", creature: wolf, distance: 1 });
  assert.equal(c.ok, true, c.problems.join()); assert.equal(c.dc, 7); assert.equal(c.tierName, "CR 1/4"); assert.equal(c.rare.name, "Bloom");
  const cp = f => G.assessGather({ ...base, kind: "creature", creature: { ...wolf, ...f }, distance: 1 }).problems.join(" ");
  assert.match(cp({ dead: false }), /isn't defeated/);
  assert.match(cp({ harvested: true }), /already harvested/);
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
