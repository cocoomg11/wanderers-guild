import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../scripts/character-model.mjs";
import { addStarter, upsert } from "../scripts/professions-model.mjs";

const defs = (() => {
  let s = addStarter(undefined, ["smith", "herb", "cook", "mason", "leatherworker"]).list;
  s = upsert(s, { name: "Fishing", kind: "secondary", actions: ["gather"], tools: [] }).list;
  s = upsert(s, { name: "Alchemy", kind: "crafting", tools: ["alchemist", "herb"] }).list;
  return s;
})();
const labels = {
  tools: { smith: "Smith's tools", herb: "Herbalism kit", cook: "Cook's utensils", mason: "Mason's tools", leatherworker: "Leatherworker's tools", alchemist: "Alchemist's supplies" },
  skills: { sur: { label: "Survival", ability: "wis" } }, abilities: { wis: "Wisdom" }, rarities: { uncommon: "Uncommon", rare: "Rare" }
};
const maren = { name: "Maren", type: "character", level: 5, pb: 3, tools: { smith: 1, herb: 0.5, cook: 2, mason: 0 } };

test("learned professions follow tool proficiency (1 or more), any one tool counts", () => {
  const all = C.characterProfessions(maren, defs, undefined, labels);
  const by = Object.fromEntries(all.map(p => [p.name, p]));
  assert.equal(by.Smithing.learned, true);
  assert.equal(by.Cooking.learned, true, "expertise counts");
  assert.equal(by.Herbalism.learned, false, "half proficiency doesn't");
  assert.equal(by.Masonry.learned, false);
  assert.equal(by.Fishing.learned, true, "no tool needed: everyone");
  assert.equal(by.Alchemy.learned, false);
  assert.equal(C.characterProfessions({ ...maren, tools: { herb: 1 } }, defs, undefined, labels).find(p => p.name === "Alchemy").learned, true);
});

test("rank = proficiency bonus, with ladder, crafts-up-to and next rank", () => {
  const s = C.characterProfessions(maren, defs, undefined, labels).find(p => p.name === "Smithing");
  assert.equal(s.rank, "Apprentice +3");
  assert.equal(s.craftsUpTo, "Uncommon");
  assert.deepEqual(s.ladder.map(l => l.state), ["past", "on", "", "", ""]);
  assert.equal(s.next, "Adept +4 at level 9 · crafts up to Rare");
  assert.deepEqual(s.tool, { key: "smith", label: "Smith's tools", mult: 1, word: "proficient", mark: "f" });
  assert.deepEqual(s.actions.map(a => a.id), ["craft", "recipes"]);
  const h = C.characterProfessions(maren, defs, undefined, labels).find(p => p.name === "Herbalism");
  assert.equal(h.rank, "Not learned"); assert.deepEqual(h.actions, []); assert.equal(h.next, "");
  assert.equal(h.tool.word, "half proficiency"); assert.equal(h.check, "Wisdom (Survival)");
});

test("no bonus, below the first rank, custom table", () => {
  const none = C.characterProfessions({ ...maren, pb: null }, defs, undefined, labels).find(p => p.name === "Smithing");
  assert.equal(none.rank, "No rank"); assert.equal(none.next, "");
  const table = { v: 1, rows: [{ bonus: 4, name: "Skilled", rarity: "rare" }] };
  const low = C.characterProfessions(maren, defs, table, labels).find(p => p.name === "Smithing");
  assert.equal(low.rank, "Below the first rank (+3)"); assert.equal(low.ranked, false);
  assert.equal(low.next, "Skilled +4 at level 9 · crafts up to Rare");
});

test("the view splits cards, others and not learned", () => {
  const v = C.professionsView(maren, defs, undefined, { labels, showUnlearned: true });
  assert.deepEqual(v.cards.map(p => p.name), ["Smithing"]);
  assert.deepEqual(v.others.map(p => p.name), ["Cooking", "Fishing"]);
  assert.deepEqual(v.unlearned.map(p => p.name), ["Herbalism", "Leatherworking", "Masonry", "Alchemy"]);
  assert.equal(v.subtitle, "Level 5 · Proficiency bonus +3");
  const hidden = C.professionsView(maren, defs, undefined, { labels });
  assert.deepEqual(hidden.unlearned, []); assert.equal(hidden.hiddenUnlearned, 4);
  assert.equal(C.professionsView({ name: "N", pb: 2, tools: {} }, undefined, undefined).defined, 0);
});

test("words and marks", () => {
  assert.deepEqual([0, 0.5, 1, 2].map(C.profMark), ["", "h", "f", "e"]);
  assert.equal(C.checkText("ath", {}), "ath");
});
