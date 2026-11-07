import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPageHost, readPageDef, renderGuest } from "../vendor/wanderers-core/index.mjs";
import * as SP from "../scripts/sheet-page-model.mjs";
import * as C from "../scripts/character-model.mjs";
import * as PV from "../scripts/professions-view.mjs";
import { addStarter } from "../scripts/professions-model.mjs";

const defs = addStarter(undefined, ["smith", "herb", "cook"]).list;
const view = C.professionsView({ name: "Ma<ren>", level: 5, pb: 3, tools: { smith: 1, herb: 1 } }, defs, undefined, { crafting: true, gathering: true, isGM: true });

test("our page definition passes core's guest checks and sorts after Bastion", async () => {
  const def = SP.pageDef({ render: () => "<p>x</p>", activate: () => {}, visible: () => true });
  const r = readPageDef(def);
  assert.equal(r.ok, true, r.reason);
  assert.equal(def.id, "wanderers-guild.professions");
  assert.equal(def.order, 85);
  const host = createPageHost({ hostId: "host", builtIn: [{ id: "bastion", order: 80 }, { id: "special", order: 90 }] });
  const off = host.register(def);
  assert.notEqual(off.ok, false);
  assert.deepEqual(host.pages({}).map(p => p.id), ["bastion", "wanderers-guild.professions", "special"]);
  assert.deepEqual(await renderGuest(host.get(def.id), { actor: {} }), { html: "<p>x</p>" });
});

test("guest HTML: our buttons use data-wg-act, never the sheet's data-action / data-name / data-drop", () => {
  const html = PV.professionsHTML(view, { guest: true });
  assert.ok(html.startsWith(`<div class="wg-prof wg-page">`));
  assert.ok(!/data-action=|data-name=|data-drop/.test(html), "guest contract");
  assert.ok(html.includes(`data-wg-act="wgCraft"`) && html.includes(`data-wg-act="wgGather"`) && html.includes(`data-wg-act="wgWindow"`));
  assert.ok(html.includes("Ma") && !html.includes("Ma<ren>") && !html.includes("wg-head"), "no window header (the sheet draws the title)");
  const empty = PV.professionsHTML(C.professionsView({ name: "A", pb: 2, tools: {} }, undefined, undefined, { isGM: true }), { guest: true });
  assert.ok(empty.includes(`data-wg-act="wgSetup"`) && !empty.includes("data-action"));
  const win = PV.professionsHTML(view);
  assert.ok(win.includes(`data-action="wgGather"`) && !win.includes("data-wg-act"));
});

test("page clicks: only data-wg-act buttons, disabled ones ignored", () => {
  const btn = (ds, disabled = false) => ({ disabled, dataset: ds });
  const target = b => ({ closest: sel => (sel === "[data-wg-act]" ? b : null) });
  assert.deepEqual(SP.pageClick(target(btn({ wgAct: "wgGather", prof: "herbalism" }))), { act: "wgGather", prof: "herbalism", what: "" });
  assert.equal(SP.pageClick(target(null)), null);
  assert.equal(SP.pageClick(target(btn({ wgAct: "wgCraft" }, true))), null);
  assert.equal(SP.pageClick(null), null);
});

test("health line for the sheet page", () => {
  assert.equal(SP.pageStatus({ feature: false, toolkit: "active", sheet: true }).level, "off");
  assert.match(SP.pageStatus({ feature: true, toolkit: "missing", sheet: false }).text, /isn't active/);
  assert.match(SP.pageStatus({ feature: true, toolkit: "active", toolkitVersion: "2.2.0", sheet: false }).text, /2\.3\.0/);
  assert.equal(SP.pageStatus({ feature: true, toolkit: "active", sheet: true, result: null }).level, "warn");
  assert.match(SP.pageStatus({ feature: true, toolkit: "active", sheet: true, result: { ok: false, reason: "bad id" } }).text, /bad id/);
  assert.equal(SP.pageStatus({ feature: true, toolkit: "active", sheet: true, result: { ok: true } }).level, "ok");
});

test("the page registers at ready and on the toolkit's sheetReady hook, and never touches toolkit data", () => {
  const s = readFileSync(new URL("../scripts/sheet-page.mjs", import.meta.url), "utf8");
  assert.ok(s.includes("Hooks.once(SHEET_READY") && s.includes("`${TOOLKIT_ID}.sheetReady`"));
  assert.ok(!/flags\.wayfarers-toolkit|setFlag|\.update\(/.test(s));
  const main = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  assert.ok(/if \(F\.on\("toolkitPage"\)\) SheetPage\.ready\(\)/.test(main));
});
