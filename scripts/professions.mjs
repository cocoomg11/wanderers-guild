/**
 * The Professions window (feature "professions"): one character's professions, read only. Anyone who can observe the actor may open
 * it (owners, observers, the GM); the GM edits the definitions in the setup window. One window per actor; it redraws when the
 * actor's tools, level or proficiency bonus change, or when the definitions or ranks change. Also the dnd5e sheet header button
 * (feature "sheetButton"). Untested in Node: the view is in professions-view.mjs and character-model.mjs.
 */
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { RememberedWindow } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { S, changed, log } from "./core.mjs";
import * as D5 from "./dnd5e.mjs";
import { professionsView } from "./character-model.mjs";
import { professionsHTML, COMING } from "./professions-view.mjs";

/** Open windows by actor id. @type {Map<string, any>} */
const OPEN = new Map();

/** Opens the setup window (set by main.mjs, so this file needn't import setup.mjs). @type {() => unknown} */
let openSetup = () => undefined;
/** @param {() => unknown} fn */
export function setSetupOpener(fn) { openSetup = fn; }

/** Whether this user may see the actor's professions. @param {any} actor */
export const canView = actor => !!actor && (game.user?.isGM || actor.testUserPermission?.(game.user, "OBSERVER"));

/** The model for one actor (also `api.professionsOf(actor)`). @param {any} actor */
export function viewOf(actor) {
  return professionsView(D5.facts(actor), S.get("professionList"), S.get("rankTable"), { labels: D5.labels(), showUnlearned: !!S.get("showUnlearned"), isGM: !!game.user?.isGM });
}

const Base = RememberedWindow(foundry.applications.api.ApplicationV2, { moduleId: ID, key: "professions" });

export class ProfessionsApp extends Base {
  /**
   * The actor is kept out of the options (ApplicationV2 merges options into plain objects).
   * @param {any} actor @param {Record<string, any>} [options]
   */
  constructor(actor, options = {}) {
    super({ id: `${ID}-professions-${String(actor?.id ?? "none")}`, ...options });
    this.actor = actor;
    if (actor?.id) OPEN.set(actor.id, this);
  }

  static DEFAULT_OPTIONS = {
    classes: ["wg-window", "wg-prof-window", ...UI_CLASSES],
    window: { title: "Professions", icon: "fa-solid fa-hammer", resizable: true },
    position: { width: 760, height: 720 },
    actions: {
      wgComing: ProfessionsApp.#coming,
      wgSetup: () => openSetup()
    }
  };

  get title() { return `Professions: ${this.actor?.name ?? ""}`; }

  async _renderHTML() {
    const div = document.createElement("div");
    if (!canView(this.actor)) { div.className = "wg-prof"; div.innerHTML = `<p class="wg-pad">You can't see this character's professions.</p>`; return div; }
    try { div.innerHTML = professionsHTML(viewOf(this.actor)); } catch (e) {
      console.error(`${ID} | Professions window`, e);
      div.innerHTML = `<div class="wg-prof"><p class="wg-pad">This window couldn't be drawn: ${String(/** @type {any} */ (e)?.message ?? e).replace(/[<>&]/g, "")}</p></div>`;
    }
    return /** @type {HTMLElement} */ (div.firstElementChild ?? div);
  }

  /** @param {HTMLElement} result @param {HTMLElement} content */
  _replaceHTML(result, content) {
    const scroll = content.querySelector(".wg-body")?.scrollTop ?? 0;
    content.replaceChildren(result);
    const body = content.querySelector(".wg-body"); if (body && scroll) body.scrollTop = scroll;
  }

  /** @param {any} options */
  _onClose(options) { super._onClose?.(options); if (OPEN.get(this.actor?.id) === this) OPEN.delete(this.actor.id); }

  /** @param {PointerEvent} _event @param {HTMLElement} target */
  static #coming(_event, target) {
    const what = target?.dataset?.what ?? "";
    const label = what === "gather" ? "Gathering" : what === "recipes" ? "Recipes" : "Crafting";
    ui.notifications.info(`${TITLE}: ${label}. ${COMING}`);
  }
}

/**
 * Opens (or brings forward) the Professions window for an actor. Returns the window, or undefined when the actor isn't a
 * character or NPC, or the user can't observe it.
 * @param {any} actor an Actor, or its id or UUID
 */
export function open(actor) {
  const a = typeof actor === "string" ? (game.actors?.get(actor) ?? /** @type {any} */ (globalThis).fromUuidSync?.(actor)) : actor;
  if (!a || !(a instanceof Actor) || !D5.TYPES.includes(a.type)) { ui.notifications.warn(`${TITLE}: pick a character or NPC.`); return undefined; }
  if (!canView(a)) { ui.notifications.warn(`${TITLE}: you can't see ${a.name}'s professions.`); return undefined; }
  const app = OPEN.get(a.id) ?? new ProfessionsApp(a);
  app.render({ force: true });
  return app;
}

/**
 * The actor to open with no argument: a player's assigned character, else the GM's (or player's) first selected token's actor.
 * @returns {any}
 */
export function defaultActor() {
  const tok = canvas?.tokens?.controlled?.[0]?.actor;
  if (!game.user?.isGM && game.user?.character) return game.user.character;
  return tok ?? game.user?.character ?? null;
}

/** Redraws the open windows (all, or one actor's). @param {string} [actorId] */
export function refresh(actorId) {
  for (const [id, app] of OPEN) if (!actorId || id === actorId) { try { app.render(); } catch { /* closing */ } }
}

/** Paths whose change can change an actor's professions. */
const ACTOR_PATHS = ["system.tools", "system.attributes.prof", "system.details.level", "name"];

/** Hooks that redraw an open window (hot hooks: bail first when no window is open for the actor). */
export function registerHooks() {
  changed.add(() => refresh());
  Hooks.on("updateActor", (/** @type {any} */ actor, /** @type {any} */ changes) => {
    if (!OPEN.has(actor?.id)) return;
    if (!ACTOR_PATHS.some(p => foundry.utils.hasProperty(changes, p))) return;
    log("redraw for actor change", actor.name);
    refresh(actor.id);
  });
  // Class levels live on class items, and tool proficiencies can come from items and effects (advancement, active effects).
  const fromItem = (/** @type {any} */ doc) => {
    const actor = doc?.parent;
    if (!actor || !OPEN.has(actor.id)) return;
    if (doc.documentName === "Item" && !["class", "subclass", "background", "race", "feat"].includes(doc.type)) return;
    refresh(actor.id);
  };
  for (const h of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(h, fromItem);
}

/** The header button on dnd5e character sheets (feature "sheetButton"): in the controls menu and as a visible header button. */
export function registerSheetButton() {
  const ok = (/** @type {any} */ app) => {
    const actor = app?.document ?? app?.actor;
    return actor instanceof Actor && actor.type === "character" && canView(actor) ? actor : null;
  };
  Hooks.on("getHeaderControlsBaseActorSheet", (/** @type {any} */ app, /** @type {any[]} */ controls) => {
    const actor = ok(app); if (!actor || !Array.isArray(controls) || controls.some(c => c.action === "wgProfessions")) return;
    if (app.options?.actions && !app.options.actions.wgProfessions) app.options.actions.wgProfessions = function () { open(this.document ?? this.actor); };
    controls.push({ icon: "fa-solid fa-hammer", label: "Professions", action: "wgProfessions", visible: true });
  });
  Hooks.on("renderBaseActorSheet", (/** @type {any} */ app, /** @type {HTMLElement} */ element) => {
    const html = app?.element ?? element;
    const header = html?.querySelector?.(".window-header"); if (!header) return;
    const actor = ok(app);
    if (!actor) { header.querySelector(".wg-prof-btn")?.remove(); return; }
    if (header.querySelector(".wg-prof-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "header-control icon fa-solid fa-hammer wg-prof-btn";
    btn.dataset.tooltip = "Professions"; btn.setAttribute("aria-label", "Professions");
    btn.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); open(actor); });
    btn.addEventListener("pointerdown", ev => ev.stopPropagation());
    const anchor = header.querySelector("[data-action=toggleControls]") ?? header.querySelector("[data-action=close]");
    if (anchor) anchor.before(btn); else header.append(btn);
  });
}
