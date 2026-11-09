// 0.5.2: fixes from live test 8 (Fix buttons on the setup Health page, Approve time text, better-result card header,
// Teach to… lists characters only, coin cost paid through the toolkit documented, toolkit pay refusal).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as SV from "../scripts/setup-view.mjs";
import * as V from "../scripts/crafting-view.mjs";
import * as C from "../scripts/craft-model.mjs";
import * as L from "../scripts/learn-model.mjs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const report = () => [
  { title: "Recipes <x>", lines: [
    { level: "ok", text: "fine" },
    { level: "warn", text: "not <stamped>", fix: { label: "Stamp <recipe> items", confirm: "Sure?", run: () => "Stamped 2." } }
  ] },
  { title: "Other", lines: [{ level: "warn", text: "action only", fix: { label: "Satchel", action: "wg:thing" } }, { level: "info", text: "plain fn", fix: () => undefined }] }
];

test("fixAt finds only fixes with run, by a well-formed key", () => {
  const r = report();
  assert.ok(/^Stamp/.test(String(SV.fixAt(r, "0:1")?.label)));
  assert.equal(typeof SV.fixAt(r, "0:1")?.run, "function");
  assert.equal(SV.fixAt(r, "0:1")?.confirm, "Sure?");
  assert.equal(SV.fixAt(r, "0:0"), null, "no fix");
  assert.equal(SV.fixAt(r, "1:0"), null, "action id only: the Satchel resolves it");
  assert.equal(typeof SV.fixAt(r, "1:1")?.run, "function", "a bare function is a fix");
  for (const bad of ["", "0", "0:1:2", "a:b", "9:9", null, 3]) assert.equal(SV.fixAt(r, bad), null);
  assert.equal(SV.fixAt(null, "0:1"), null);
});

test("Health page: Fix buttons, escaped, busy state, notice", () => {
  const r = report();
  const h = SV.healthPage({ report: r });
  assert.equal((h.match(/data-action="healthFix"/g) ?? []).length, 2, "one per line with a runnable fix");
  assert.match(h, /data-fix="0:1"/); assert.match(h, /data-fix="1:1"/); assert.ok(!/data-fix="1:0"/.test(h));
  assert.ok(!h.includes("<recipe>") && !h.includes("<stamped>") && !h.includes("<x>"), "everything escaped");
  assert.ok(h.includes("not &lt;stamped&gt;") && h.includes("Recipes &lt;x&gt;"));
  assert.ok(!h.includes(" disabled"), "nothing disabled when idle");
  const busy = SV.healthPage({ report: r, busy: "0:1" });
  assert.ok(busy.includes("Working…"));
  assert.equal((busy.match(/data-action="healthFix"[^>]*disabled/g) ?? []).length, 2, "every Fix disabled while one runs");
  assert.match(busy, /data-action="healthRun" disabled/);
  const done = SV.healthPage({ report: r, fixed: { level: "info", text: "Stamped <2>." } });
  assert.ok(done.includes("Stamped &lt;2&gt;."));
  assert.ok(SV.healthPage({ report: null }).includes("Checking…"));
});

test("fixNotice", () => {
  assert.deepEqual(SV.fixNotice("Stamp", "Stamped 2."), { level: "info", text: "Stamped 2." });
  assert.equal(SV.fixNotice("Stamp", undefined).text, "Stamp: done.");
  assert.equal(SV.fixNotice("Stamp", false).level, "warn");
});

test("setup window wires healthFix: GM only, busy before the confirm, report again after", () => {
  const s = read("scripts/setup.mjs");
  assert.match(s, /a === "healthFix"\) return this\.#healthFix/);
  const body = s.slice(s.indexOf("async #healthFix("), s.indexOf("/** The Gathering page's rules as on screen"));
  assert.match(body, /if \(!game\.user\?\.isGM \|\| this\.busy\) return;/);
  assert.ok(body.indexOf("this.busy = key") < body.indexOf("confirm(f.label"), "busy set before the confirm");
  assert.ok(body.indexOf("await f.run()") < body.indexOf("this.report = Health.run()"), "report runs again after the fix");
  assert.match(body, /finally \{ this\.busy = null; this\.render\(\); \}/);
});

test("assessedState: the time follows the batch made at resolve time", () => {
  const st = C.assessedState({ batch: 2, betterAt: 17, hours: 4 }, { hoursPerDay: null });
  assert.deepEqual(st, { batch: 2, betterAt: 17, timeText: C.hoursText(4, null) });
  assert.notEqual(st.timeText, C.hoursText(6, null));
  assert.equal(C.assessedState({ batch: 1, betterAt: null, hours: null }, { hoursPerDay: 8 }).timeText, "");
  assert.match(read("scripts/craft-leader.mjs"), /Object\.assign\(st, CM\.assessedState\(a, Data\.rules\(\)\)\)/, "finish uses it (Approve path too)");
});

test("better-result card header shows the item made", () => {
  const c = { state: "done", actorName: "A", recipeName: "Plain <Blade>", rarity: "", img: "fine.webp", qty: 6, toolLabel: "Smith's tools", total: 20, dc: 12, timeText: "", reason: "", used: [], coin: "", approvalAsked: false, better: true, betterName: "Fine <Blade>", betterRarity: "rare", betterAt: 17 };
  const h = V.cardHTML(c);
  const head = h.slice(h.indexOf("<header"), h.indexOf("</header>"));
  assert.ok(head.includes("Fine &lt;Blade&gt;") && !head.includes("Plain"), "header names the better item");
  assert.match(head, /data-quality="rare"/);
  const normal = V.cardHTML({ ...c, better: false, betterName: "", betterRarity: "" });
  assert.ok(normal.slice(0, normal.indexOf("</header>")).includes("Plain &lt;Blade&gt;"));
  const pending = V.cardHTML({ ...c, state: "pending" });
  assert.ok(pending.slice(0, pending.indexOf("</header>")).includes("Plain &lt;Blade&gt;"), "not made yet: the recipe");
  const extra = V.cardHTML({ ...c, betterName: "" });
  assert.ok(extra.slice(0, extra.indexOf("</header>")).includes("Plain &lt;Blade&gt;"), "extra quantity only: same item");
});

test("Teach to… lists characters only (no Item Piles piles)", () => {
  assert.equal(L.teachable({ type: "character", flags: {} }), true);
  assert.equal(L.teachable({ type: "character" }), true);
  assert.equal(L.teachable({ type: "character", flags: { "item-piles": { data: { enabled: true, type: "pile" } } } }), false);
  assert.equal(L.teachable({ type: "character", flags: { "item-piles": { data: { enabled: false } } } }), true);
  assert.equal(L.teachable({ type: "npc", flags: {} }), false);
  assert.equal(L.teachable(null), false);
  assert.match(read("scripts/setup.mjs"), /filter\(\(\/\*\* @type \{any\} \*\/ a\) => LM\.teachable\(a\)\)/);
});

test("coin cost: paid in the world's coins through the toolkit (documented); a toolkit refusal throws", () => {
  const e = read("scripts/economy.mjs");
  assert.match(e, /await tk\.pay\(actor, amount, \{ reason \}\) === false\) throw/);
  assert.match(read("docs/crafting.md"), /switch on or off/);
  assert.match(read("README.md"), /Either way a recipe's coin cost is gold pieces of the world's coins/);
});

test("README: recipe item source notes from live test 8", () => {
  const r = read("README.md");
  assert.match(r, /leave Foundry's `_stats\.compendiumSource` and `_stats\.duplicateSource` empty/);
  assert.match(r, /set `_stats\.compendiumSource` on their own item/);
});
