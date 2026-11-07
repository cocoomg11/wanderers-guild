/**
 * The GM's writes to the world data (setup window clicks and the health check's Fix button): profession definitions and the rank
 * table, the recipes and the crafting rules, all world settings read by every client. GM only; each write goes through the model's normalizer first. Untested in
 * Node (settings writes); the rules are in professions-model.mjs and ranks-model.mjs.
 */
import { TITLE } from "./const.mjs";
import { S, log } from "./core.mjs";
import * as PM from "./professions-model.mjs";
import * as RM from "./ranks-model.mjs";
import * as D5 from "./dnd5e.mjs";
import * as RC from "./recipes-model.mjs";
import * as CM from "./craft-model.mjs";
import { ID } from "./const.mjs";

const gm = () => { if (game.user?.isGM) return true; ui.notifications.warn(`${TITLE}: GM only.`); return false; };

/** The definitions as stored (normalized). */
export const professions = () => PM.normalizeProfessions(S.get("professionList"));
/** The rank table as stored (normalized). */
export const ranks = () => RM.normalizeRanks(S.get("rankTable"));

/** Saves a whole definitions list. @param {unknown} list */
export async function saveProfessions(list) {
  if (!gm()) return false;
  await S.set("professionList", PM.normalizeProfessions(list));
  return true;
}

/** Saves a rank table (normalized: sorted, one row per bonus). @param {unknown} table */
export async function saveRanks(table) {
  if (!gm()) return false;
  await S.set("rankTable", RM.normalizeRanks(table));
  return true;
}

/** Adds the starter professions this world's tools allow. Resolves to the names added. */
export async function addStarterSet() {
  if (!gm()) return [];
  const r = PM.addStarter(professions(), D5.toolChoices().map(t => t.key));
  if (r.added.length) await S.set("professionList", r.list);
  log("starter set added", r.added);
  ui.notifications.info(r.added.length ? `${TITLE}: added ${r.added.join(", ")}.` : `${TITLE}: every starter tool already has a profession.`);
  return r.added;
}

/** The recipes as stored (normalized). */
export const recipes = () => RC.normalizeRecipes(S.get("recipeBook"));
/** The crafting rules as stored (normalized). */
export const rules = () => CM.normalizeRules(S.get("craftRules"));
/** An actor's known recipes (the flag, normalized). @param {any} actor */
export const known = actor => RC.normalizeKnown(actor?.getFlag?.(ID, "recipes") ?? actor?.flags?.[ID]?.recipes);

/** Saves the whole recipe book. @param {unknown} book */
export async function saveRecipes(book) {
  if (!gm()) return false;
  await S.set("recipeBook", RC.normalizeRecipes(book));
  return true;
}

/** Saves the crafting rules. @param {unknown} r */
export async function saveRules(r) {
  if (!gm()) return false;
  await S.set("craftRules", CM.normalizeRules(r));
  return true;
}
