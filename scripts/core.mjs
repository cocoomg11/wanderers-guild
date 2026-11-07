/**
 * The one place that binds wanderers-core to this module: the feature registry, the settings table, debug logging and the
 * one-writer leader. Everything else imports F, S, log and leader from here. Core is vendored in vendor/wanderers-core/ and is never
 * edited by hand (`node vendor/wanderers-core/vendor.mjs update X.Y.Z`).
 */
import { createFeatures, createSettings, createLogger, createLeader } from "../vendor/wanderers-core/foundry/index.mjs";
import { defineRequests, records } from "../vendor/wanderers-core/index.mjs";
import { ID, TITLE, HOOKS } from "./const.mjs";
import { PROFESSIONS_VERSION } from "./professions-model.mjs";
import { defaultRanks } from "./ranks-model.mjs";
import { RECIPES_VERSION } from "./recipes-model.mjs";
import { defaultRules, CHOICES, HELPERS_MAX } from "./craft-model.mjs";

/**
 * Features: one world setting per tool (`feature-<id>`, reload). A turned-off tool registers nothing (no hooks, buttons, key
 * bindings or socket handlers) and its API entry is undefined. Setting keys are stable: never rename one.
 */
export const F = createFeatures(ID, [
  { id: "professions", label: "Professions", hint: "A Professions window per character: professions from the character's tool proficiencies, rank from the proficiency bonus. The GM setup window and api.open(actor)." },
  { id: "sheetButton", label: "Sheet button", hint: "A Professions button in the header of dnd5e character sheets (owners and observers).", needs: ["professions"] },
  { id: "crafting", label: "Crafting", hint: "Recipes and the Crafting window: the Craft and Recipes buttons roll the linked tool check, and the active GM's client makes the item and uses up the materials.", needs: ["professions"] }
], { title: TITLE, where: "Game Settings" });

/** Called after the definitions or the rank table change on this client (any GM's edit reaches every client). */
export const changed = new Set(/** @type {Array<() => void>} */ ([]));
const fire = () => { for (const fn of changed) { try { fn(); } catch (e) { console.warn(`${ID} |`, e); } } };

/**
 * Every other setting is one row. Records (`hidden`) are written by the setup window (GM clicks) and read by everyone: the
 * profession definitions and the rank table are not GM-only (players' Professions windows need them). Switches show on the setup
 * window's Settings page (tab "settings").
 */
export const S = createSettings(ID, [
  { key: "professionList", type: "object", default: { v: PROFESSIONS_VERSION, list: [] }, hidden: true, onChange: fire },
  { key: "rankTable", type: "object", default: defaultRanks(), hidden: true, onChange: fire },
  { key: "showUnlearned", type: "bool", default: true, label: "Show professions not learned yet", hint: "The Professions window also lists the world's other professions, with the tool each one needs.", tab: "settings", onChange: fire },
  { key: "recipeBook", type: "object", default: { v: RECIPES_VERSION, list: [] }, hidden: true, onChange: fire },
  { key: "craftRules", type: "object", default: defaultRules(), hidden: true, onChange: fire },
  { key: "playersLearn", type: "bool", default: true, label: "Players learn recipes themselves", hint: "A player can learn a recipe of their profession that their rank allows (the Recipes page's Learn button). Off: only a GM teaches recipes.", tab: "settings", feature: "crafting", onChange: fire },
  { key: "craftApproval", type: "bool", default: false, label: "GM approves each craft", hint: "After the tool check, a GM card with Approve and Refuse buttons decides; nothing is made or used up until then. Off: the result follows the roll at once (a craft with no DC always waits for the GM).", tab: "settings", feature: "crafting", onChange: fire },
  { key: "worldCoins", type: "bool", default: false, label: "Prices in the world's coins (Wanderer's Toolkit)", hint: "Show and charge crafting prices in the world's own coins (the toolkit's three-coin economy, when it is active). Off: book values (standard gold, silver and copper).", tab: "settings", feature: "crafting", onChange: fire },
  { key: "debugLog", type: "bool", default: false, label: "Debug logging", hint: "Write the module's decisions to the browser console.", tab: "settings" }
], { reserved: F.FEATURES.map(f => f.key) });

/** Hidden record keys (never on a settings page; skipped by the Satchel's settings export). */
export const RECORDS = Object.freeze([...records(S.ROWS), "windowPlacement"]);

export const { log, warn } = createLogger(ID);

const RECIPE_ID = { type: /** @type {const} */ ("string"), min: 1, max: 40, pattern: /^[a-z][a-z0-9_-]{0,39}$/ };
const ACTOR = { type: /** @type {const} */ ("uuid"), max: 300 };

/**
 * Socket requests the leader accepts: a schema per kind; anything else is refused. Each handler (craft-leader.mjs) checks the
 * sending user's rights itself (Foundry's sender, never a payload field):
 * - `learnRecipe` { actor, recipe }: a player who owns the actor (and has the profession, a rank that allows it, the
 *   *Players learn recipes* switch on), or a GM (teach: no checks but the recipe existing).
 * - `forgetRecipe` { actor, recipe }: GM only.
 * - `craft` { actor, recipe, roll, helpers }: the owner (or a GM) after rolling the tool check; `roll` is the roll's chat message,
 *   which the leader reads (author, actor, our flag, age, not used before) instead of trusting a total.
 * - `craftDecide` { message, choice }: GM only; a choice on a pending craft card.
 */
export const REQUESTS = defineRequests({
  learnRecipe: { fields: { actor: ACTOR, recipe: RECIPE_ID } },
  forgetRecipe: { fields: { actor: ACTOR, recipe: RECIPE_ID }, from: "gm" },
  craft: { fields: { actor: ACTOR, recipe: RECIPE_ID, roll: { type: "id" }, helpers: { type: "number", int: true, min: 0, max: HELPERS_MAX } } },
  craftDecide: { fields: { message: { type: "id" }, choice: { type: "string", oneOf: CHOICES } }, from: "gm" }
});

/** `module.json` has `"socket": true`. Automatic writes run only when `leader.isLeader()`. */
export const leader = createLeader({ id: ID, log, requests: REQUESTS, hooks: [HOOKS.ready] });
