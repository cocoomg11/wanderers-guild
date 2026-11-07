import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../scripts/professions-model.mjs";

test("cleanProfession fills defaults and drops junk", () => {
  assert.equal(P.cleanProfession({ name: "  " }), null);
  assert.equal(P.cleanProfession(null), null);
  const p = P.cleanProfession({ name: "  Smithing  ", tools: ["smith", "smith", "bad key!", 3], kind: "weird", icon: "nope", notes: "  hi  " });
  assert.deepEqual(p, { id: "smithing", name: "Smithing", kind: "crafting", tools: ["smith"], icon: "hammer", check: "sur", roll: "skill", actions: ["craft", "recipes"], notes: "hi" });
  assert.equal(P.cleanProfession({ name: "Mining", roll: "tool" }).roll, "tool");
  assert.equal(P.cleanProfession({ name: "Mining", roll: "nonsense" }).roll, "skill");
  assert.deepEqual(P.cleanProfession({ name: "Herbs", kind: "gathering" }).actions, ["gather"]);
  assert.equal(P.cleanProfession({ name: "Herbs", kind: "gathering" }).icon, "pick");
  assert.deepEqual(P.cleanProfession({ name: "Odd", kind: "secondary" }).actions, []);
  assert.deepEqual(P.cleanProfession({ name: "Odd", kind: "secondary", actions: ["gather", "fly", "craft"] }).actions, ["craft", "gather"], "kept in the known order");
  assert.equal(P.cleanProfession({ name: "x", tools: Array.from({ length: 20 }, (_, i) => `t${i}`) }).tools.length, P.TOOLS_MAX);
  assert.equal(P.cleanProfession({ name: "x".repeat(200) }).name.length, P.NAME_MAX);
  assert.equal(P.cleanProfession({ name: "x", notes: "y".repeat(2000) }).notes.length, P.NOTES_MAX);
  assert.equal(P.cleanProfession({ name: "x", check: "<script>" }).check, "sur");
});

test("ids from names, unique ids", () => {
  assert.equal(P.idFrom("Leather-working & Co."), "leather-working-co");
  assert.equal(P.idFrom("123 Go"), "go");
  assert.equal(P.idFrom("!!!"), "profession");
  assert.equal(P.uniqueId("a", ["a", "a-2"]), "a-3");
  assert.ok(P.ID_RE.test(P.idFrom("x".repeat(90))));
});

test("normalizeProfessions: order kept, ids unique, capped, junk tolerated", () => {
  assert.deepEqual(P.normalizeProfessions(undefined), { v: 1, list: [] });
  assert.deepEqual(P.normalizeProfessions("x"), { v: 1, list: [] });
  const s = P.normalizeProfessions({ v: 1, list: [{ name: "B" }, null, { name: "A", id: "b" }, { name: "" }] });
  assert.deepEqual(s.list.map(p => [p.id, p.name]), [["b", "B"], ["b-2", "A"]]);
  const big = P.normalizeProfessions({ v: 1, list: Array.from({ length: 150 }, (_, i) => ({ name: `P${i}` })) });
  assert.equal(big.list.length, P.PROFESSIONS_MAX);
});

test("upsert, remove, move", () => {
  let r = P.upsert(undefined, { name: "Smithing", tools: ["smith"] });
  assert.equal(r.id, "smithing");
  r = P.upsert(r.list, { name: "Smithing" });
  assert.equal(r.id, "smithing-2", "a new one with the same name gets its own id");
  r = P.upsert(r.list, { id: "smithing", name: "Forging", tools: ["smith", "mason"] });
  assert.deepEqual(r.list.list.map(p => p.name), ["Forging", "Smithing"]);
  assert.equal(P.upsert(r.list, { name: "" }).error, "A profession needs a name.");
  const moved = P.move(r.list, "smithing-2", -1);
  assert.deepEqual(moved.list.map(p => p.id), ["smithing-2", "smithing"]);
  assert.deepEqual(P.move(moved, "smithing-2", -1).list.map(p => p.id), ["smithing-2", "smithing"], "no move past the top");
  assert.deepEqual(P.remove(moved, "smithing").list.map(p => p.id), ["smithing-2"]);
  const full = { v: 1, list: Array.from({ length: P.PROFESSIONS_MAX }, (_, i) => ({ name: `P${i}` })) };
  assert.match(P.upsert(full, { name: "One more" }).error, /at most/);
});

test("starter set: only known tools, never twice, nothing already linked", () => {
  const r = P.addStarter(undefined, ["smith", "herb", "cook", "lute"]);
  assert.deepEqual(r.added, ["Cooking", "Herbalism", "Smithing"]);
  assert.deepEqual(r.list.list.map(p => [p.name, p.kind, p.tools[0]]), [["Cooking", "secondary", "cook"], ["Herbalism", "gathering", "herb"], ["Smithing", "crafting", "smith"]]);
  assert.deepEqual(P.addStarter(r.list, ["smith", "herb", "cook"]).added, []);
  const mine = P.upsert(undefined, { name: "Forge work", tools: ["smith"] }).list;
  assert.deepEqual(P.addStarter(mine, ["smith", "mason"]).added, ["Masonry"]);
  for (const s of P.STARTER) { assert.ok(P.ICON_KEYS.includes(s.icon), s.icon); assert.ok(P.KIND_KEYS.includes(/** @type {any} */ (s.kind))); }
});

test("warnings: unknown tool keys, shared tools", () => {
  const s = P.normalizeProfessions({ v: 1, list: [{ name: "A", tools: ["smith", "gone"] }, { name: "B", tools: ["smith"] }] });
  const w = P.professionWarnings(s, ["smith"]);
  assert.deepEqual(w, ["A links tool keys this world doesn't have: gone.", "Tool smith counts for A and B."]);
});

test("every icon is one path of plain drawing commands", () => {
  for (const [k, i] of Object.entries(P.ICONS)) { assert.match(i.d, /^[MLHVCSQTAZmlhvcsqtaz0-9 .,-]+$/, k); assert.ok(i.label); }
});
