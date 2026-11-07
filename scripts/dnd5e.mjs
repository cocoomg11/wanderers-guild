/**
 * Everything read from the dnd5e system, in one place: the world's tool and skill lists with their labels, rarity labels, and a
 * character's plain facts (proficiency bonus, level, tool proficiencies) from its prepared data. Read only: nothing here writes.
 * Untested in Node (needs dnd5e loaded); the decisions are in character-model.mjs.
 *
 * dnd5e 6.x: `CONFIG.DND5E.tools` (key → { ability, id }), labels from `dnd5e.documents.Trait.keyLabel(key, { trait: "tool" })`;
 * an actor's `system.tools[key]` has `value` (0, 0.5, 1, 2) and a prepared `prof` (Proficiency, `multiplier`);
 * `system.attributes.prof` is the proficiency bonus; `system.details.level` the character level.
 */
import { SYSTEM_ID } from "./const.mjs";

const loc = (/** @type {unknown} */ s) => { const t = String(s ?? ""); try { return game.i18n?.localize?.(t) ?? t; } catch { return t; } };
const D = () => /** @type {any} */ (globalThis).CONFIG?.DND5E ?? {};

/** Whether the world runs dnd5e. */
export const isDnd5e = () => game.system?.id === SYSTEM_ID;

/** A tool key's label, or the key. @param {string} key */
export function toolLabel(key) {
  try {
    const Trait = /** @type {any} */ (globalThis).dnd5e?.documents?.Trait;
    const l = Trait?.keyLabel?.(key, { trait: "tool" });
    if (typeof l === "string" && l) return l;
  } catch { /* fall through */ }
  return loc(D().tools?.[key]?.label ?? key);
}

/** The world's tools, sorted by label: [{ key, label }]. */
export function toolChoices() {
  const keys = Object.keys(D().tools ?? {});
  return keys.map(key => ({ key, label: toolLabel(key) })).sort((a, b) => a.label.localeCompare(b.label, game.i18n?.lang));
}

/** The world's skills, sorted by label: [{ key, label }]. */
export function skillChoices() {
  return Object.entries(D().skills ?? {}).map(([key, s]) => ({ key, label: loc(/** @type {any} */ (s)?.label ?? key) }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n?.lang));
}

/** The world's rarities in dnd5e's order (CONFIG.DND5E.itemRarity), as { key: label }. */
export function rarityLabels() {
  return Object.fromEntries(Object.entries(D().itemRarity ?? {}).map(([k, v]) => [k, loc(v)]));
}

/** Every label the character model needs. @returns {import("./character-model.mjs").Labels} */
export function labels() {
  const d = D();
  return {
    tools: Object.fromEntries(toolChoices().map(t => [t.key, t.label])),
    skills: Object.fromEntries(Object.entries(d.skills ?? {}).map(([k, s]) => [k, { label: loc(/** @type {any} */ (s)?.label ?? k), ability: /** @type {any} */ (s)?.ability }])),
    abilities: Object.fromEntries(Object.entries(d.abilities ?? {}).map(([k, a]) => [k, loc(/** @type {any} */ (a)?.label ?? k)])),
    rarities: rarityLabels()
  };
}

/** Actor types that have professions. */
export const TYPES = Object.freeze(["character", "npc"]);

/**
 * A character's plain facts from its prepared data.
 * @param {any} actor
 * @returns {import("./character-model.mjs").CharacterFacts}
 */
export function facts(actor) {
  const sys = actor?.system ?? {};
  /** @type {Record<string, number>} */
  const tools = {};
  for (const [key, t] of Object.entries(sys.tools ?? {})) {
    const e = /** @type {any} */ (t);
    const m = Number(e?.prof?.multiplier ?? e?.value ?? 0);
    tools[key] = Number.isFinite(m) ? m : 0;
  }
  const pb = Number(sys.attributes?.prof);
  const level = actor?.type === "character" ? Number(sys.details?.level) : NaN;
  return { name: actor?.name ?? "", type: actor?.type, level: Number.isFinite(level) && level > 0 ? level : null, pb: Number.isFinite(pb) ? pb : null, tools };
}

/** Item types that are carried in an inventory (and can be materials or results). */
export const PHYSICAL = Object.freeze(["weapon", "equipment", "consumable", "tool", "loot", "container"]);

/**
 * The character's carried items as plain facts for the craft model: [{ id, name, qty, type, sources }]. `sources` holds the item's
 * own UUID and where it came from (`_stats.compendiumSource`, `_stats.duplicateSource`, the older `flags.core.sourceId`).
 * @param {any} actor
 * @returns {import("./craft-model.mjs").InvItem[]}
 */
export function inventory(actor) {
  const out = [];
  for (const it of actor?.items ?? []) {
    if (!PHYSICAL.includes(it.type)) continue;
    const st = it._stats ?? {};
    const sources = [it.uuid, st.compendiumSource, st.duplicateSource, it.flags?.core?.sourceId].filter(s => typeof s === "string" && s);
    const q = Number(it.system?.quantity);
    out.push({ id: it.id, name: String(it.name ?? ""), qty: Number.isFinite(q) ? q : 1, type: it.type, sources });
  }
  return out;
}

/**
 * The world's coin values in its smallest coin, from CONFIG.DND5E.currencies (the Wanderer's Toolkit's three-coin economy changes
 * them): { pp, gp, ep, sp, cp }. Falls back to the standard values.
 * @returns {Record<string, number>}
 */
export function coinValues() {
  try {
    const list = Object.entries(D().currencies ?? {}).filter(([, c]) => Number(/** @type {any} */ (c)?.conversion) > 0);
    if (!list.length) throw new Error("no currencies");
    const base = Math.max(...list.map(([, c]) => Number(/** @type {any} */ (c).conversion)));
    return Object.fromEntries(list.map(([k, c]) => [k, Math.round(base / Number(/** @type {any} */ (c).conversion))]));
  } catch { return { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }; }
}

/** The actor's tool check bonus as text ("+5"), from prepared data, or "". @param {any} actor @param {string} key */
export function toolTotal(actor, key) {
  const t = Number(actor?.system?.tools?.[key]?.total);
  return Number.isFinite(t) ? (t < 0 ? `−${Math.abs(t)}` : `+${t}`) : "";
}

/** A dnd5e item type's label. @param {string} type */
export function typeLabel(type) {
  const k = /** @type {any} */ (globalThis).CONFIG?.Item?.typeLabels?.[type];
  return k ? loc(k) : type ? type[0].toUpperCase() + type.slice(1) : "";
}

/**
 * What a recipe keeps of its result item: name, picture, type, rarity and price (read from the item when the GM saves).
 * @param {any} doc an Item (or a compendium index entry, which has name, img and type only)
 */
export function itemSnapshot(doc) {
  const sys = doc?.system ?? {};
  const price = sys.price && typeof sys.price === "object" ? { value: Number(sys.price.value) || 0, denomination: String(sys.price.denomination || "gp") } : null;
  return { uuid: String(doc?.uuid ?? ""), name: String(doc?.name ?? ""), img: String(doc?.img ?? ""), type: String(doc?.type ?? ""), rarity: String(sys.rarity ?? ""), price };
}
