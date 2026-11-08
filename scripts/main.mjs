/**
 * Wanderer's Guild entry point: settings, hooks, buttons and the API (`game.modules.get("wanderers-guild").api`). The api exists
 * from our init hook; `wanderers-guild.ready` fires once at our ready hook. wanderers-core is bound in core.mjs.
 */
import { registerWindowPlacement } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE, HOOKS } from "./const.mjs";
import { F, S, RECORDS, leader, warn } from "./core.mjs";
import * as Health from "./health.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as Professions from "./professions.mjs";
import * as Setup from "./setup.mjs";
import * as Data from "./data.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Crafting from "./crafting.mjs";
import * as CraftLeader from "./craft-leader.mjs";
import * as SheetPage from "./sheet-page.mjs";
import * as Gathering from "./gathering.mjs";
import * as GatherLeader from "./gather-leader.mjs";
import * as Nodes from "./nodes.mjs";
import { gatherFacts } from "./gather-read.mjs";
import { assessGather } from "./gather-model.mjs";
import { context, assessIn, recipeItems, learnFacts } from "./craft-read.mjs";
import { recipeItemRows } from "./learn-model.mjs";
import * as LearnGM from "./learn-gm.mjs";
import { registration, registerWith, SATCHEL_ID } from "./satchel-model.mjs";

let isReady = false;
const gm = () => { if (game.user?.isGM) return true; ui.notifications.warn(`${TITLE}: GM only.`); return false; };

export const API = {
  get version() { return game.modules.get(ID)?.version; },
  /** Read-only health report: [{ title, lines: [{ level, text, fix? }] }] (GM; players get []). */
  health: (/** @type {{ timeoutMs?: number }} */ opts = {}) => Health.run(opts),
  /** Remove module data: plan(), dryRun(), remove(pick, "REMOVE") (GM). */
  cleanup: { plan: () => Cleanup.plan(), dryRun: () => Cleanup.dryRunRows(), remove: (/** @type {Record<string, boolean>} */ pick, /** @type {string} */ word) => Cleanup.remove(pick, word) },
  /** Opens the Professions window for an actor (Actor, id or UUID; default: your character or the selected token). Undefined when off. */
  get open() { return F.on("professions") ? (/** @type {any} */ actor) => Professions.open(actor ?? Professions.defaultActor()) : undefined; },
  /** The model the Professions window draws for an actor (read only). Undefined when off. */
  get professionsOf() { return F.on("professions") ? (/** @type {any} */ actor) => (Professions.canView(actor) ? Professions.viewOf(actor) : undefined) : undefined; },
  /** Opens the GM setup window, on a page ("professions", "ranks", "settings", "health", "data"). Undefined when off. */
  get setup() { return F.on("professions") ? (/** @type {string | undefined} */ page) => (gm() ? Setup.open(page) : undefined) : undefined; },
  /** The world's definitions and rank table, normalized (read only). Undefined when off. */
  get definitions() { return F.on("professions") ? { professions: () => Data.professions(), ranks: () => Data.ranks() } : undefined; },
  /**
   * Crafting (experimental): open the window, read the world's recipes and rules, a character's known recipes and one recipe's
   * assessment. Learning and forgetting go through the active GM's client. Undefined when the Crafting feature is off.
   */
  get crafting() {
    if (!F.on("crafting")) return undefined;
    const actorOf = (/** @type {any} */ a) => (typeof a === "string" ? game.actors?.get(a) ?? fromUuidSync(a) : a);
    return {
      open: (/** @type {any} */ actor, /** @type {string} */ professionId, /** @type {"craft" | "recipes"} */ mode = "craft") => Crafting.open(actor, professionId, mode),
      recipes: () => Data.recipes(),
      rules: () => Data.rules(),
      known: (/** @type {any} */ actor) => { const a = actorOf(actor); return a && Professions.canView(a) ? Data.known(a) : undefined; },
      assess: (/** @type {any} */ actor, /** @type {string} */ recipeId, /** @type {{ batch?: number }} */ opts = {}) => {
        const a = actorOf(actor); if (!a || !Professions.canView(a)) return undefined;
        const ctx = context(a); const r = ctx.book.list.find(x => x.id === recipeId);
        return r ? assessIn(ctx, r, 0, Number(opts?.batch) || 1) : undefined;
      },
      learn: (/** @type {any} */ actor, /** @type {string} */ recipeId) => { const a = actorOf(actor); return !!a && leader.request("learnRecipe", { actor: a.uuid, recipe: recipeId }); },
      forget: (/** @type {any} */ actor, /** @type {string} */ recipeId) => { const a = actorOf(actor); return gm() && !!a && leader.request("forgetRecipe", { actor: a.uuid, recipe: recipeId }); },
      learnFromItem: (/** @type {any} */ actor, /** @type {any} */ item) => { const a = actorOf(actor); const uuid = typeof item === "string" ? item : item?.uuid; return !!a && !!uuid && Crafting.learnFromItem(a, uuid); },
      recipeItems: (/** @type {any} */ actor) => { const a = actorOf(actor); return a && Professions.canView(a) ? recipeItemRows(recipeItems(a), Data.recipes().list, learnFacts(a, game.user)) : undefined; },
      teachTo: (/** @type {string} */ recipeId, /** @type {any[]} */ actors) => (gm() ? LearnGM.teachTo(recipeId, (actors ?? []).map(actorOf).filter(Boolean)) : undefined),
      makeRecipeItem: (/** @type {string} */ recipeId) => (gm() ? LearnGM.makeRecipeItem(recipeId) : undefined)
    };
  },
  /**
   * Gathering (experimental): open the Gather window, read the gathering rules and a scene's nodes, assess one gather, and (GM) place
   * a node or reset the limits. Undefined when the Gathering feature is off.
   */
  get gathering() {
    if (!F.on("gathering")) return undefined;
    const actorOf = (/** @type {any} */ a) => (typeof a === "string" ? game.actors?.get(a) ?? fromUuidSync(a) : a);
    return {
      open: (/** @type {any} */ actor, /** @type {string | undefined} */ professionId) => Gathering.open(actor, professionId),
      rules: () => Data.gatherRules(),
      nodes: (/** @type {any} */ scene) => { const s = scene ?? canvas?.scene; return (s?.notes ?? []).map((/** @type {any} */ n) => ({ id: n.id, uuid: n.uuid, node: Data.nodeOf(n) })).filter((/** @type {any} */ n) => n.node && (game.user?.isGM || !n.node.hidden)); },
      assess: (/** @type {any} */ actor, /** @type {string} */ professionId, /** @type {{ note?: any, scene?: any, token?: any }} */ target, /** @type {{ days?: number }} */ o = {}) => {
        const a = actorOf(actor); if (!a || !Professions.canView(a) || !target) return undefined;
        return assessGather(gatherFacts(a, professionId, target, { isGM: !!game.user?.isGM, days: o?.days }));
      },
      place: () => (gm() ? Nodes.arm() : undefined),
      resetLimits: () => (gm() ? Data.resetGatherLimits() : undefined)
    };
  },
  get isReady() { return isReady; },
  features: F
};

Hooks.once("init", () => {
  F.register({ config: true });
  S.register();
  registerWindowPlacement(ID);
  const mod = game.modules.get(ID); if (mod) mod.api = API;
  // A turned-off feature registers nothing: no hooks, no buttons, no menus.
  if (F.on("professions")) {
    Setup.registerMenu();
    Professions.setSetupOpener(() => Setup.open());
    Professions.registerHooks();
    Setup.registerHooks();
  }
  if (F.on("sheetButton")) Professions.registerSheetButton();
  if (F.on("crafting")) {
    Professions.setCraftingOpener((actor, professionId, mode) => Crafting.open(actor, professionId, mode));
    Professions.setRecipeItems({ rows: actor => recipeItemRows(recipeItems(actor), Data.recipes().list, learnFacts(actor, game.user)), learn: (actor, item) => Crafting.learnFromItem(actor, item) });
    Crafting.registerHooks();
    CraftLeader.registerCardHook();
  }
  if (F.on("gathering")) {
    Professions.setGatherOpener((actor, professionId) => Gathering.open(actor, professionId));
    Gathering.init();
    GatherLeader.registerJourneyHook();
  }
});

Hooks.once("ready", () => {
  isReady = true;
  if (F.on("crafting")) CraftLeader.registerHandlers();
  if (F.on("gathering")) GatherLeader.registerHandlers();
  if (F.on("toolkitPage")) SheetPage.ready();
  leader.start();
  if (!D5.isDnd5e() && game.user?.isGM) ui.notifications.warn(`${TITLE} needs the dnd5e system; this world runs ${game.system?.id}.`);
  // Optional: show up in the Wanderer's Satchel hub when it is installed.
  const reg = registration({
    id: ID, title: TITLE,
    open: () => (F.on("professions") ? Setup.open() : false), openLabel: "Professions setup",
    openPanel: () => (F.on("professions") ? Setup.open("settings") : false),
    health: opts => Health.run(opts), records: RECORDS, debugKey: "debugLog"
  });
  registerWith(reg, {
    active: () => !!game.modules.get(SATCHEL_ID)?.active,
    api: () => game.modules.get(SATCHEL_ID)?.api,
    once: (hook, fn) => Hooks.once(hook, fn),
    warn: (msg, e) => warn(msg, e ?? "")
  });
  Hooks.callAll(HOOKS.ready, API);
  console.log(`${ID} | ready (v${API.version})`);
});
