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
import { splitBonus } from "./roll-model.mjs";

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

/** The world's creature types, sorted by label: [{ key, label }] (CONFIG.DND5E.creatureTypes). */
export function creatureTypeChoices() {
  return Object.entries(D().creatureTypes ?? {}).map(([key, t]) => ({ key, label: loc(/** @type {any} */ (t)?.label ?? t ?? key) }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n?.lang));
}

/** A skill key's label with its ability ("Wisdom (Survival)"), or the key. @param {string} key */
export function skillCheckText(key) {
  const s = D().skills?.[key]; if (!s) return key;
  const ab = D().abilities?.[s.ability]?.label;
  return ab ? `${loc(ab)} (${loc(s.label)})` : loc(s.label);
}

/**
 * A creature's plain facts for harvesting (prepared data, read only): name, creature type key, CR, defeated (HP 0 or the dead
 * status), whether it is an NPC.
 * @param {any} actor
 */
export function creatureFacts(actor) {
  const sys = actor?.system ?? {};
  const hp = Number(sys.attributes?.hp?.value);
  const cr = Number(sys.details?.cr);
  const dead = (Number.isFinite(hp) && hp <= 0) || !!actor?.statuses?.has?.("dead");
  return { name: String(actor?.name ?? ""), type: String(sys.details?.type?.value ?? ""), cr: Number.isFinite(cr) ? cr : null, dead, npc: actor?.type === "npc" };
}

/**
 * Plain facts from a check's chat message for `verifyRoll` (roll-model.mjs). dnd5e 6.0.6: the message's `rolls[0]` is a D20Roll
 * whose first term is the d20; Foundry's `Roll#dice` lists every die term (nested ones in brackets too) with `number`, `faces`
 * and `results` ({ result, active }); a skill or tool check message (`type: "check"`) has `system.ability`, `system.skill`,
 * `system.tool` (the roll dialog writes a changed ability there).
 * @param {any} msg
 * @returns {import("./roll-model.mjs").RollFacts | null}
 */
export function rollFacts(msg) {
  const roll = msg?.rolls?.[0];
  if (!roll) return null;
  const dice = (Array.isArray(roll.dice) ? roll.dice : []).map((/** @type {any} */ d) => ({
    number: Number(d?.number),
    faces: Number(d?.faces),
    results: (Array.isArray(d?.results) ? d.results : []).map((/** @type {any} */ r) => ({ result: Number(r?.result), active: r?.active !== false }))
  }));
  const sys = msg.system ?? {};
  const s = (/** @type {unknown} */ v) => (typeof v === "string" && v ? v : null);
  return { total: Number(roll.total), dice, skill: s(sys.skill), tool: s(sys.tool), ability: s(sys.ability) };
}

/** A deterministic part of a bonus formula as a number (like dnd5e's `simplifyBonus`), else null. @param {string} part */
function flatOf(part) {
  try {
    const R = /** @type {any} */ (globalThis).Roll;
    const roll = new R(part);
    return roll.isDeterministic ? Number(roll.evaluateSync().total) : null;
  } catch { return null; }
}

/**
 * The character's own bonus for a skill or tool check, worked out on the leader the way dnd5e 6.0.6's `Actor5e#_buildSkillToolConfig`
 * builds the roll (default ability, no dialog changes): `@mod` (the ability's `mod`), `@prof` (`CommonTemplate
 * .calculateSkillToolProficiency(actor, ability, { skill | tool })`, its `term` when `hasProficiency`), `@ruleBonus` (
 * `D20RollModificationField.combineFields(actor.system, ["abilities.<a>.check.roll", "rolls.ability.check",
 * "rolls.ability.<skill|tool>", "<skills|tools>.<key>.roll"], { rules: { category: "check", actor, rollData } }).bonus`: the
 * `roll.bonus` fields effects write (dnd5e's shim maps the old `system.skills.<s>.bonuses.check` keys of e.g. Guidance and
 * `system.bonuses.abilities.check` / `.skill` there) plus the check / d20 bonus rules) and the condition reductions
 * (`conditionRollReductions`). The bonus formula is resolved with `replaceFormulaData` against the actor's roll data with `roll`
 * set as dnd5e sets it, then split into a flat part and dice terms (`splitBonus`). Proficiency dice and a formula that isn't plain
 * dice and numbers give `problem`. Falls back to the prepared `total` (no dice) when those dnd5e parts are missing.
 * @param {any} actor @param {"skill" | "tool"} kind @param {string} key
 * @returns {{ bonus: number | null, ability: string | null, dice: import("./roll-model.mjs").BonusDie[], problem: string | null }}
 */
export function checkBonus(actor, kind, key) {
  const e = kind === "tool" ? actor?.system?.tools?.[key] : actor?.system?.skills?.[key];
  const ability = typeof e?.ability === "string" && e.ability ? e.ability : null;
  const t = Number(e?.total);
  const fallback = { bonus: e && Number.isFinite(t) ? t : null, ability, dice: [], problem: null };
  if (!e || !ability) return fallback;
  const sys5e = /** @type {any} */ (globalThis).dnd5e;
  const Mod = sys5e?.dataModels?.shared?.D20RollModificationField;
  const Common = sys5e?.dataModels?.actor?.CommonTemplate;
  if (typeof Mod?.combineFields !== "function" || typeof Common?.calculateSkillToolProficiency !== "function") return fallback;
  try {
    const prof = Common.calculateSkillToolProficiency(actor, ability, { [kind]: key });
    let flat = Number(actor.system.abilities?.[ability]?.mod ?? 0) || 0;
    if (prof?.hasProficiency) {
      const term = String(prof.term ?? "");
      if (!/^-?\d+$/.test(term.trim())) return { ...fallback, problem: "The character uses proficiency dice, which can't be checked." };
      flat += Number(term);
    }
    const rollData = actor.getRollData({ roll: true });
    rollData.roll = { ability, proficient: (prof?.multiplier ?? 0) >= 1, [kind]: key, type: kind };
    const { bonus } = Mod.combineFields(actor.system, [
      `abilities.${ability}.check.roll`, "rolls.ability.check", `rolls.ability.${kind}`, `${kind}s.${key}.roll`
    ], { rules: { category: "check", actor, rollData } });
    const R = /** @type {any} */ (globalThis).CONFIG?.Dice?.BasicRoll ?? /** @type {any} */ (globalThis).Roll;
    const formula = bonus ? String(R.replaceFormulaData(String(bonus), rollData)) : "";
    const split = splitBonus(formula, flatOf);
    if (!split.ok) return { ...fallback, problem: `The character's check bonus (${split.part}) isn't plain dice and numbers, so it can't be checked.` };
    flat += split.flat;
    for (const r of Object.values(actor.conditionRollReductions ?? {})) flat += Number(r) || 0;
    return { bonus: flat, ability, dice: split.dice, problem: null };
  } catch { return fallback; }
}
