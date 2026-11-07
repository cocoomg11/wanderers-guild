/**
 * The Crafting window (feature "crafting"): one per character and profession, two pages. **Craft**: the profession's recipes with
 * what's missing, the time (for reference), cost, DC and rank check; Craft rolls the linked tool check (dnd5e `rollToolCheck`) on
 * this client and sends the roll's chat message to the active GM's client, which makes the item (craft-leader.mjs). **Recipes**:
 * known, learnable and higher-rank recipes; Learn (players, when allowed), Teach and Forget (GM) are requests too. Nothing here
 * writes a document. Untested in Node: the pages are in crafting-view.mjs, the decision in craft-model.mjs.
 */
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { RememberedWindow } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { S, leader, changed, log } from "./core.mjs";
import { rankFor, rarityLabel, signed } from "./ranks-model.mjs";
import { recipesFor } from "./recipes-model.mjs";
import { ICONS } from "./professions-model.mjs";
import { FAIL_RULES } from "./craft-model.mjs";
import { context, assessIn, groupOf } from "./craft-read.mjs";
import { craftWindowHTML } from "./crafting-view.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Eco from "./economy.mjs";

/** Open windows by `${actorId}.${professionId}`. @type {Map<string, CraftingApp>} */
const OPEN = new Map();

/** Whether this user may use crafting for the actor (owners and the GM; observers may look). @param {any} actor */
const canUse = actor => !!game.user?.isGM || !!actor?.isOwner;
const canSee = (/** @type {any} */ actor) => !!game.user?.isGM || !!actor?.testUserPermission?.(game.user, "OBSERVER");

const Base = RememberedWindow(foundry.applications.api.ApplicationV2, { moduleId: ID, key: "crafting" });

export class CraftingApp extends Base {
  /** @param {any} actor @param {string} professionId @param {Record<string, any>} [options] */
  constructor(actor, professionId, options = {}) {
    super({ id: `${ID}-crafting-${actor.id}-${professionId}`, ...options });
    this.actor = actor;
    this.professionId = professionId;
    /** @type {"craft" | "recipes"} */
    this.mode = options.mode === "recipes" ? "recipes" : "craft";
    this.query = "";
    /** @type {"all" | "can"} */
    this.filter = "all";
    /** @type {string | null} */ this.selected = null;
    this.helpers = 0;
    this.busy = false;
    OPEN.set(this.key, this);
  }

  get key() { return `${this.actor.id}.${this.professionId}`; }

  static DEFAULT_OPTIONS = {
    classes: ["wg-window", "wg-prof-window", "wg-craft-window", ...UI_CLASSES],
    window: { title: "Crafting", icon: "fa-solid fa-hammer", resizable: true },
    position: { width: 940, height: 680 }
  };

  get title() {
    const p = context(this.actor).professions.find(x => x.id === this.professionId);
    return `${p?.name ?? "Crafting"}: ${this.actor?.name ?? ""}`;
  }

  /** The page model. @returns {import("./crafting-view.mjs").CraftView} */
  view() {
    const ctx = context(this.actor);
    const p = ctx.professions.find(x => x.id === this.professionId);
    const rk = rankFor(ctx.facts.pb, ctx.ranks);
    const rows = recipesFor(ctx.book, this.professionId).map(r => {
      const a = assessIn(ctx, r, this.helpers);
      return { ...a, group: groupOf(r), img: r.result.img, notes: r.notes, qty: r.result.qty, toolTotal: a.tool ? D5.toolTotal(this.actor, a.tool.key) : "", source: r.auto ? "everyone" : "" };
    });
    return {
      mode: this.mode, actorName: this.actor.name,
      profession: { id: this.professionId, name: p?.name ?? this.professionId, icon: ICONS[p?.icon ?? "hammer"]?.d ?? ICONS.hammer.d },
      rankText: rk.row ? `${rk.row.name} ${signed(rk.row.bonus)}` : "No rank", craftsUpTo: rk.row?.rarity ? rarityLabel(rk.row.rarity, ctx.rarityLabels) : "",
      gm: !!game.user?.isGM, playersLearn: !!S.get("playersLearn"), economyNote: Eco.note(), query: this.query, filter: this.filter,
      rows: /** @type {any} */ (rows), selected: this.selected, helpers: this.helpers, helpersMax: ctx.rules.helpersMax, helperDivides: ctx.rules.helperDivides,
      hoursPerDay: ctx.rules.hoursPerDay, failText: FAIL_RULES[ctx.rules.failMaterials], approval: !!S.get("craftApproval"), noGM: !leader.activeGM(), locked: this.busy || !canUse(this.actor),
      money: (/** @type {number} */ n) => Eco.html(n)
    };
  }

  async _renderHTML() {
    const div = document.createElement("div");
    if (!canSee(this.actor)) { div.innerHTML = `<div class="wg-prof"><p class="wg-pad">You can't see this character.</p></div>`; return /** @type {HTMLElement} */ (div.firstElementChild); }
    try { div.innerHTML = craftWindowHTML(this.view()); } catch (e) {
      console.error(`${ID} | Crafting window`, e);
      div.innerHTML = `<div class="wg-prof"><p class="wg-pad">This window couldn't be drawn: ${String(/** @type {any} */ (e)?.message ?? e).replace(/[<>&]/g, "")}</p></div>`;
    }
    return /** @type {HTMLElement} */ (div.firstElementChild ?? div);
  }

  /** @param {HTMLElement} result @param {HTMLElement} content */
  _replaceHTML(result, content) {
    const keep = [...content.querySelectorAll(".wg-body, .wg-scroll")].map(el => el.scrollTop);
    const focused = /** @type {HTMLElement | null} */ (content.querySelector("[data-wg-search]:focus"));
    content.replaceChildren(result);
    [...content.querySelectorAll(".wg-body, .wg-scroll")].forEach((el, i) => { if (keep[i]) el.scrollTop = keep[i]; });
    const search = /** @type {HTMLInputElement | null} */ (content.querySelector("[data-wg-search]"));
    search?.addEventListener("input", () => { this.query = search.value; this.render(); });
    if (focused && search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    const helpers = /** @type {HTMLInputElement | null} */ (content.querySelector("[data-wg-helpers]"));
    helpers?.addEventListener("change", () => { this.helpers = Math.max(0, Math.round(Number(helpers.value) || 0)); this.render(); });
  }

  /** @param {PointerEvent} _event @param {HTMLElement} target */
  async _onClickAction(_event, target) {
    const a = target.dataset.action; const id = target.dataset.id ?? "";
    if (a === "wgMode") { this.mode = target.dataset.mode === "recipes" ? "recipes" : "craft"; return this.render(); }
    if (a === "wgPick") { this.selected = id; return this.render(); }
    if (a === "wgFilter") { this.filter = target.dataset.filter === "can" ? "can" : "all"; return this.render(); }
    if (a === "wgLearn") return this.#ask("learnRecipe", id);
    if (a === "wgForget") return this.#ask("forgetRecipe", id);
    if (a === "wgCraftNow") return this.#craft(id);
  }

  /** @param {"learnRecipe" | "forgetRecipe"} kind @param {string} recipe */
  #ask(kind, recipe) {
    if (!leader.request(kind, { actor: this.actor.uuid, recipe })) ui.notifications.warn(`${TITLE}: no GM is connected.`);
  }

  /** Rolls the tool check here, then asks the active GM's client to make the item. @param {string} id */
  async #craft(id) {
    if (this.busy) return;
    const ctx = context(this.actor);
    const recipe = ctx.book.list.find(r => r.id === id); if (!recipe) return;
    const a = assessIn(ctx, recipe, this.helpers);
    if (!a.canCraft || !a.tool) { ui.notifications.warn(`${TITLE}: ${a.problems[0] ?? "can't craft this now."}`); return; }
    if (!leader.activeGM()) { ui.notifications.warn(`${TITLE}: a GM must be connected to craft.`); return; }
    this.busy = true; this.render();
    try {
      const config = { tool: a.tool.key, ...(a.dc === null ? {} : { target: a.dc }) };
      const message = { data: { flags: { [ID]: { craftRoll: { actor: this.actor.uuid, recipe: recipe.id } } } } };
      const rolls = await this.actor.rollToolCheck(config, {}, message);
      const msg = Array.isArray(rolls) ? rolls[0]?.parent : /** @type {any} */ (rolls)?.parent;
      if (!msg?.id) { log("craft: no roll message (cancelled?)"); return; }
      if (!leader.request("craft", { actor: this.actor.uuid, recipe: recipe.id, roll: msg.id, helpers: Math.min(ctx.rules.helpersMax, this.helpers) })) ui.notifications.warn(`${TITLE}: no GM is connected; the roll wasn't used.`);
    } catch (e) {
      console.error(`${ID} | craft`, e);
      ui.notifications.error(`${TITLE}: the tool check failed (${String(/** @type {any} */ (e)?.message ?? e)}).`);
    } finally { this.busy = false; this.render(); }
  }

  /** @param {any} options */
  _onClose(options) { super._onClose?.(options); if (OPEN.get(this.key) === this) OPEN.delete(this.key); }
}

/**
 * Opens (or brings forward) the Crafting window for an actor and profession, on a page.
 * @param {any} actor an Actor, or its id or UUID @param {string} professionId @param {"craft" | "recipes"} [mode]
 */
export function open(actor, professionId, mode = "craft") {
  const a = typeof actor === "string" ? (game.actors?.get(actor) ?? fromUuidSync(actor)) : actor;
  if (!a || !(a instanceof Actor)) { ui.notifications.warn(`${TITLE}: pick a character.`); return undefined; }
  if (!canSee(a)) { ui.notifications.warn(`${TITLE}: you can't see ${a.name}.`); return undefined; }
  if (!context(a).professions.some(p => p.id === professionId)) { ui.notifications.warn(`${TITLE}: no such profession.`); return undefined; }
  const app = OPEN.get(`${a.id}.${professionId}`) ?? new CraftingApp(a, professionId, { mode });
  app.mode = mode === "recipes" ? "recipes" : "craft";
  app.render({ force: true });
  return app;
}

/** Redraws open windows (all, or one actor's). @param {string} [actorId] */
export function refresh(actorId) {
  for (const app of OPEN.values()) if (!actorId || app.actor?.id === actorId) { try { app.render(); } catch { /* closing */ } }
}

/** Actor paths whose change can change what the window shows. */
const ACTOR_PATHS = ["system.tools", "system.attributes.prof", "system.currency", `flags.${ID}`, "name"];

/** Redraw hooks (hot hooks: bail first unless a Crafting window is open for that actor). */
export function registerHooks() {
  changed.add(() => refresh());
  const open = (/** @type {string | undefined} */ id) => !!id && [...OPEN.values()].some(app => app.actor?.id === id);
  Hooks.on("updateActor", (/** @type {any} */ actor, /** @type {any} */ changes) => {
    if (!open(actor?.id)) return;
    if (!ACTOR_PATHS.some(p => foundry.utils.hasProperty(changes, p))) return;
    refresh(actor.id);
  });
  // Materials are items; tool proficiencies can come from items and effects.
  for (const h of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(h, (/** @type {any} */ doc) => { const id = doc?.parent?.id; if (open(id)) refresh(id); });
  }
}
