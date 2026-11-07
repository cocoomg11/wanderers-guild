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
 */
export function assessIn(ctx, recipe, helpers = 0) {
  const profession = ctx.professions.find(p => p.id === recipe.profession) ?? null;
  return assess({ ...ctx, recipe, profession, helpers });
}

/** The section a recipe is listed under: its own, else its item type. @param {import("./recipes-model.mjs").Recipe} r */
export const groupOf = r => r.group || D5.typeLabel(r.result.type) || "Recipes";

/** Re-exported for the window's sort. */
export { recipeRarity };
