/**
 * The Professions page on the Wanderer's Toolkit character sheet, pure (tested in Node: tests/sheet-page.test.mjs). The toolkit
 * (2.3.0+) takes pages from other modules through `api.sheet.registerPage(def)` (wanderers-core's guest pages, core docs/pages.md);
 * this file builds our definition and the health line. sheet-page.mjs does the registering and wiring.
 *
 * Guest contract (the toolkit's docs/scripting.md, "Sheet pages for other modules"): `render(ctx)` gets `{ actor, mode, editable,
 * root }` and returns HTML (inserted as is: we escape our own data); `activate(ctx)` also gets `element` (our page's container) and
 * `refresh()`. No `data-action`, `data-name` or `[data-drop]` inside the page: our buttons use `data-wg-act`.
 */
import { ID } from "./const.mjs";
import { ICONS } from "./professions-model.mjs";

export const PAGE_ID = `${ID}.professions`;
/** After the toolkit's Bastion (80), before Special traits (90). */
export const PAGE_ORDER = 85;
export const PAGE_LABEL = "Professions";
export const PAGE_HINT = "from your tool proficiencies";

/**
 * Our page definition for `registerPage`.
 * @param {{ render: (ctx: any) => string | Promise<string>, activate?: (ctx: any) => void, visible?: (actor: any) => boolean }} fns
 */
export function pageDef({ render, activate, visible }) {
  return {
    id: PAGE_ID, label: PAGE_LABEL, hint: PAGE_HINT, icon: ICONS.hammer.d, order: PAGE_ORDER,
    render, ...(activate ? { activate } : {}), ...(visible ? { visible } : {})
  };
}

/**
 * Where the registration stands, as one health line.
 * @param {{ feature: boolean, toolkit: "missing" | "inactive" | "active", toolkitVersion?: string, sheet: boolean, result?: { ok?: boolean, reason?: string } | null }} f
 *   `feature`: our toolkitPage feature (and professions) on; `sheet`: the toolkit's `api.sheet` exists (its character sheet is on);
 *   `result`: what `registerPage` returned (null when we haven't registered)
 * @returns {{ level: "ok" | "warn" | "info" | "off", text: string }}
 */
export function pageStatus(f) {
  if (!f.feature) return { level: "off", text: "Toolkit sheet page: off (Feature: Toolkit sheet page)." };
  if (f.toolkit !== "active") return { level: "info", text: "Toolkit sheet page: Wanderer's Toolkit isn't active, so there's no sheet to add the page to (the Professions window works without it)." };
  if (!f.sheet) return { level: "info", text: `Toolkit sheet page: Wanderer's Toolkit ${f.toolkitVersion ?? ""} has no sheet pages (it needs 2.3.0 or later with its character sheet replacement on).`.replace("  ", " ") };
  if (!f.result) return { level: "warn", text: "Toolkit sheet page: not registered yet (it registers when the toolkit's sheet is ready; reload if this stays)." };
  if (f.result.ok === false) return { level: "warn", text: `Toolkit sheet page: the toolkit refused it (${f.result.reason ?? "no reason given"}).` };
  return { level: "ok", text: "Toolkit sheet page: Professions is a bookmark on the toolkit's character sheet." };
}

/**
 * The button a click on our page hit, as `{ act, prof, what, item? }` (`item`: a recipe item's UUID), or null. Only `data-wg-act` buttons count (never the sheet's
 * `data-action`). Duck-typed so Node can test it with plain objects.
 * @param {any} target the click's target element
 */
export function pageClick(target) {
  const b = target?.closest?.("[data-wg-act]");
  if (!b || b.disabled) return null;
  const d = b.dataset ?? {};
  return { act: String(d.wgAct ?? ""), prof: String(d.prof ?? ""), what: String(d.what ?? ""), ...(d.item ? { item: String(d.item) } : {}) };
}
