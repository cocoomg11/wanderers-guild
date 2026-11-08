/**
 * Recipes, pure (tested in Node: tests/recipes.test.mjs). A recipe is world data the GM writes in the setup window: what it makes
 * (an item UUID, with a snapshot of the item's name, picture, type, rarity and price taken when the GM saves it), which profession
 * makes it, the materials it uses (by item UUID or by name, with a quantity) and optional overrides for the rarity, the DC, the time
 * and the coin cost. Stored in the world setting `recipeBook` (`{ v, list }`) and always read through `normalizeRecipes`. Players
 * read it too (their Crafting window needs it), so nothing GM-only belongs in a recipe, notes included.
 *
 * A character's known recipes are a list of recipe ids in the actor flag `flags.wanderers-guild.recipes` (`{ v, ids }`), written
 * only by the active GM's client (a request from the player; see craft-leader.mjs) and read through `normalizeKnown`. A recipe
 * marked `auto` is known by every character who has its profession, without a flag.
 *
 * Nothing is shipped as content: a new world has no recipes until the GM writes or imports them.
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";
import { ID_RE, idFrom, uniqueId } from "./professions-model.mjs";
import { RARITY_KEYS } from "./ranks-model.mjs";

export const RECIPES_VERSION = 3;
/**
 * How a recipe is learned (0.4, `recipeBook` v2; v1 recipes read as "rank"): "rank" = a player learns it when their rank allows
 * (the Recipes page's Learn), "item" = only by using a recipe item that teaches it (or a GM teaching it), "gm" = only a GM teaches it.
 */
export const LEARN_ROUTES = Object.freeze(["rank", "item", "gm"]);
/** A world holds at most this many recipes. */
export const RECIPES_MAX = 300;
/** Materials one recipe uses. */
export const MATERIALS_MAX = 12;
/** Recipes one character knows (the flag's cap; auto recipes don't count). */
export const KNOWN_MAX = 200;
export const KNOWN_VERSION = 1;
export const RECIPE_NAME_MAX = 80;
export const GROUP_MAX = 40;
export const RECIPE_NOTES_MAX = 500;
/** Quantities (made, used). */
export const QTY_MAX = 999;
/** Overrides' ranges. */
export const DC_MIN = 1;
export const DC_MAX = 40;
export const HOURS_MAX = 100000;
export const COST_MAX = 10000000;
/** The JSON wrapper the Import / Export box reads and writes. */
export const RECIPES_FORMAT = "wanderers-guild.recipes";

/** A UUID as Foundry writes them: letters, digits, ".", "_", "-", with at least one ".". */
export const UUID_RE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;
/** The rarity override: "" = the item's own; "none" = treat as mundane; else a dnd5e rarity key. */
export const RARITY_OVERRIDES = Object.freeze(["", "none", ...RARITY_KEYS]);
/** dnd5e price denominations. */
export const DENOMINATIONS = Object.freeze(["pp", "gp", "ep", "sp", "cp"]);

/**
 * @typedef {{ value: number, denomination: string }} Price
 * @typedef {{ uuid: string, name: string, img: string, type: string, rarity: string, price: Price | null, qty: number }} RecipeResult
 * @typedef {{ uuid: string, name: string, img: string, qty: number }} Material
 * @typedef {{ qty: number, uuid: string, name: string, img: string, type: string, rarity: string }} Better `qty` extra results (0 =
 *   none) and/or a different item (`uuid` "" = the normal result); both empty = no better result for this recipe
 * @typedef {object} Recipe
 * @property {string} id
 * @property {string} name
 * @property {string} profession profession id ("" = not linked yet)
 * @property {string} group the section it is listed under ("" = by the item type)
 * @property {RecipeResult} result
 * @property {string} rarity override (RARITY_OVERRIDES)
 * @property {Material[]} materials
 * @property {number | null} dc
 * @property {number | null} hours
 * @property {number | null} cost in gold pieces
 * @property {boolean} auto known by everyone with the profession
 * @property {"rank" | "item" | "gm"} learn how it is learned (LEARN_ROUTES)
 * @property {Better} better the better result (0.5, `recipeBook` v3): what a roll of the DC plus the rules' margin makes
 * @property {string} notes shown to players
 * @typedef {{ v: number, list: Recipe[] }} RecipeBook
 * @typedef {{ v: number, ids: string[] }} Known
 */

/** One line of text: whitespace folded, trimmed, cut. @param {unknown} s @param {number} max */
const line = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** A whole number in range, or `dflt`. @param {unknown} v @param {number} min @param {number} max @param {number} dflt */
const int = (v, min, max, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== "" && v !== null ? Math.min(max, Math.max(min, n)) : dflt; };
/** A number in range, or null when empty or unreadable. @param {unknown} v @param {number} min @param {number} max */
export const optNum = (v, min, max) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
/** A UUID, or "". @param {unknown} v */
const uuid = v => { const s = String(v ?? "").trim(); return s.length <= 300 && UUID_RE.test(s) ? s : ""; };
/** A picture path (plain text, no markup), or "". @param {unknown} v */
const img = v => { const s = String(v ?? "").trim(); return s.length <= 500 && !/[<>"'`\s]/.test(s) ? s : ""; };

/** A price snapshot, or null. @param {unknown} raw @returns {Price | null} */
export function cleanPrice(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return null;
  const value = Number(o.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return { value: Math.min(value, COST_MAX * 1000), denomination: DENOMINATIONS.includes(o.denomination) ? o.denomination : "gp" };
}

/** @param {unknown} raw @returns {RecipeResult} */
function cleanResult(raw) {
  const o = /** @type {any} */ (raw) ?? {};
  return {
    uuid: uuid(o.uuid), name: line(o.name, RECIPE_NAME_MAX), img: img(o.img), type: line(o.type, 32).replace(/[^A-Za-z0-9]/g, ""),
    rarity: RARITY_KEYS.includes(o.rarity) ? o.rarity : "", price: cleanPrice(o.price), qty: int(o.qty, 1, QTY_MAX, 1)
  };
}

/** An empty better result. @returns {Better} */
export const noBetter = () => ({ qty: 0, uuid: "", name: "", img: "", type: "", rarity: "" });

/** The better result cleaned (0.5). @param {unknown} raw @returns {Better} */
export function cleanBetter(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return noBetter();
  const u = uuid(o.uuid);
  return {
    qty: int(o.qty, 0, QTY_MAX, 0), uuid: u, name: u ? line(o.name, RECIPE_NAME_MAX) : "", img: u ? img(o.img) : "",
    type: u ? line(o.type, 32).replace(/[^A-Za-z0-9]/g, "") : "", rarity: u && RARITY_KEYS.includes(o.rarity) ? o.rarity : ""
  };
}

/** Whether a recipe has a better result at all. @param {{ better?: Better }} r */
export const hasBetter = r => !!r.better && (r.better.qty > 0 || !!r.better.uuid);

/** One material, or null (neither a UUID nor a name). @param {unknown} raw @returns {Material | null} */
export function cleanMaterial(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return null;
  const m = { uuid: uuid(o.uuid), name: line(o.name, RECIPE_NAME_MAX), img: img(o.img), qty: int(o.qty, 1, QTY_MAX, 1) };
  return m.uuid || m.name ? m : null;
}

/**
 * One recipe cleaned, or null (no name and no result name). Bad numbers become null (no override); unknown rarity overrides
 * become ""; materials without a UUID or name are dropped (at most `MATERIALS_MAX`).
 * @param {unknown} raw
 * @returns {Recipe | null}
 */
export function cleanRecipe(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return null;
  const result = cleanResult(o.result);
  const name = line(o.name, RECIPE_NAME_MAX) || result.name;
  if (!name) return null;
  const materials = (Array.isArray(o.materials) ? o.materials : []).map(cleanMaterial).filter(/** @returns {m is Material} */ m => !!m).slice(0, MATERIALS_MAX);
  return {
    id: ID_RE.test(String(o.id ?? "")) ? String(o.id) : idFrom(name),
    name,
    profession: ID_RE.test(String(o.profession ?? "")) ? String(o.profession) : "",
    group: line(o.group, GROUP_MAX),
    result,
    rarity: RARITY_OVERRIDES.includes(o.rarity) ? o.rarity : "",
    materials,
    dc: (() => { const n = optNum(o.dc, DC_MIN, DC_MAX); return n === null ? null : Math.round(n); })(),
    hours: optNum(o.hours, 0, HOURS_MAX),
    cost: optNum(o.cost, 0, COST_MAX),
    auto: o.auto === true,
    learn: LEARN_ROUTES.includes(o.learn) ? o.learn : "rank",
    better: cleanBetter(o.better),
    notes: String(o.notes ?? "").replace(/\r\n?/g, "\n").trim().slice(0, RECIPE_NOTES_MAX)
  };
}

/**
 * Reads whatever is stored into the current shape: cleaned recipes in the stored order, ids made unique, at most `RECIPES_MAX`.
 * Never throws.
 * @type {(raw: unknown) => RecipeBook}
 */
export const normalizeRecipes = versioned({
  version: RECIPES_VERSION,
  empty: () => ({ v: RECIPES_VERSION, list: [] }),
  // v1 → v2: recipes gain `learn` (cleanRecipe reads a missing one as "rank"). v2 → v3: recipes gain `better` (missing = none).
  upgrades: { 1: s => s, 2: s => s },
  clean: s => {
    const taken = new Set();
    /** @type {Recipe[]} */
    const list = [];
    for (const raw of Array.isArray(s?.list) ? s.list : []) {
      if (list.length >= RECIPES_MAX) break;
      const r = cleanRecipe(raw);
      if (!r) continue;
      r.id = uniqueId(r.id, taken);
      taken.add(r.id);
      list.push(r);
    }
    return { v: RECIPES_VERSION, list };
  }
});

/** The rarity a recipe makes: its override, else the item's ("" = mundane). @param {Recipe} r */
export const recipeRarity = r => (r.rarity === "none" ? "" : r.rarity || r.result.rarity || "");

/**
 * The book with `r` put in (replacing the one with the same id, else added at the end). Returns `{ list, id }` or `{ error }`.
 * @param {unknown} stored
 * @param {unknown} r
 * @returns {{ list: RecipeBook, id: string, error?: undefined } | { error: string, list?: undefined, id?: undefined }}
 */
export function upsertRecipe(stored, r) {
  const s = normalizeRecipes(stored);
  const clean = cleanRecipe(r);
  if (!clean) return { error: "A recipe needs a name or a result item." };
  const givenId = ID_RE.test(String(/** @type {any} */ (r)?.id ?? "")) ? String(/** @type {any} */ (r).id) : "";
  const i = givenId ? s.list.findIndex(x => x.id === givenId) : -1;
  if (i >= 0) { s.list[i] = { ...clean, id: givenId }; return { list: s, id: givenId }; }
  if (s.list.length >= RECIPES_MAX) return { error: `A world holds at most ${RECIPES_MAX} recipes.` };
  const id = uniqueId(givenId || idFrom(clean.name), s.list.map(x => x.id));
  s.list.push({ ...clean, id });
  return { list: s, id };
}

/** The book without recipe `id`. @param {unknown} stored @param {string} id */
export function removeRecipe(stored, id) {
  const s = normalizeRecipes(stored);
  return { v: s.v, list: s.list.filter(x => x.id !== id) };
}

/** A profession's recipes, in the book's order. @param {RecipeBook} book @param {string} professionId */
export const recipesFor = (book, professionId) => book.list.filter(r => r.profession === professionId);

/**
 * The incoming recipes merged into the book: the same id replaces, a new id is added (until the cap). Returns the book and counts.
 * @param {unknown} stored
 * @param {unknown[]} incoming
 */
export function mergeRecipes(stored, incoming) {
  let s = normalizeRecipes(stored);
  let added = 0, replaced = 0, skipped = 0;
  for (const raw of incoming) {
    const before = s.list.length;
    const had = ID_RE.test(String(/** @type {any} */ (raw)?.id ?? "")) && s.list.some(x => x.id === /** @type {any} */ (raw).id);
    const r = upsertRecipe(s, raw);
    if (!r.list) { skipped += 1; continue; }
    s = r.list;
    if (had) replaced += 1; else if (s.list.length > before) added += 1;
  }
  return { list: s, added, replaced, skipped };
}

/** The Export box's text: the book as JSON with our format name. @param {unknown} stored */
export function exportRecipes(stored) {
  const s = normalizeRecipes(stored);
  return JSON.stringify({ format: RECIPES_FORMAT, v: s.v, list: s.list }, null, 2);
}

/**
 * Reads pasted JSON: our wrapper, a stored `{ v, list }` or a bare list. `{ ok, list, dropped }` (recipes that couldn't be read
 * are counted, not kept) or `{ ok: false, error }`. Never throws.
 * @param {unknown} text
 */
export function readRecipesImport(text) {
  let data;
  try { data = JSON.parse(String(text ?? "")); } catch { return { ok: false, error: "The text isn't JSON." }; }
  const d = /** @type {any} */ (data);
  if (d && typeof d === "object" && !Array.isArray(d) && d.format !== undefined && d.format !== RECIPES_FORMAT) return { ok: false, error: `This is a "${String(d.format).slice(0, 60)}" file, not recipes.` };
  if (d && typeof d === "object" && !Array.isArray(d) && Number.isInteger(d.v) && d.v > RECIPES_VERSION) return { ok: false, error: "These recipes come from a newer version of the module." };
  const raw = Array.isArray(d) ? d : Array.isArray(d?.list) ? d.list : null;
  if (!raw) return { ok: false, error: "No list of recipes found (expected { list: [...] } or [...])." };
  const list = raw.map(cleanRecipe).filter(/** @returns {r is Recipe} */ r => !!r);
  return { ok: true, list: list.slice(0, RECIPES_MAX), dropped: raw.length - Math.min(list.length, RECIPES_MAX) };
}

/**
 * Problems a GM should see (setup window, health check): recipes with no profession or one that doesn't exist, recipes with no
 * result item. Plain sentences.
 * @param {RecipeBook} book @param {Iterable<string>} professionIds
 */
export function recipeWarnings(book, professionIds) {
  const ids = new Set(professionIds);
  const out = [];
  const none = book.list.filter(r => !r.profession).map(r => r.name);
  const gone = book.list.filter(r => r.profession && !ids.has(r.profession)).map(r => r.name);
  const noItem = book.list.filter(r => !r.result.uuid).map(r => r.name);
  const few = (/** @type {string[]} */ n) => `${n.slice(0, 6).join(", ")}${n.length > 6 ? ", …" : ""}`;
  if (none.length) out.push(`No profession picked for: ${few(none)}.`);
  if (gone.length) out.push(`The profession no longer exists for: ${few(gone)}.`);
  if (noItem.length) out.push(`No result item for: ${few(noItem)} (crafting them makes nothing).`);
  const sameBetter = book.list.filter(r => r.better.uuid && r.better.uuid === r.result.uuid && r.better.qty === 0).map(r => r.name);
  if (sameBetter.length) out.push(`The better result is the normal item with no extra quantity for: ${few(sameBetter)} (a better roll changes nothing).`);
  // 0.5.1: allowed on purpose (rank is checked against the recipe's rarity only), but worth a look.
  const rank = (/** @type {string} */ k) => RARITY_KEYS.indexOf(/** @type {any} */ (k));
  const above = book.list.filter(r => r.better.uuid && r.better.rarity && rank(r.better.rarity) > rank(recipeRarity(r))).map(r => r.name);
  if (above.length) out.push(`The better result is rarer than the recipe for: ${few(above)} (allowed: a crafter's rank is checked against the recipe's rarity only, so a good roll can make a rarer item).`);
  return out;
}

/**
 * A character's known recipe ids, read from the actor flag: unique, well-formed, at most `KNOWN_MAX`. Never throws.
 * @type {(raw: unknown) => Known}
 */
export const normalizeKnown = versioned({
  version: KNOWN_VERSION,
  empty: () => ({ v: KNOWN_VERSION, ids: [] }),
  clean: k => ({ v: KNOWN_VERSION, ids: [...new Set((Array.isArray(k?.ids) ? k.ids : []).map(String).filter(id => ID_RE.test(id)))].slice(0, KNOWN_MAX) })
});

/** The flag with `id` added: `{ known, changed }` or `{ error }` (full). @param {unknown} stored @param {string} id */
export function learn(stored, id) {
  const k = normalizeKnown(stored);
  if (!ID_RE.test(id)) return { error: "Not a recipe id." };
  if (k.ids.includes(id)) return { known: k, changed: false };
  if (k.ids.length >= KNOWN_MAX) return { error: `A character knows at most ${KNOWN_MAX} recipes.` };
  return { known: { v: k.v, ids: [...k.ids, id] }, changed: true };
}

/** The flag without `id`. @param {unknown} stored @param {string} id */
export function forget(stored, id) {
  const k = normalizeKnown(stored);
  return { known: { v: k.v, ids: k.ids.filter(x => x !== id) }, changed: k.ids.includes(id) };
}

/** Whether a character knows a recipe (in the flag, or `auto`). @param {Recipe} r @param {Known} known */
export const knows = (r, known) => r.auto || known.ids.includes(r.id);
