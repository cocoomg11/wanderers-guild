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
 *
 * 0.3 (gathering): the world settings `gatherRules` and `gatherReset`, scenes' tiers (`flags.wanderers-guild.tier`), gathering nodes (Notes with `flags.wanderers-guild.node`,
 * deleted here), characters' limits (`flags.wanderers-guild.gathered`, on world actors and unlinked tokens' actors), harvested
 * creatures (`flags.wanderers-guild.harvested` on tokens), gather cards (`flags.wanderers-guild.gather`, deleted) and our marks on
 * gather rolls (`gatherRoll` / `rollUsed`). Gathered items stay. Each actor / token flag is removed by its own key, so removing one
 * category leaves the others.
 */
import { dryRun, picked, confirmed, summary, changedSettings, hasFlags } from "../vendor/wanderers-core/index.mjs";
import { settingValues, resetSettings, unsetFlags } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { S } from "./core.mjs";
import { normalizeProfessions } from "./professions-model.mjs";
import { normalizeRecipes } from "./recipes-model.mjs";

/** World data the GM wrote in the setup window. */
export const DATA_KEYS = Object.freeze(["professionList", "rankTable", "recipeBook", "craftRules", "gatherRules", "gatherReset"]);

/** @type {import("../vendor/wanderers-core/cleanup-model.mjs").Category[]} [key, label, tickedByDefault] */
export const CATEGORIES = [
  ["professions", "Profession definitions (the setup window's Professions page)", false],
  ["ranks", "Rank table changes (back to the default names and rarities)", false],
  ["recipes", "Recipes (the setup window's Recipes page)", false],
  ["rules", "Crafting rules (back to nothing set)", false],
  ["known", "Known recipes on characters (the flag only; the characters stay)", false],
  ["gathering", "Gathering rules, the limits' reset record and scenes' gathering tiers (back to nothing set)", false],
  ["nodes", "Gathering nodes on every scene (the map notes are deleted)", false],
  ["gathered", "Gathering limits on characters (the flag only)", false],
  ["harvested", "Harvested marks on creature tokens (the flag only)", false],
  ["cards", "Crafting and gathering chat cards and notices (deleted), and our marks on check rolls (the rolls stay)", false],
  ["settings", `Reset ${TITLE}'s other settings to their defaults (feature switches, switches, debug logging, this browser's window positions; reloads if a feature switch changes)`, false]
];

/** Our chat messages (cards and notices) vs others' messages we only flagged. @param {any} m */
const ours = m => !!(m?.flags?.[ID]?.craft || m?.flags?.[ID]?.gather || m?.flags?.[ID]?.notice);
/** Whether a document has our flag `key`. @param {any} d @param {string} key */
const hasKey = (d, key) => !!(d?._source?.flags?.[ID]?.[key] ?? d?.flags?.[ID]?.[key]);
/** Actors that may carry an actor flag: world actors, then unlinked tokens' actors. */
function* allActors() {
  yield* game.actors?.contents ?? [];
  for (const sc of game.scenes ?? []) for (const t of sc.tokens ?? []) if (!t.actorLink && t.actor) yield t.actor;
}
/** Removes one of our flag keys from each document. @param {string[]} uuids @param {string} key */
async function unsetKey(uuids, key) {
  let n = 0;
  for (const uuid of uuids) {
    try { const d = await fromUuid(uuid); if (d && hasKey(d, key)) { await d.unsetFlag(ID, key); n += 1; } } catch (e) { console.warn(`${ID} | remove ${key} ${uuid}`, e); }
  }
  return n;
}

/** What each category would remove. Nothing is changed. */
export function plan() {
  const list = normalizeProfessions(S.get("professionList")).list.map(p => ({ id: p.id, name: p.name }));
  const defs = settingValues(ID);
  const ranks = changedSettings(defs.filter(d => d.key === "rankTable"));
  const recipes = normalizeRecipes(S.get("recipeBook")).list.map(r => ({ id: r.id, name: r.name }));
  const rules = changedSettings(defs.filter(d => d.key === "craftRules"));
  const actors = [...allActors()];
  const known = actors.filter(a => hasKey(a, "recipes")).map(a => ({ uuid: a.uuid, name: a.name }));
  const gathered = actors.filter(a => hasKey(a, "gathered")).map(a => ({ uuid: a.uuid, name: a.name }));
  const gathering = [...changedSettings(defs.filter(d => d.key === "gatherRules" || d.key === "gatherReset")),
    ...(game.scenes?.contents ?? []).filter((/** @type {any} */ sc) => hasKey(sc, "tier")).map((/** @type {any} */ sc) => ({ uuid: sc.uuid, name: `${sc.name} (tier)` }))];
  /** @type {Array<{ uuid: string, name: string, scene: any, id: string }>} */ const nodes = [];
  /** @type {Array<{ uuid: string, name: string }>} */ const harvested = [];
  for (const sc of game.scenes ?? []) {
    for (const n of sc.notes ?? []) if (hasKey(n, "node")) nodes.push({ uuid: n.uuid, name: `${n.text || "node"} (${sc.name})`, scene: sc, id: n.id });
    for (const t of sc.tokens ?? []) if (hasKey(t, "harvested")) harvested.push({ uuid: t.uuid, name: t.name });
  }
  const msgs = (game.messages?.contents ?? []).filter((/** @type {any} */ m) => hasFlags(m, ID));
  const cards = msgs.map((/** @type {any} */ m) => ({ id: m.id, uuid: m.uuid, name: ours(m) ? "card" : "roll", delete: ours(m) }));
  const settings = changedSettings(defs.filter(d => !DATA_KEYS.includes(d.key)), { scopes: ["world", "client"] });
  return { professions: list, ranks, recipes, rules, known, gathering, nodes, gathered, harvested, cards, settings };
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
    if (k === "known") done.known = await unsetKey(p.known.map(a => a.uuid), "recipes");
    if (k === "gathering") done.gathering = await resetSettings(ID, ["gatherRules", "gatherReset"]) + await unsetKey(p.gathering.filter(x => "uuid" in x).map(x => /** @type {any} */ (x).uuid), "tier");
    if (k === "gathered") done.gathered = await unsetKey(p.gathered.map(a => a.uuid), "gathered");
    if (k === "harvested") done.harvested = await unsetKey(p.harvested.map(t => t.uuid), "harvested");
    if (k === "nodes") {
      let n = 0;
      for (const sc of new Set(p.nodes.map(x => x.scene))) {
        const ids = p.nodes.filter(x => x.scene === sc).map(x => x.id);
        try { await sc.deleteEmbeddedDocuments("Note", ids); n += ids.length; } catch (e) { console.warn(`${ID} | delete nodes`, e); }
      }
      done.nodes = n;
    }
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
