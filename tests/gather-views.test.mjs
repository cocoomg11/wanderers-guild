import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as V from "../scripts/gather-view.mjs";
import * as G from "../scripts/gather-model.mjs";
import { ICON_KEYS } from "../scripts/professions-model.mjs";

const leaf = { uuid: "Item.leafleafleafleaf", name: "Le<af>", img: "" };

test("Gather window: options, problems, escaping, disabled buttons", () => {
  const v = { actorName: "Ma<ren>", profession: { id: "herb", name: "Herbalism", icon: "M1 1" }, professions: [{ id: "herb", name: "Herbalism" }, { id: "skin", name: "Skinning" }],
    options: [{ key: "node:Scene.a.Note.b", kind: "node", title: "Patch", dcText: "DC 11", rollText: "Wisdom (Survival)", gives: "2 × Leaf", problems: [], ok: true },
      { key: "creature:Scene.a.Token.c", kind: "creature", title: "Wolf", dcText: "no DC set", rollText: "Survival", gives: "", problems: ["Wolf isn't <defeated>."], ok: false }], noGM: false, locked: false };
  const html = V.gatherWindowHTML(/** @type {any} */ (v));
  assert.ok(html.includes("Ma&lt;ren&gt;") && html.includes("&lt;defeated&gt;"));
  assert.equal((html.match(/data-action="wgGatherNow"/g) ?? []).length, 2);
  assert.equal((html.match(/ disabled>/g) ?? []).length, 1);
  assert.ok(html.includes("data-wg-gprof") && html.includes("Harvest: Wolf"));
  assert.ok(V.gatherWindowHTML(/** @type {any} */ ({ ...v, noGM: true })).includes("No GM is connected"));
  assert.ok(V.gatherWindowHTML(/** @type {any} */ ({ ...v, options: [] })).includes("Nothing to gather here"));
  assert.match(V.givesText({ item: leaf, rare: leaf, qty: 2 }, null), /no rare margin set/);
  assert.match(V.givesText({ item: null, rare: null, qty: 1 }, 3), /GM hands out/);
});

test("Gather window: Days in this stage, per-day text", () => {
  const v = { actorName: "A", profession: { id: "herb", name: "Herbalism", icon: "M1 1" }, professions: [], options: [], noGM: false, locked: false };
  assert.ok(!V.gatherWindowHTML(/** @type {any} */ (v)).includes("data-wg-days"), "no field without a node or area option");
  const html = V.gatherWindowHTML(/** @type {any} */ ({ ...v, days: { value: 3, max: 30, hint: "from the last journey" } }));
  assert.match(html, /Days in this stage <input type="number" class="wg-num" data-wg-days value="3" min="1" max="30" step="1">/);
  assert.ok(html.includes("from the last journey"));
  assert.equal(V.perDayText(2, 1), "2 per day × 1 day");
  assert.equal(V.givesText({ item: leaf, rare: null, qty: 6, perDay: 2, days: 3, perDayMode: true }, null), "2 per day × 3 days: 6 × Le<af>");
  assert.equal(V.givesText({ item: leaf, rare: null, qty: 2, perDay: 2, days: 1, perDayMode: false }, null), "2 × Le<af>", "flat / harvest");
});

test("gather card", () => {
  const base = { state: "done", actorName: "A", professionName: "Herbalism", kind: "node", where: "Patch", rollText: "Survival", total: 15, dc: 11, tierName: "Lowlands", rare: true, items: [{ name: "Bl<oom>", img: "", qty: 1, rare: true }], noItem: false };
  const html = V.gatherCardHTML(/** @type {any} */ (base));
  assert.ok(html.includes("Gathered 1 × Bl&lt;oom&gt; (rare)") && html.includes("15 vs DC 11") && html.includes("wc-ui"));
  assert.ok(V.gatherCardHTML(/** @type {any} */ ({ ...base, kind: "creature", items: [], dc: null })).includes("Harvested: the GM hands out"));
  assert.ok(V.gatherCardHTML(/** @type {any} */ ({ ...base, state: "failed", items: [], rare: false, reason: "The check failed." })).includes("Found nothing"));
  assert.ok(V.gatherCardHTML(/** @type {any} */ ({ ...base, perDay: 2, days: 3 })).includes("<span>Amount</span><b>2 per day × 3 days</b>"));
  assert.ok(!V.gatherCardHTML(/** @type {any} */ ({ ...base, perDay: null, days: null })).includes("per day"), "flat and harvesting: no per-day line");
});

test("node editor and its reader", () => {
  const html = V.nodeFormHTML({ node: { name: "P<a>tch", profession: "herb", item: leaf, tier: "t2", dc: 12, hidden: true }, professions: [{ id: "herb", name: "Herbalism" }], tiers: [{ id: "t2", name: "Hills", dc: null }], sceneTierName: "Lowlands" });
  assert.ok(html.includes("P&lt;a&gt;tch") && html.includes(`value="t2" selected`) && html.includes("(Lowlands)") && html.includes(`name="hidden" checked`));
  assert.ok(html.includes(`list="wg-dc-list"`) && html.includes(`label="Medium"`), "SRD typical DCs offered as suggestions");
  const raw = V.readNodeForm([["name", "Patch"], ["profession", "herb"], ["item.uuid", leaf.uuid], ["item.name", "Leaf"], ["item.img", ""], ["rare.uuid", ""], ["tier", ""], ["dc", ""], ["qty", "3"], ["uses", ""], ["minBonus", ""], ["hidden", "on"], ["junk", "x"]]);
  assert.deepEqual(raw, { v: 1, hidden: true, reset: false, item: { uuid: leaf.uuid, name: "Leaf", img: "" }, rare: null, name: "Patch", profession: "herb", tier: "", dc: null, qty: 3, uses: null, minBonus: null });
  const n = G.normalizeNode(raw);
  assert.equal(n.qty, 3); assert.equal(n.dc, null);
});

test("scene tier field and the Gathering page round-trip", () => {
  const rules = G.normalizeGatherRules({ v: 1, tiers: [{ id: "t1", name: "Low", dc: 10 }], crBands: [{ cr: 2, dc: 8 }], creatures: [{ type: "beast", profession: "herb", item: leaf }], areas: [{ profession: "herb", tier: "t1" }], rareMargin: 5, qty: 2, qtyMode: "flat", reach: 3 });
  const sec = V.sceneSectionHTML({ tiers: rules.tiers, value: "t1", field: "flags.wanderers-guild.tier" });
  assert.ok(sec.includes(`name="flags.wanderers-guild.tier"`) && sec.includes(`value="t1" selected`));
  const page = V.gatherPage({ rules, professions: [{ key: "herb", label: "Herbalism" }], types: [{ key: "beast", label: "Beast" }], status: G.gatherStatus(rules), json: G.exportGatherRules(rules), nodes: [{ scene: "Vale", count: 2 }], epoch: "" });
  assert.ok(!/region/i.test(page), "tiers are by scene, not by region");
  assert.ok(page.includes(`data-form="gather"`) && page.includes("Vale (2)") && page.includes("never"));
  // What the page's inputs submit reads back to the same rules.
  const unesc = (/** @type {string} */ v) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");
  const attr = (/** @type {string} */ tag, /** @type {string} */ a) => new RegExp(`\\s${a}="([^"]*)"`).exec(tag)?.[1];
  const entries = [...page.matchAll(/<(input|select)\b[^>]*>/g)].map(m => [attr(m[0], "name"), unesc(attr(m[0], "value") ?? "")]).filter(([k]) => k);
  const sel = (/** @type {string} */ name) => { const m = new RegExp(`name="${name.replace(/\./g, "\\.")}">(.*?)</select>`).exec(page); return /value="([^"]*)" selected/.exec(m?.[1] ?? "")?.[1] ?? /value="([^"]*)"/.exec(m?.[1] ?? "")?.[1] ?? ""; };
  const fixed = entries.map(([k, v]) => (/(type|profession|tier|qtyMode)$/.test(k) && !/\.(uuid|name|img)$/.test(k) ? [k, sel(k)] : [k, v]));
  assert.deepEqual(G.normalizeGatherRules(V.readGatherForm(fixed)), rules);
});

test("a node mark ships for every profession icon", () => {
  for (const k of ICON_KEYS) assert.ok(existsSync(new URL(`../styles/nodes/${k}.svg`, import.meta.url)), k);
});
