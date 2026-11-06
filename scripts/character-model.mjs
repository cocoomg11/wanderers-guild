/**
 * A character's professions, pure (tested in Node: tests/character.test.mjs). Nothing is stored on the actor: professions come from
 * the actor's prepared dnd5e tool proficiencies and the world's definitions, and the rank from its proficiency bonus, each time the
 * Professions window draws. `professions.mjs` gathers the plain facts from the actor (read only); this file decides.
 *
 * Proficiency per tool (dnd5e's multiplier): 0 none, 0.5 half, 1 proficient, 2 expertise. A profession is learned when the
 * character is proficient (1 or more) with any one of its tools. A profession with no tools needs none: everyone has it.
 */
import { normalizeProfessions, KINDS, ACTIONS, ACTION_ICONS, ICONS } from "./professions-model.mjs";
import { normalizeRanks, rankFor, ladder, nextRankText, rarityLabel, signed } from "./ranks-model.mjs";

/**
 * @typedef {object} CharacterFacts plain facts read from the actor's prepared data
 * @property {string} name
 * @property {string} [type] actor type
 * @property {number | null} [level] character level (characters only)
 * @property {number | null} pb proficiency bonus (`system.attributes.prof`)
 * @property {Record<string, number>} tools tool key → proficiency multiplier (0, 0.5, 1, 2)
 * @typedef {object} Labels the system's own labels (the window reads them from CONFIG.DND5E)
 * @property {Record<string, string>} [tools] tool key → label
 * @property {Record<string, { label: string, ability?: string }>} [skills] skill key → label and default ability
 * @property {Record<string, string>} [abilities] ability key → label
 * @property {Record<string, string>} [rarities] rarity key → label
 */

/** The word for a multiplier. @param {number} m */
export const profWord = m => (m >= 2 ? "expertise" : m >= 1 ? "proficient" : m > 0 ? "half proficiency" : "not proficient");
/** A mark class for the view: "e" expertise, "f" proficient, "h" half, "" none. @param {number} m */
export const profMark = m => (m >= 2 ? "e" : m >= 1 ? "f" : m > 0 ? "h" : "");

/**
 * The check line for a gathering action: "Wisdom (Survival)".
 * @param {string} skill @param {Labels} labels
 */
export function checkText(skill, labels = {}) {
  const s = labels.skills?.[skill];
  const name = s?.label || skill;
  const ab = s?.ability ? labels.abilities?.[s.ability] : "";
  return ab ? `${ab} (${name})` : name;
}

/**
 * Every profession of the world as this character has it, in the world's order.
 * @param {CharacterFacts} facts
 * @param {unknown} storedProfessions the `professionList` setting
 * @param {unknown} storedRanks the `rankTable` setting
 * @param {Labels} [labels]
 */
export function characterProfessions(facts, storedProfessions, storedRanks, labels = {}) {
  const defs = normalizeProfessions(storedProfessions).list;
  const table = normalizeRanks(storedRanks);
  const pb = Number.isFinite(Number(facts.pb)) && facts.pb !== null ? Number(facts.pb) : null;
  const rk = rankFor(pb, table);
  const rankText = rk.row ? `${rk.row.name} ${signed(rk.row.bonus)}` : pb === null ? "No rank" : `Below the first rank (${signed(pb)})`;
  const steps = ladder(pb, table, labels.rarities);
  const next = pb === null ? "" : nextRankText({ pb, level: facts.level }, table, labels.rarities);
  const craftsUpTo = rk.row?.rarity ? rarityLabel(rk.row.rarity, labels.rarities) : "";
  return defs.map(p => {
    const tools = p.tools.map(key => {
      const m = Number(facts.tools?.[key] ?? 0) || 0;
      return { key, label: labels.tools?.[key] || key, mult: m, word: profWord(m), mark: profMark(m) };
    });
    const best = tools.reduce((/** @type {typeof tools[number] | null} */ b, t) => (!b || t.mult > b.mult ? t : b), null);
    const noTool = p.tools.length === 0;
    const learned = noTool || (best?.mult ?? 0) >= 1;
    const gathers = p.actions.includes("gather");
    return {
      id: p.id, name: p.name, kind: p.kind, kindLabel: KINDS[p.kind].label, icon: ICONS[p.icon]?.d ?? ICONS.hammer.d, notes: p.notes,
      learned, noTool,
      tool: noTool ? { label: "No tool needed", mark: "", word: "" } : best && best.mult > 0 ? best : { ...tools[0], word: "not proficient" },
      tools,
      toolText: noTool ? "No tool needed" : tools.map(t => t.label).join(" or "),
      rank: learned ? rankText : "Not learned",
      ranked: learned && !!rk.row,
      ladder: steps,
      craftsUpTo: learned ? craftsUpTo : "",
      next: learned ? next : "",
      check: gathers ? checkText(p.check, labels) : "",
      actions: learned ? p.actions.map(a => ({ id: a, label: ACTIONS[a].label, icon: ACTION_ICONS[a] })) : []
    };
  });
}

/**
 * The window's whole model: the character line, the cards (learned crafting and gathering professions), the list (learned
 * secondary ones) and, when `showUnlearned`, the professions the character could learn with a tool proficiency.
 * @param {CharacterFacts} facts
 * @param {unknown} storedProfessions
 * @param {unknown} storedRanks
 * @param {{ labels?: Labels, showUnlearned?: boolean, isGM?: boolean }} [opts]
 */
export function professionsView(facts, storedProfessions, storedRanks, opts = {}) {
  const all = characterProfessions(facts, storedProfessions, storedRanks, opts.labels);
  const pb = facts.pb === null || facts.pb === undefined || !Number.isFinite(Number(facts.pb)) ? null : Number(facts.pb);
  const learned = all.filter(p => p.learned);
  return {
    name: String(facts.name ?? ""),
    level: facts.level ?? null,
    pbText: pb === null ? "" : signed(pb),
    subtitle: [facts.level ? `Level ${facts.level}` : "", pb === null ? "" : `Proficiency bonus ${signed(pb)}`].filter(Boolean).join(" · "),
    defined: all.length,
    cards: learned.filter(p => p.kind !== "secondary"),
    others: learned.filter(p => p.kind === "secondary"),
    unlearned: opts.showUnlearned ? all.filter(p => !p.learned) : [],
    hiddenUnlearned: opts.showUnlearned ? 0 : all.length - learned.length,
    isGM: !!opts.isGM
  };
}
