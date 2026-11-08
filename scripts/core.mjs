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
import { defaultRules, CHOICES, HELPERS_MAX, BATCH_LIMIT } from "./craft-model.mjs";
import { defaultGatherRules, DAYS_MAX } from "./gather-model.mjs";

/**
 * Features: one world setting per tool (`feature-<id>`, reload). A turned-off tool registers nothing (no hooks, buttons, key
 * bindings or socket handlers) and its API entry is undefined. Setting keys are stable: never rename one.
 */
export const F = createFeatures(ID, [
  { id: "professions", label: "Professions", hint: "A Professions window per character: professions from the character's tool proficiencies, rank from the proficiency bonus. The GM setup window and api.open(actor)." },
  { id: "sheetButton", label: "Sheet button", hint: "A Professions button in the header of dnd5e character sheets (owners and observers).", needs: ["professions"] },
  { id: "crafting", label: "Crafting", hint: "Recipes and the Crafting window: the Craft and Recipes buttons roll the linked tool check, and the active GM's client makes the item and uses up the materials.", needs: ["professions"] },
  { id: "gathering", label: "Gathering", hint: "Gathering nodes on the map, scene tiers and harvesting defeated creatures: the Gather button rolls the profession's check, and the active GM's client gives the resources.", needs: ["professions"] },
  { id: "toolkitPage", label: "Toolkit sheet page", hint: "A Professions page (bookmark) on Wanderer's Toolkit's character sheet, when the toolkit (2.3.0 or later) is active with its sheet on. The Professions window stays.", needs: ["professions"] }
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
  { key: "trustRecipeItems", type: "bool", default: false, label: "Trust recipe items without a source", hint: "Off (default): a player's recipe item teaches only when it is a copy of a recipe item the GM marked (in the Items sidebar or a compendium) that teaches the same recipe. On: any item carrying the recipe flag teaches, for GMs who make recipe items directly on characters. Either way this is partly an honor system: a player who edits their own items from the console can still copy a real recipe item's marks.", tab: "settings", feature: "crafting", onChange: fire },
  { key: "undiscoveredRecipes", type: "choice", default: "show", choices: { show: "Show (greyed, with how to get each)", hide: "Hide (players see only the recipes they know)" }, label: "Recipes not known yet", hint: "Show: a player's Recipes page lists every recipe of the profession, greyed, with how to get it (Learn, Needs a recipe item, Ask your GM). Hide: players see only the recipes they know (and the ones a recipe item they carry teaches). Display only: the recipes are a world setting every client receives, so Hide is not secrecy.", tab: "settings", feature: "crafting", onChange: fire },
  { key: "craftApproval", type: "bool", default: false, label: "GM approves each craft", hint: "After the tool check, a GM card with Approve and Refuse buttons decides; nothing is made or used up until then. Off (default): the craft resolves when the roll lands, nothing waits for a GM, and a craft with no DC succeeds on the roll.", tab: "settings", feature: "crafting", onChange: fire },
  { key: "worldCoins", type: "bool", default: false, label: "Prices in the world's coins (Wanderer's Toolkit)", hint: "Show and charge crafting prices in the world's own coins (the toolkit's three-coin economy, when it is active). Off: book values (standard gold, silver and copper).", tab: "settings", feature: "crafting", onChange: fire },
  { key: "gatherRules", type: "object", default: defaultGatherRules(), hidden: true, onChange: fire },
  { key: "gatherReset", type: "object", default: { v: 2, at: 0, days: null }, hidden: true, onChange: fire },
  { key: "gatherOnce", type: "bool", default: true, label: "One gather per node until reset", hint: "A character gathers once at each node (and once per scene without a node) until the GM presses Reset gathering limits, or the party travels on with Wanderer's Toolkit. Off: no limit but the node's uses.", tab: "settings", feature: "gathering", onChange: fire },
  { key: "gatherArea", type: "bool", default: true, label: "Gather without a node", hint: "A character can gather in a scene's area (its tier's DC) when no node is near. Off: only at nodes.", tab: "settings", feature: "gathering", onChange: fire },
  { key: "gatherJourney", type: "bool", default: true, label: "Travel resets gathering limits", hint: "When Wanderer's Toolkit reports a journey (hex travel or a flight), the gathering limits reset, as at a new journey stage.", tab: "settings", feature: "gathering", onChange: fire },
  { key: "debugLog", type: "bool", default: false, label: "Debug logging", hint: "Write the module's decisions to the browser console.", tab: "settings" }
], { reserved: F.FEATURES.map(f => f.key) });

/** Hidden record keys (never on a settings page; skipped by the Satchel's settings export). */
export const RECORDS = Object.freeze([...records(S.ROWS), "windowPlacement"]);

export const { log, warn } = createLogger(ID);

const RECIPE_ID = { type: /** @type {const} */ ("string"), min: 1, max: 40, pattern: /^[a-z][a-z0-9_-]{0,39}$/ };
const ACTOR = { type: /** @type {const} */ ("uuid"), max: 300 };
const DAYS = { type: /** @type {const} */ ("number"), int: true, min: 1, max: DAYS_MAX };

/**
 * Socket requests the leader accepts: a schema per kind; anything else is refused. Each handler (craft-leader.mjs) checks the
 * sending user's rights itself (Foundry's sender, never a payload field):
 * - `learnRecipe` { actor, recipe }: a player who owns the actor (and has the profession, a rank that allows it, the
 *   *Players learn recipes* switch on, the recipe *Learned by: Rank*), or a GM (teach: no checks but the recipe existing).
 * - `forgetRecipe` { actor, recipe }: GM only.
 * - `learnFromItem` { actor, item }: the owner (or a GM) uses a recipe item; `item` must be an item embedded on that actor. The leader
 *   reads the recipe from the item's own flag (never from the payload), re-checks (learn-model.mjs `assessLearn`), learns, then uses
 *   one item up unless it is set to keep.
 * - `craft` { actor, recipe, roll, helpers, qty? }: the owner (or a GM) after rolling the tool check; `roll` is the roll's chat message,
 *   which the leader reads (author, actor, our flag, age, not used before) instead of trusting a total. `qty` (0.5, 1–BATCH_LIMIT,
 *   missing = 1) is the batch size; the leader clamps it to the rules' `batchMax` (`clampBatch`) and re-assesses with it.
 * - `craftDecide` { message, choice }: GM only; a choice on a pending craft card.
 * - `gather` { actor, profession, roll, days, node? | scene? | token? }: the owner (or a GM) after rolling the gathering check; exactly
 *   one of node (a Note's UUID), scene (gather in that scene's area) or token (harvest that creature); `days` = days in this journey
 *   stage (1–30; "perDay" quantity, ignored for creatures and in "flat" mode). The leader reads the roll's message as for crafting,
 *   clamps the days and re-checks everything (gather-model.mjs `assessGather`).
 * - `gatherReset` { days? }: GM only; a non-writing GM client relays a toolkit journey (the limits reset; `days` = the journey's
 *   length from its hours, when it had any).
 */
export const REQUESTS = defineRequests({
  learnRecipe: { fields: { actor: ACTOR, recipe: RECIPE_ID } },
  forgetRecipe: { fields: { actor: ACTOR, recipe: RECIPE_ID }, from: "gm" },
  learnFromItem: { fields: { actor: ACTOR, item: { type: "uuid", max: 340 } } },
  craft: { fields: { actor: ACTOR, recipe: RECIPE_ID, roll: { type: "id" }, helpers: { type: "number", int: true, min: 0, max: HELPERS_MAX }, qty: { type: "number", int: true, min: 1, max: BATCH_LIMIT, optional: true } } },
  craftDecide: { fields: { message: { type: "id" }, choice: { type: "string", oneOf: CHOICES } }, from: "gm" },
  gather: { fields: { actor: ACTOR, profession: RECIPE_ID, roll: { type: "id" }, days: DAYS, node: { ...ACTOR, optional: true }, scene: { type: "id", optional: true }, token: { ...ACTOR, optional: true } } },
  gatherReset: { fields: { days: { ...DAYS, optional: true } }, from: "gm" }
});

/** `module.json` has `"socket": true`. Automatic writes run only when `leader.isLeader()`. */
export const leader = createLeader({ id: ID, log, requests: REQUESTS, hooks: [HOOKS.ready] });
