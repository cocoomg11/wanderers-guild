/**
 * Remove Wanderer's Guild data: what this module stored, counted first (a dry run), removed only after the GM types REMOVE. Every
 * new flag, setting, status effect, folder or document the module writes must be found by plan(), removed by remove() and listed
 * in CATEGORIES. Core supplies the dry run, the confirmation word and the "settings that differ from their defaults" rule; the
 * setup window's Data page shows it.
 *
 * Version 0.1 writes only settings: the profession definitions and rank table (world), the switches (world), and this browser's
 * window placement (client). Nothing on actors, items, scenes, journals or chat messages.
 */
import { dryRun, picked, confirmed, summary, changedSettings } from "../vendor/wanderers-core/index.mjs";
import { settingValues, resetSettings } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { S } from "./core.mjs";
import { normalizeProfessions } from "./professions-model.mjs";

/** World data the GM wrote in the setup window. */
export const DATA_KEYS = Object.freeze(["professionList", "rankTable"]);

/** @type {import("../vendor/wanderers-core/cleanup-model.mjs").Category[]} [key, label, tickedByDefault] */
export const CATEGORIES = [
  ["professions", "Profession definitions (the setup window's Professions page)", false],
  ["ranks", "Rank table changes (back to the default names and rarities)", false],
  ["settings", `Reset ${TITLE}'s other settings to their defaults (feature switches, switches, debug logging, this browser's window positions; reloads if a feature switch changes)`, false]
];

/** What each category would remove. Nothing is changed. */
export function plan() {
  const list = normalizeProfessions(S.get("professionList")).list.map(p => ({ id: p.id, name: p.name }));
  const defs = settingValues(ID);
  const ranks = changedSettings(defs.filter(d => d.key === "rankTable"));
  const settings = changedSettings(defs.filter(d => !DATA_KEYS.includes(d.key)), { scopes: ["world", "client"] });
  return { professions: list, ranks, settings };
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
    if (k === "settings") done.settings = await resetSettings(ID, p.settings.map(item => /** @type {string} */ (item.key)));
  }
  return done;
}

export const describe = (/** @type {Record<string, number>} */ done) => summary(done, CATEGORIES);
