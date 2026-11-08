/**
 * Learning recipes, pure (tested in Node: tests/learn.test.mjs). One decision, `assessLearn(facts, recipe, via)`, for the Crafting
 * window (which buttons to show) and the active GM's client (whether to write), from the same plain facts. Three ways in:
 * - "rank": the player presses Learn; the recipe must be *Learned by: Rank*, the *Players learn recipes themselves* switch on, and
 *   the character must have the profession and a rank that allows the recipe's rarity.
 * - "item": the character uses a recipe item it carries (an item with `flags.wanderers-guild.teaches`); the item must teach this
 *   recipe, the recipe must not be *GM only*, and profession and rank apply as above. One item is used up unless it is set to keep.
 * - "gm": a GM teaches (Teach, Teach to…): no checks but the recipe existing.
 *
 * Recipe items: the item flag `teaches` (`{ v, recipe, consume, src }`) is set by a GM on a world item (learn-gm.mjs; `src` = that
 * world item's UUID); dnd5e and Item Piles copy flags with the item, so a copy bought from a merchant or handed out still teaches.
 * A player's carried copy teaches only when it points at a GM-authored source (`sourceRefs` → `verifyTeaches`, 0.5.1): a world item
 * or a compendium item no player can edit whose own flag teaches the same recipe; the source's `consume` wins. Also the Recipes page's row states, the Professions
 * window's recipe item rows, the health lines about recipe items and the data of a new recipe item.
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";
import { ID_RE } from "./professions-model.mjs";
import { recipeRarity, knows, LEARN_ROUTES } from "./recipes-model.mjs";
import { rankFor, signed } from "./ranks-model.mjs";
import { minRankFor, rankAllows } from "./craft-model.mjs";

export const TEACHES_VERSION = 1;
/** The routes' labels (setup window, Recipes page). */
export const ROUTE_LABELS = Object.freeze({ rank: "Rank (players learn it themselves)", item: "Recipe item (or a GM)", gm: "GM only" });
/** Where a learn came from (card, hook). */
export const SOURCES = Object.freeze(["rank", "item", "gm"]);
/** The picture of a recipe item made with *Make recipe item* (a Foundry core icon). */
export const RECIPE_ITEM_IMG = "icons/svg/book.svg";
export const LEARN_CARD_VERSION = 1;

/**
 * @typedef {{ v: number, recipe: string, consume: boolean, src: string }} Teaches
 * @typedef {import("./recipes-model.mjs").Recipe} Recipe
 * @typedef {object} LearnFacts plain facts about one character and the user asking
 * @property {boolean} isGM the user asking is a GM
 * @property {boolean} owns the user asking owns the character (GMs do)
 * @property {boolean} playersLearn the *Players learn recipes themselves* switch
 * @property {import("./professions-model.mjs").Profession[]} professions the world's definitions
 * @property {Record<string, number>} tools tool key → proficiency multiplier
 * @property {number | null} pb proficiency bonus
 * @property {import("./ranks-model.mjs").RankTable} ranks normalized
 * @property {import("./recipes-model.mjs").Known} known normalized
 * @property {{ teaches: Teaches | null, qty: number } | null} [item] the recipe item used ("item" only)
 */

/**
 * An item's `teaches` flag, or null when it teaches nothing readable. `consume` defaults to true (one item is used up).
 * @type {(raw: unknown) => Teaches | null}
 */
const readTeaches = versioned({
  version: TEACHES_VERSION,
  empty: () => ({ v: TEACHES_VERSION, recipe: "", consume: true, src: "" }),
  // A flag written without a version (by hand or a macro) reads as v1.
  upgrades: { 0: t => t },
  // `src` (0.5.1, optional, no version bump: missing = "") is the world item the GM marked.
  clean: t => ({ v: TEACHES_VERSION, recipe: ID_RE.test(String(t?.recipe ?? "")) ? String(t.recipe) : "", consume: t?.consume !== false, src: SOURCE_RE.test(String(t?.src ?? "")) ? String(t.src) : "" })
});
/** @param {unknown} raw @returns {Teaches | null} */
export const normalizeTeaches = raw => { const t = readTeaches(raw); return t && t.recipe ? t : null; };

/**
 * The flag a GM writes on a world item; `src` is that item's own UUID, so copies carry a pointer back to it.
 * @param {string} recipeId @param {boolean} [consume] @param {string} [src] @returns {Teaches}
 */
export const teachesFlag = (recipeId, consume = true, src = "") => ({ v: TEACHES_VERSION, recipe: recipeId, consume: !!consume, src: SOURCE_RE.test(String(src)) ? String(src) : "" });

/** A source a recipe item can name: a world item or a compendium item (never an item on an actor). */
export const SOURCE_RE = /^(?:Item\.[A-Za-z0-9]{16}|Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9]{16})$/;

/**
 * Where a source UUID lives: `{ kind: "world", id }`, `{ kind: "pack", pack: "<package>.<name>", id }`, or null.
 * @param {unknown} uuid @returns {{ kind: "world", id: string } | { kind: "pack", pack: string, id: string } | null}
 */
export function parseSource(uuid) {
  const u = String(uuid ?? "");
  if (!SOURCE_RE.test(u)) return null;
  const p = u.split(".");
  return p[0] === "Item" ? { kind: "world", id: p[1] } : { kind: "pack", pack: `${p[1]}.${p[2]}`, id: p[4] };
}

/**
 * The sources a carried item names, in the order they are tried: our flag's `src` (stamped by the GM's marking, copied with the
 * flags), then Foundry's `_stats.compendiumSource` and `_stats.duplicateSource`, then the legacy `flags.core.sourceId`. Only world
 * and compendium item UUIDs count; duplicates are dropped.
 * @param {any} source the carried item's source data (`item._source`) @returns {string[]}
 */
export function sourceRefs(source) {
  const s = source ?? {};
  const raw = [s.flags?.["wanderers-guild"]?.teaches?.src, s._stats?.compendiumSource, s._stats?.duplicateSource, s.flags?.core?.sourceId];
  return [...new Set(raw.map(x => String(x ?? "")).filter(x => SOURCE_RE.test(x)))];
}

/**
 * Whether a carried item's `teaches` flag is backed by a GM-authored source. `sources` maps each found source UUID to its own
 * (raw) `teaches` flag and whether it is trusted (no player can edit it); sources not found are simply absent. The first trusted
 * source teaching the same recipe wins and its flag is returned (so its *keep / use up* choice applies, not the copy's).
 * @param {Teaches | null} teaches the carried copy's flag, normalized
 * @param {string[]} refs from `sourceRefs`
 * @param {Map<string, { teaches: unknown, trusted: boolean }>} sources
 * @returns {{ ok: true, source: string, teaches: Teaches } | { ok: false, code: "noFlag" | "noSource" | "untrusted" | "mismatch", reason: string }}
 */
export function verifyTeaches(teaches, refs, sources) {
  if (!teaches) return { ok: false, code: "noFlag", reason: "it doesn't teach a recipe." };
  let untrusted = false; let mismatch = false;
  for (const ref of refs) {
    const s = sources.get(ref); if (!s) continue;
    const t = normalizeTeaches(s.teaches);
    if (!t || t.recipe !== teaches.recipe) { mismatch = true; continue; }
    if (!s.trusted) { untrusted = true; continue; }
    return { ok: true, source: ref, teaches: t };
  }
  if (untrusted) return { ok: false, code: "untrusted", reason: "the recipe item it was copied from can be edited by a player, so it can't vouch for it. Ask your GM." };
  if (mismatch) return { ok: false, code: "mismatch", reason: "it doesn't match the recipe item it was copied from. Ask your GM." };
  return { ok: false, code: "noSource", reason: "the recipe item it was copied from can't be found (the GM may have deleted or unmarked it). Ask your GM." };
}

/** Whether `itemUuid` names an item embedded directly on the actor `actorUuid` ("<actor>.Item.<id>"). @param {unknown} itemUuid @param {unknown} actorUuid */
export function itemOnActor(itemUuid, actorUuid) {
  const i = String(itemUuid ?? ""); const a = String(actorUuid ?? "");
  if (!a || !i.startsWith(`${a}.Item.`)) return false;
  return /^[A-Za-z0-9]{1,64}$/.test(i.slice(a.length + 6));
}

/** A recipe's route ("rank" for a recipe without one). @param {Recipe} r */
export const routeOf = r => (LEARN_ROUTES.includes(/** @type {any} */ (r?.learn)) ? r.learn : "rank");

/**
 * Whether this character may learn this recipe now, by this route.
 * @param {LearnFacts} f @param {Recipe | null | undefined} recipe @param {"rank" | "item" | "gm"} via
 * @returns {{ ok: boolean, code: string, reason: string, consume: boolean, need: import("./ranks-model.mjs").RankRow | null }}
 */
export function assessLearn(f, recipe, via) {
  const no = (/** @type {string} */ code, /** @type {string} */ reason, need = null) => ({ ok: false, code, reason, consume: false, need });
  if (!recipe) return no("missing", "That recipe no longer exists.");
  if (!SOURCES.includes(via)) return no("via", "Not a way to learn a recipe.");
  if (!f.owns && !f.isGM) return no("owner", "You don't own this character.");
  if (knows(recipe, f.known)) return no("known", recipe.auto ? `${recipe.name} is known by everyone with the profession.` : `Already knows ${recipe.name}.`);
  if (via === "gm") return f.isGM ? { ok: true, code: "ok", reason: "", consume: false, need: null } : no("gm", "Only a GM teaches recipes this way.");
  const route = routeOf(recipe);
  if (route === "gm") return no("gmOnly", `Only the GM teaches ${recipe.name}.`);
  if (via === "rank") {
    if (route === "item") return no("itemOnly", `${recipe.name} is learned from a recipe item.`);
    if (!f.playersLearn) return no("switch", "Only the GM teaches recipes in this world.");
  }
  /** @type {Teaches | null} */
  let teaches = null;
  if (via === "item") {
    teaches = normalizeTeaches(f.item?.teaches);
    if (!f.item || !teaches || teaches.recipe !== recipe.id) return no("noItem", `That item doesn't teach ${recipe.name}.`);
    if (!(Number(f.item.qty) > 0)) return no("noItem", "That recipe item is used up.");
  }
  const p = f.professions.find(x => x.id === recipe.profession) ?? null;
  if (!p) return no("profession", `${recipe.name}'s profession doesn't exist.`);
  const has = p.tools.length === 0 || p.tools.some(t => (Number(f.tools?.[t]) || 0) >= 1);
  if (!has) return no("profession", `Needs the ${p.name} profession.`);
  const rarity = recipeRarity(recipe);
  const row = rankFor(f.pb, f.ranks).row;
  if (!rankAllows(rarity, row)) {
    const need = minRankFor(rarity, f.ranks);
    return no("rank", need ? `${recipe.name} needs ${need.name} ${signed(need.bonus)}.` : `No rank can learn ${recipe.name}.`, /** @type {any} */ (need));
  }
  return { ok: true, code: "ok", reason: "", consume: via === "item" ? !!teaches?.consume : false, need: null };
}

/**
 * What using up one recipe item does: lower the stack, or delete the last one. Null when the item is kept.
 * @param {{ id: string, qty: number }} item @param {boolean} consume
 * @returns {{ update: { _id: string, "system.quantity": number } } | { delete: string } | null}
 */
export function useUpPlan(item, consume) {
  if (!consume) return null;
  const q = Math.floor(Number(item.qty) || 0);
  return q > 1 ? { update: { _id: item.id, "system.quantity": q - 1 } } : { delete: item.id };
}

/**
 * A row's state on the Crafting window's Recipes page, for the user looking:
 * "known", "learn" (the Learn button), "item" (Learn from item), "rank" (needs a higher rank), "needsItem", "gm" (ask your GM).
 * A GM sees "known" or "teach".
 * @param {{ knows: boolean, route: string, rankOk: boolean, playersLearn: boolean, hasItem: boolean, gm: boolean }} r
 */
export function learnState(r) {
  if (r.knows) return "known";
  if (r.gm) return "teach";
  if (r.route === "gm") return "gm";
  if (r.hasItem) return r.rankOk ? "item" : "rank";
  if (r.route === "item") return "needsItem";
  if (!r.playersLearn) return "gm";
  return r.rankOk ? "learn" : "rank";
}

/** The sections of the Recipes page, in order: [state keys, title]. @type {ReadonlyArray<[string[], string]>} */
export const LEARN_SECTIONS = Object.freeze([
  [["known"], "Known"],
  [["learn", "item", "teach"], "Can learn"],
  [["rank"], "Needs a higher rank"],
  [["needsItem"], "Needs a recipe item"],
  [["gm"], "Ask your GM"]
]);

/**
 * The rows a player sees. *Recipes not known yet* on Show: every row. On Hide: known recipes, plus (on the Recipes page) the ones a
 * recipe item they carry teaches (the item is already in their hands). A GM always sees every row.
 * @template {{ learnState: string, hasItem?: boolean }} T @param {T[]} rows @param {{ gm: boolean, hide: boolean, craft?: boolean }} o
 *   `craft`: the Craft page (known recipes only under Hide)
 */
export function visibleRows(rows, o) {
  if (o.gm || !o.hide) return rows;
  return rows.filter(r => r.learnState === "known" || (!o.craft && !!r.hasItem));
}

/**
 * The Professions window's (and toolkit page's) *Recipe items* rows: each carried recipe item, the recipe it teaches and what the
 * button does.
 * @param {Array<{ uuid: string, name: string, img: string, qty: number, teaches: unknown }>} items carried items with our flag
 * @param {Recipe[]} recipes the world's recipes
 * @param {LearnFacts} f facts for this character (`item` is filled per row)
 * @returns {Array<{ uuid: string, name: string, img: string, recipe: string, profession: string, ok: boolean, text: string, consume: boolean }>}
 */
export function recipeItemRows(items, recipes, f) {
  return items.map(it => {
    const t = normalizeTeaches(it.teaches);
    const r = t ? recipes.find(x => x.id === t.recipe) ?? null : null;
    const a = assessLearn({ ...f, item: { teaches: t, qty: it.qty } }, r, "item");
    const text = a.ok ? (a.consume ? "Learning uses this item up." : "The item is kept after learning.")
      : a.code === "rank" && a.need ? `needs ${a.need.name} ${signed(a.need.bonus)}` : a.reason;
    return { uuid: it.uuid, name: it.name, img: it.img, recipe: r?.name ?? "", profession: r?.profession ?? "", ok: a.ok, text, consume: a.consume };
  });
}

/**
 * Health lines about recipe items: items whose recipe is gone (warn), recipes learned only from an item that no item teaches (warn),
 * items teaching a GM-only recipe (warn: they can't teach it), and a count (info). `items` = world items and characters' items.
 * @param {Recipe[]} recipes @param {Array<{ uuid?: string, name: string, teaches: unknown, where: string }>} items
 * @returns {Array<{ level: "warn" | "info" | "ok", text: string }>}
 */
export function recipeItemLines(recipes, items) {
  const few = (/** @type {string[]} */ n) => `${[...new Set(n)].slice(0, 6).join(", ")}${new Set(n).size > 6 ? ", …" : ""}`;
  const ids = new Map(recipes.map(r => [r.id, r]));
  const read = items.map(i => ({ ...i, t: normalizeTeaches(i.teaches) })).filter(i => i.t);
  /** @type {Array<{ level: "warn" | "info" | "ok", text: string }>} */
  const out = [];
  const gone = read.filter(i => !ids.has(/** @type {Teaches} */ (i.t).recipe));
  if (gone.length) out.push({ level: "warn", text: `Recipe items teaching a recipe that no longer exists: ${few(gone.map(i => `${i.name} (${i.where})`))}.` });
  const gmOnly = read.filter(i => routeOf(/** @type {Recipe} */ (ids.get(/** @type {Teaches} */ (i.t).recipe))) === "gm" && ids.has(/** @type {Teaches} */ (i.t).recipe));
  if (gmOnly.length) out.push({ level: "warn", text: `Recipe items teaching a GM-only recipe (they can't be used): ${few(gmOnly.map(i => i.name))}.` });
  const taught = new Set(read.map(i => /** @type {Teaches} */ (i.t).recipe));
  const orphan = recipes.filter(r => routeOf(r) === "item" && !r.auto && !taught.has(r.id)).map(r => r.name);
  if (orphan.length) out.push({ level: "warn", text: `Learned by a recipe item, but no item teaches: ${few(orphan)} (setup › Recipes › Make recipe item, or a GM teaches them).` });
  const world = read.filter(i => i.where === "world").length;
  out.push({ level: "info", text: read.length ? `Recipe items: ${read.length} (${world} in the Items sidebar, ${read.length - world} carried).` : "No recipe items yet." });
  return out;
}

/**
 * World recipe items whose flag doesn't name the item itself as its `src` (marked before 0.5.1, or moved): copies made from them
 * can only be checked through Foundry's own source fields until a GM stamps them (health fix).
 * @param {Array<{ uuid?: string, name: string, teaches: unknown, where: string }>} items
 * @returns {Array<{ uuid: string, name: string }>}
 */
export function unstampedItems(items) {
  return items.filter(i => i.where === "world" && i.uuid && normalizeTeaches(i.teaches) && normalizeTeaches(i.teaches)?.src !== i.uuid)
    .map(i => ({ uuid: String(i.uuid), name: i.name }));
}

/**
 * The world item *Make recipe item* creates: a loot item named "Recipe: <name>" with the recipe's rarity and our flag.
 * @param {Recipe} r @param {string} [professionName] @param {(s: string) => string} [escape] @param {string} [id] the new item's
 * id (created with `keepId`), so the flag's `src` can name it
 */
export function recipeItemData(r, professionName = "", escape = s => s, id = "") {
  const rarity = recipeRarity(r);
  const own = /^[A-Za-z0-9]{16}$/.test(id) ? id : "";
  return {
    ...(own ? { _id: own } : {}),
    name: `Recipe: ${r.name}`.slice(0, 120), type: "loot", img: RECIPE_ITEM_IMG,
    system: { ...(rarity ? { rarity } : {}), description: { value: `<p>Teaches the recipe <b>${escape(r.name)}</b>${professionName ? ` (${escape(professionName)})` : ""}. Use it from the Crafting window's Recipes page.</p>` } },
    flags: { "wanderers-guild": { teaches: teachesFlag(r.id, true, own ? `Item.${own}` : "") } }
  };
}

/** The learn card's flag. @param {string} actorUuid @param {string} recipeId @param {"rank" | "item" | "gm"} source */
export const learnCardFlag = (actorUuid, recipeId, source) => ({ v: LEARN_CARD_VERSION, actor: actorUuid, recipe: recipeId, source, at: Date.now() });

/** The `wanderers-guild.learned` hook payload (ids only). @param {string} actorId @param {string} recipeId @param {string} source */
export const learnedPayload = (actorId, recipeId, source) => ({ actorId, recipeId, source: SOURCES.includes(source) ? source : "gm" });
