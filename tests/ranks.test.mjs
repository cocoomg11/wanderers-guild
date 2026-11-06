import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../scripts/ranks-model.mjs";

test("the default table: +2 to +6, neutral names, one rarity step each", () => {
  const t = R.normalizeRanks(undefined);
  assert.deepEqual(t.rows.map(r => r.bonus), [2, 3, 4, 5, 6]);
  assert.deepEqual(t.rows.map(r => r.rarity), ["common", "uncommon", "rare", "veryRare", "legendary"]);
  assert.deepEqual(t.rows.map(r => r.name), ["Novice", "Apprentice", "Adept", "Expert", "Master"]);
  assert.deepEqual(R.rankWarnings(t), []);
  t.rows[0].name = "changed";
  assert.equal(R.defaultRanks().rows[0].name, "Novice", "defaults are copies");
});

test("normalizeRanks sorts, drops repeats and bad rows, caps, never empty", () => {
  const t = R.normalizeRanks({ v: 1, rows: [{ bonus: 4, name: " B ", rarity: "rare" }, { bonus: 2, name: "A", rarity: "nope" }, { bonus: 4, name: "dup" }, { bonus: 0 }, { bonus: 99 }, null, "x", { bonus: "3", name: "" }] });
  assert.deepEqual(t.rows, [{ bonus: 2, name: "A", rarity: "" }, { bonus: 3, name: "Rank +3", rarity: "" }, { bonus: 4, name: "B", rarity: "rare" }]);
  assert.deepEqual(R.normalizeRanks({ v: 1, rows: [] }), R.defaultRanks());
  assert.deepEqual(R.normalizeRanks("junk"), R.defaultRanks());
  assert.deepEqual(R.normalizeRanks({ v: 9, rows: [{ bonus: 2, name: "x" }] }), R.defaultRanks(), "a newer shape isn't guessed at");
  const many = R.normalizeRanks({ v: 1, rows: Array.from({ length: 20 }, (_, i) => ({ bonus: i + 1, name: `r${i}` })) });
  assert.equal(many.rows.length, R.RANKS_MAX);
  assert.equal(R.cleanRow({ bonus: 3, name: "x".repeat(99) }).name.length, R.RANK_NAME_MAX);
});

test("SRD proficiency bonus by level", () => {
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(R.bonusAtLevel), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  assert.equal(R.bonusAtLevel(0), null); assert.equal(R.bonusAtLevel(21), null); assert.equal(R.bonusAtLevel(2.5), null);
  assert.deepEqual([2, 3, 4, 5, 6].map(R.levelForBonus), [1, 5, 9, 13, 17]);
  assert.equal(R.levelForBonus(7), null);
});

test("rankFor and the ladder", () => {
  const t = R.defaultRanks();
  assert.equal(R.rankFor(3, t).row.name, "Apprentice");
  assert.equal(R.rankFor(3, t).next.name, "Adept");
  assert.equal(R.rankFor(1, t).row, null); assert.equal(R.rankFor(1, t).next.bonus, 2);
  assert.equal(R.rankFor(8, t).row.name, "Master"); assert.equal(R.rankFor(8, t).next, null);
  assert.equal(R.rankFor(null, t).index, -1);
  assert.deepEqual(R.ladder(4, t).map(s => s.state), ["past", "past", "on", "", ""]);
  assert.equal(R.ladder(4, t, { rare: "Rare!" })[2].rarityLabel, "Rare!");
  const gappy = R.normalizeRanks({ v: 1, rows: [{ bonus: 2, name: "Low" }, { bonus: 5, name: "High" }] });
  assert.equal(R.rankFor(4, gappy).row.name, "Low");
});

test("next rank text names the level only when the bonus is the standard one", () => {
  const t = R.defaultRanks();
  assert.equal(R.nextRankText({ pb: 3, level: 5 }, t), "Adept +4 at level 9 · crafts up to Rare");
  assert.equal(R.nextRankText({ pb: 3, level: 1 }, t), "Adept +4 at proficiency bonus +4 · crafts up to Rare");
  assert.equal(R.nextRankText({ pb: 3 }, t), "Adept +4 at proficiency bonus +4 · crafts up to Rare");
  assert.equal(R.nextRankText({ pb: 6, level: 17 }, t), "Highest rank");
  assert.equal(R.nextRankText({ pb: 2, level: 1 }, t, { uncommon: "Unc." }), "Apprentice +3 at level 5 · crafts up to Unc.");
  assert.equal(R.signed(-1), "−1"); assert.equal(R.signed(0), "+0");
});

test("rank warnings", () => {
  const t = R.normalizeRanks({ v: 1, rows: [{ bonus: 3, name: "A", rarity: "rare" }, { bonus: 4, name: "B", rarity: "common" }] });
  const w = R.rankWarnings(t);
  assert.equal(w.length, 2);
  assert.match(w[0], /level 1 characters have no rank/);
  assert.match(w[1], /B \(\+4\) crafts a lower rarity/);
});
