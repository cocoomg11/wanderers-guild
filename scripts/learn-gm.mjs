/**
 * The GM's side of recipe items and bulk teaching (feature "crafting"), GM clicks only: marking a world item as a recipe item
 * (`flags.wanderers-guild.teaches`, dropped on the recipe editor's *Taught by item*), its keep / use-up choice, unmarking it,
 * *Make recipe item* (a new world loot item "Recipe: X") and *Teach to…* (one `learnRecipe` request per character, sent as the GM,
 * so the leader writes, posts the learn cards and fires the hook). This file writes only world items (the Items sidebar): never an
 * actor, never an embedded item (characters' copies are written by the leader in craft-leader.mjs). Every write stamps the flag's
 * `src` with the world item's own UUID (0.5.1): copies keep it, and the leader checks a player's copy against that world item. Untested in Node; the flag shape
 * and the item data are in learn-model.mjs.
 */
import { ID, TITLE } from "./const.mjs";
import { leader, log } from "./core.mjs";
import * as LM from "./learn-model.mjs";
import * as Data from "./data.mjs";

const gm = () => { if (game.user?.isGM) return true; ui.notifications.warn(`${TITLE}: GM only.`); return false; };
const escape = (/** @type {string} */ s) => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** A world item (Items sidebar) by UUID or id, or null. @param {string} ref */
function worldItem(ref) {
  const s = String(ref ?? "");
  const id = /^Item\.([A-Za-z0-9]{16})$/.exec(s)?.[1] ?? (/^[A-Za-z0-9]{16}$/.test(s) ? s : "");
  return id ? game.items?.get(id) ?? null : null;
}

/** World items that teach a recipe: [{ uuid, name, img, consume }]. @param {string} recipeId */
export function itemsTeaching(recipeId) {
  return (game.items?.contents ?? []).map((/** @type {any} */ it) => ({ it, t: LM.normalizeTeaches(it.flags?.[ID]?.teaches) }))
    .filter((/** @type {any} */ x) => x.t?.recipe === recipeId)
    .map((/** @type {any} */ x) => ({ uuid: x.it.uuid, name: x.it.name, img: x.it.img, consume: x.t.consume }));
}

/**
 * Marks a world item as teaching a recipe (an item dropped on *Taught by item*). Compendium items and characters' items are refused:
 * import the item first, then mark the world copy (copies made from it later carry the flag).
 * @param {string} uuid @param {string} recipeId
 */
export async function setTeaches(uuid, recipeId) {
  if (!gm()) return false;
  const item = worldItem(uuid);
  if (!item) { ui.notifications.warn(`${TITLE}: drop an item from the Items sidebar (import a compendium item first).`); return false; }
  if (!Data.recipes().list.some(r => r.id === recipeId)) { ui.notifications.warn(`${TITLE}: save the recipe first.`); return false; }
  const before = LM.normalizeTeaches(item.flags?.[ID]?.teaches);
  await item.setFlag(ID, "teaches", LM.teachesFlag(recipeId, before?.consume ?? true, item.uuid));
  log(`${item.name} teaches ${recipeId}`);
  return true;
}

/** Keep the item after learning (true) or use one up (false). @param {string} uuid @param {boolean} keep */
export async function setKeep(uuid, keep) {
  if (!gm()) return false;
  const item = worldItem(uuid); const t = LM.normalizeTeaches(item?.flags?.[ID]?.teaches);
  if (!item || !t) return false;
  await item.setFlag(ID, "teaches", LM.teachesFlag(t.recipe, !keep, item.uuid));
  return true;
}

/** The world item stops being a recipe item (the item stays). @param {string} uuid */
export async function clearTeaches(uuid) {
  if (!gm()) return false;
  const item = worldItem(uuid); if (!item?.flags?.[ID]?.teaches) return false;
  await item.unsetFlag(ID, "teaches");
  return true;
}

/** Creates the world loot item "Recipe: <name>" that teaches the recipe. Resolves to the item, or null. @param {string} recipeId */
export async function makeRecipeItem(recipeId) {
  if (!gm()) return null;
  const r = Data.recipes().list.find(x => x.id === recipeId);
  if (!r) { ui.notifications.warn(`${TITLE}: save the recipe first.`); return null; }
  const p = Data.professions().list.find(x => x.id === r.profession);
  const item = await Item.implementation.create(LM.recipeItemData(r, p?.name ?? "", escape, foundry.utils.randomID()), { keepId: true });
  if (item) ui.notifications.info(`${TITLE}: ${item.name} is in the Items sidebar. Put it in a merchant's stock, a loot pile or a character's inventory.`);
  return item ?? null;
}

/**
 * Teaches one recipe to several characters: one `learnRecipe` request each, as the GM (no rank checks; already known ones are
 * skipped by the leader). Resolves to how many requests were sent.
 * @param {string} recipeId @param {any[]} actors
 */
export async function teachTo(recipeId, actors) {
  if (!gm()) return 0;
  if (!Data.recipes().list.some(r => r.id === recipeId)) { ui.notifications.warn(`${TITLE}: no such recipe.`); return 0; }
  let n = 0;
  for (const a of actors) if (a?.uuid && leader.request("learnRecipe", { actor: a.uuid, recipe: recipeId })) n += 1;
  if (!n && actors.length) ui.notifications.warn(`${TITLE}: couldn't reach the writing GM client.`);
  return n;
}

/**
 * Stamps every world recipe item's flag with its own UUID as `src` (health fix; GM click). Resolves to how many were stamped.
 * @returns {Promise<number>}
 */
export async function stampSources() {
  if (!gm()) return 0;
  let n = 0;
  for (const item of game.items?.contents ?? []) {
    const t = LM.normalizeTeaches(item.flags?.[ID]?.teaches);
    if (!t || t.src === item.uuid) continue;
    await item.setFlag(ID, "teaches", LM.teachesFlag(t.recipe, t.consume, item.uuid));
    n += 1;
  }
  if (n) log(`stamped ${n} recipe item(s)`);
  return n;
}
