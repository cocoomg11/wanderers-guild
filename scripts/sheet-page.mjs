/**
 * The Professions page on the Wanderer's Toolkit character sheet (feature "toolkitPage", needs "professions"). When the toolkit's
 * `api.sheet` exists (toolkit 2.3.0+ with its character sheet on) we register one guest page: at our ready when the toolkit's API is
 * already there, else on its `wayfarers-toolkit.sheetReady` hook (fired on every client right after its API is set). A second
 * registration with the same id just replaces the first. Each client registers its own page. Nothing is stored, nothing written:
 * the page draws the same view as the Professions window (professions-view.mjs, `guest: true`) and its buttons run the window's
 * actions (`Professions.runAction`). The toolkit redraws its sheet on actor and item changes; our own data changes (definitions,
 * ranks, switches) call the page's `refresh()`. Untested in Node: the definition and the health line are in sheet-page-model.mjs.
 */
import { TOOLKIT_ID } from "./const.mjs";
import { changed, log, warn } from "./core.mjs";
import * as Professions from "./professions.mjs";
import { professionsHTML } from "./professions-view.mjs";
import { pageDef, pageClick } from "./sheet-page-model.mjs";

/** The toolkit's sheet hook. */
export const SHEET_READY = `${TOOLKIT_ID}.sheetReady`;

/** What the last registerPage returned (for the health line). @type {{ ok?: boolean, reason?: string } | null} */
let result = null;
/** The toolkit sheets showing our page, by actor id: their refresh(). @type {Map<string, { element: HTMLElement, refresh: () => unknown }>} */
const SHOWN = new Map();

/** @param {any} ctx */
function render(ctx) {
  const actor = ctx?.actor;
  if (!Professions.canView(actor)) return `<div class="wg-prof wg-page"><p class="wg-pad">You can't see this character's professions.</p></div>`;
  return professionsHTML(Professions.viewOf(actor), { guest: true });
}

/** @param {any} ctx */
function activate(ctx) {
  const { actor, element, refresh } = ctx ?? {};
  if (!element?.addEventListener || !actor) return;
  if (typeof refresh === "function" && actor.id) SHOWN.set(actor.id, { element, refresh });
  element.addEventListener("click", (/** @type {MouseEvent} */ ev) => {
    const hit = pageClick(ev.target); if (!hit) return;
    ev.preventDefault(); ev.stopPropagation();
    Professions.runAction(actor, hit.act, hit);
  });
}

/** Registers our page with the toolkit's sheet API. @param {any} sheet `api.sheet` */
function register(sheet) {
  if (typeof sheet?.registerPage !== "function") return;
  try {
    const off = sheet.registerPage(pageDef({ render, activate, visible: actor => Professions.canView(actor) }));
    result = { ok: off?.ok !== false, reason: off?.reason };
    if (result.ok) log("toolkit sheet page registered"); else warn(`the toolkit refused the sheet page: ${off?.reason}`);
  } catch (e) { result = { ok: false, reason: String(/** @type {any} */ (e)?.message ?? e) }; warn("toolkit sheet page", e); }
}

/** Redraws the toolkit sheets showing our page (our data changed). Drops the ones that are gone. */
function refreshPages() {
  for (const [id, s] of SHOWN) {
    if (!s.element?.isConnected) { SHOWN.delete(id); continue; }
    try { s.refresh(); } catch { SHOWN.delete(id); }
  }
}

/** At our ready (feature on): register now if the toolkit's API is there, and again on its sheetReady hook. */
export function ready() {
  Hooks.once(SHEET_READY, (/** @type {any} */ sheet) => register(sheet ?? game.modules.get(TOOLKIT_ID)?.api?.sheet));
  const tk = game.modules.get(TOOLKIT_ID);
  if (tk?.active) register(tk.api?.sheet);
  changed.add(refreshPages);
}

/** Health facts. */
export function status() {
  const tk = game.modules.get(TOOLKIT_ID);
  return { toolkit: /** @type {"missing" | "inactive" | "active"} */ (!tk ? "missing" : tk.active ? "active" : "inactive"), toolkitVersion: tk?.version, sheet: !!tk?.api?.sheet, result };
}
