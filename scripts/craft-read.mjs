/**
 * Gathers the plain facts `assess()` needs for one actor (read only), so the Crafting window and the active GM's client decide from
 * the same data: the definitions, ranks, rules and recipes (world settings), the actor's prepared tools and proficiency bonus, known
 * recipes (our flag), carried items and coin. Untested in Node (reads documents); the decision is in craft-model.mjs.
 */
import { assess } from "./craft-model.mjs";
import { recipeRarity } from "./recipes-model.mjs";
import * as Data from "./data.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Eco from "./economy.mjs";
import { ID } from "./const.mjs";
import { S } from "./core.mjs";

/** Everything about one actor that every recipe's assessment shares. @param {any} actor */
export function context(actor) {
  const labels = D5.labels();
  return {
    professions: Data.professions().list, rules: Data.rules(), ranks: Data.ranks(), book: Data.recipes(),
    facts: D5.facts(actor), known: Data.known(actor), inventory: D5.inventory(actor), purse: Eco.purse(actor),
    values: Eco.values(), worldValues: D5.coinValues(), rarityLabels: labels.rarities ?? {}, toolLabels: labels.tools ?? {}
  };
}

/**
 * One recipe assessed in a context.
 * @param {ReturnType<typeof context>} ctx @param {import("./recipes-model.mjs").Recipe} recipe @param {number} [helpers]
 * @param {number} [batch] how many in one go (clamped to the rules' batchMax inside `assess`)
 */
export function assessIn(ctx, recipe, helpers = 0, batch = 1) {
  const profession = ctx.professions.find(p => p.id === recipe.profession) ?? null;
  return assess({ ...ctx, recipe, profession, helpers, batch });
}

/** The section a recipe is listed under: its own, else its item type. @param {import("./recipes-model.mjs").Recipe} r */
export const groupOf = r => r.group || D5.typeLabel(r.result.type) || "Recipes";

/** Re-exported for the window's sort. */
export { recipeRarity };

/**
 * The recipe items an actor carries (items with our `teaches` flag): [{ id, uuid, name, img, qty, teaches }]. Read only.
 * @param {any} actor
 */
export function recipeItems(actor) {
  const out = [];
  for (const it of actor?.items ?? []) {
    const t = it.flags?.[ID]?.teaches; if (!t) continue;
    const q = Number(it.system?.quantity);
    out.push({ id: String(it.id), uuid: String(it.uuid), name: String(it.name ?? ""), img: String(it.img ?? ""), qty: Number.isFinite(q) ? q : 1, teaches: t });
  }
  return out;
}

/**
 * The plain facts `assessLearn()` needs for one actor and the user asking (learn-model.mjs), shared by the window and the leader.
 * @param {any} actor @param {any} user
 * @returns {import("./learn-model.mjs").LearnFacts}
 */
export function learnFacts(actor, user) {
  const f = D5.facts(actor);
  return {
    isGM: !!user?.isGM, owns: !!user?.isGM || !!actor?.testUserPermission?.(user, "OWNER"), playersLearn: !!S.get("playersLearn"),
    professions: Data.professions().list, tools: f.tools, pb: f.pb, ranks: Data.ranks(), known: Data.known(actor)
  };
}
