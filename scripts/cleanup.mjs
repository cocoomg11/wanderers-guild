/**
 * Remove Wanderer's Guild data: what this module stored, counted first (a dry run), removed only after the GM types REMOVE. Every
 * new flag, setting, status effect, folder or document the module writes must be found by plan(), removed by remove() and listed
 * in CATEGORIES. Core supplies the dry run, the confirmation word and the "settings that differ from their defaults" rule; the
 * setup window's Data page shows it.
 *
 * What the module writes: world settings (the profession definitions, rank table, recipes, crafting rules and switches), this
 * browser's window placement (client), each character's known recipes (`flags.wanderers-guild.recipes` on actors), our craft
 * chat cards and notices (chat messages with `flags.wanderers-guild.craft` / `.notice`, deleted here), and our marks on tool check
 * messages (`flags.wanderers-guild.craftRoll` / `.rollUsed`: the flags are removed, the rolls stay). Crafted items and used-up
 * materials are ordinary items now and are not touched.
 */
import { dryRun, picked, confirmed, summary, changedSettings, hasFlags } from "../vendor/wanderers-core/index.mjs";
import { settingValues, resetSettings, unsetFlags } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { S } from "./core.mjs";
import { normalizeProfessions } from "./professions-model.mjs";
import { normalizeRecipes } from "./recipes-model.mjs";

/** World data the GM wrote in the setup window. */
export const DATA_KEYS = Object.freeze(["professionList", "rankTable", "recipeBook", "craftRules"]);

/** @type {import("../vendor/wanderers-core/cleanup-model.mjs").Category[]} [key, label, tickedByDefault] */
export const CATEGORIES = [
  ["professions", "Profession definitions (the setup window's Professions page)", false],
  ["ranks", "Rank table changes (back to the default names and rarities)", false],
  ["recipes", "Recipes (the setup window's Recipes page)", false],
  ["rules", "Crafting rules (back to nothing set)", false],
  ["known", "Known recipes on characters (the flag only; the characters stay)", false],
  ["cards", "Crafting chat cards and notices (deleted), and our marks on tool check rolls (the rolls stay)", false],
  ["settings", `Reset ${TITLE}'s other settings to their defaults (feature switches, switches, debug logging, this browser's window positions; reloads if a feature switch changes)`, false]
];

/** Our chat messages (cards and notices) vs others' messages we only flagged. @param {any} m */
const ours = m => !!(m?.flags?.[ID]?.craft || m?.flags?.[ID]?.notice);

/** What each category would remove. Nothing is changed. */
export function plan() {
  const list = normalizeProfessions(S.get("professionList")).list.map(p => ({ id: p.id, name: p.name }));
  const defs = settingValues(ID);
  const ranks = changedSettings(defs.filter(d => d.key === "rankTable"));
  const recipes = normalizeRecipes(S.get("recipeBook")).list.map(r => ({ id: r.id, name: r.name }));
  const rules = changedSettings(defs.filter(d => d.key === "craftRules"));
  const known = (game.actors?.contents ?? []).filter((/** @type {any} */ a) => hasFlags(a, ID)).map((/** @type {any} */ a) => ({ uuid: a.uuid, name: a.name }));
  const msgs = (game.messages?.contents ?? []).filter((/** @type {any} */ m) => hasFlags(m, ID));
  const cards = msgs.map((/** @type {any} */ m) => ({ id: m.id, uuid: m.uuid, name: ours(m) ? "card" : "roll", delete: ours(m) }));
  const settings = changedSettings(defs.filter(d => !DATA_KEYS.includes(d.key)), { scopes: ["world", "client"] });
  return { professions: list, ranks, recipes, rules, known, cards, settings };
}

/** The dry run as rows: [{ key, label, count, ticked, text }]. */
export const dryRunRows = () => dryRun(CATEGORIES, plan());

/**
 * Carries out the picked categories after the typed word matches: { [category]: number }, or null when refused.
 * @param {Record<string, boolean>} pick
 * @param {string} word what the GM typed (must be REMOVE)
 */
export async function remove(pick = {}, word = "") {
  if (!game.user?.isGM) { ui.notifications.warn(`${TITLE}: GM only.`); return null; }
  if (!confirmed(word)) { ui.notifications.warn(`${TITLE}: type REMOVE to confirm.`); return null; }
  const p = plan(); /** @type {Record<string, number>} */ const done = {};
  for (const k of picked(CATEGORIES, pick, p)) {
    if (k === "professions" && await resetSettings(ID, ["professionList"])) done.professions = p.professions.length;
    if (k === "ranks") done.ranks = await resetSettings(ID, ["rankTable"]);
    if (k === "recipes" && await resetSettings(ID, ["recipeBook"])) done.recipes = p.recipes.length;
    if (k === "rules") done.rules = await resetSettings(ID, ["craftRules"]);
    if (k === "known") done.known = await unsetFlags(ID, p.known.map((/** @type {any} */ a) => a.uuid));
    if (k === "cards") {
      const del = p.cards.filter(c => c.delete).map(c => c.id);
      try { if (del.length) await ChatMessage.deleteDocuments(del); } catch (e) { console.warn(`${ID} | delete cards`, e); }
      done.cards = del.length + await unsetFlags(ID, p.cards.filter(c => !c.delete).map(c => c.uuid));
    }
    if (k === "settings") done.settings = await resetSettings(ID, p.settings.map(item => /** @type {string} */ (item.key)));
  }
  return done;
}

export const describe = (/** @type {Record<string, number>} */ done) => summary(done, CATEGORIES);
