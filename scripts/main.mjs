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
});

Hooks.once("ready", () => {
  isReady = true;
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
