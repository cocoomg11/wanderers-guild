/**
 * Crafting rules and the crafting decision, pure (tested in Node: tests/craft.test.mjs).
 *
 * **Rules are world data.** Every number crafting uses (time per value of the item, the material cost as a share of the price, the
 * time, cost and DC per rarity, the consumable modifier, helpers, a time change per rank, a base DC) lives in the world setting
 * `craftRules`, edited on the setup window's Crafting rules page or pasted as JSON. Nothing from any published rulebook ships here:
 * the defaults are empty ("not set") or neutral (100 %, no helpers, materials kept on a failure), and the GM fills them in from the
 * rules their table uses. A craft with no DC at all goes to the GM to decide.
 *
 * **Time is for reference.** The time a craft takes is shown to the player and the GM; nothing here (or anywhere in the module)
 * advances the world's clock.
 *
 * **Money** is a whole number of the smallest coin. `BOOK_VALUES` are the standard dnd5e coin values (1 gp = 100 cp), used when the
 * prices show "book values"; the world's own values come from CONFIG.DND5E.currencies (dnd5e.mjs `coinValues()`), which the
 * Wanderer's Toolkit changes for its three-coin economy. A gold-piece figure (a recipe's cost, the rarity table's cost) means gold
 * pieces of the economy in use.
 *
 * `assess()` is the one decision both the Crafting window (to show what's missing) and the active GM's client (to accept a craft)
 * run, from plain facts.
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";
import { RARITY_KEYS, rankFor, rarityLabel, signed } from "./ranks-model.mjs";
import { recipeRarity, knows, optNum, DC_MIN, DC_MAX, HOURS_MAX, COST_MAX } from "./recipes-model.mjs";

export const RULES_VERSION = 1;
export const RULES_FORMAT = "wanderers-guild.craftRules";
export const PCT_MAX = 1000;
export const HELPERS_MAX = 20;
export const DAY_HOURS_MAX = 24;
/** How long a tool check roll stays usable for a craft. */
export const ROLL_MAX_AGE_MS = 10 * 60 * 1000;

/** What happens to the materials (and the coin cost) on a failed check. */
export const FAIL_RULES = Object.freeze({ keep: "Kept: nothing is used up", lose: "Used up: the materials (and any coin cost) are spent" });
/** How a time from the price is rounded. */
export const ROUNDING = Object.freeze({ none: "Not rounded", hour: "Up to a whole hour", day: "Up to a whole working day" });

/** Standard dnd5e coin values in copper ("book values"). */
export const BOOK_VALUES = Object.freeze({ pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 });

/**
 * @typedef {{ hours: number | null, cost: number | null, dc: number | null }} RarityRule
 * @typedef {object} CraftRules
 * @property {number} v
 * @property {number | null} timeHours hours of work …
 * @property {number | null} timePerGp … per this many gold pieces of the item's price
 * @property {keyof typeof ROUNDING} rounding
 * @property {number | null} hoursPerDay a working day, for "days" in the time text and the "day" rounding
 * @property {number | null} materialPct coin cost as a percentage of the item's price
 * @property {Record<string, RarityRule>} byRarity magic items: time, cost and DC by rarity
 * @property {number} consumablePct consumables' share of the rarity table's time and cost
 * @property {number | null} dc the DC when neither the recipe nor the rarity table sets one
 * @property {number} helpersMax
 * @property {boolean} helperDivides each helper divides the time
 * @property {keyof typeof FAIL_RULES} failMaterials
 * @property {boolean} chargeCoin take the coin cost from the crafter
 * @property {Record<string, number>} rankTime rank bonus → time percentage
 */

/** A fresh rules object: nothing set. @returns {CraftRules} */
export const defaultRules = () => ({
  v: RULES_VERSION, timeHours: null, timePerGp: null, rounding: "hour", hoursPerDay: null, materialPct: null,
  byRarity: Object.fromEntries(RARITY_KEYS.map(k => [k, { hours: null, cost: null, dc: null }])),
  consumablePct: 100, dc: null, helpersMax: 0, helperDivides: false, failMaterials: "keep", chargeCoin: false, rankTime: {}
});

/** @param {unknown} v */
const dcOf = v => { const n = optNum(v, DC_MIN, DC_MAX); return n === null ? null : Math.round(n); };
/** @param {unknown} v @param {number} min @param {number} max @param {number} dflt */
const intOr = (v, min, max, dflt) => { const n = optNum(v, min, max); return n === null ? dflt : Math.round(n); };

/**
 * Reads whatever is stored into the current shape. Unreadable numbers become "not set" (null); a time rule needs both numbers.
 * Never throws.
 * @type {(raw: unknown) => CraftRules}
 */
export const normalizeRules = versioned({
  version: RULES_VERSION,
  empty: defaultRules,
  clean: o => {
    const d = defaultRules();
    const byRarity = Object.fromEntries(RARITY_KEYS.map(k => {
      const r = o?.byRarity?.[k] ?? {};
      return [k, { hours: optNum(r.hours, 0, HOURS_MAX), cost: optNum(r.cost, 0, COST_MAX), dc: dcOf(r.dc) }];
    }));
    /** @type {Record<string, number>} */
    const rankTime = {};
    for (const [b, pct] of Object.entries(o?.rankTime ?? {})) {
      const bonus = Math.round(Number(b)); const p = optNum(pct, 1, PCT_MAX);
      if (Number.isInteger(bonus) && bonus >= 1 && bonus <= 20 && p !== null && p !== 100) rankTime[String(bonus)] = p;
    }
    const timeHours = optNum(o?.timeHours, 0, HOURS_MAX);
    const timePerGp = optNum(o?.timePerGp, 0, COST_MAX) || null;
    return {
      v: RULES_VERSION, timeHours, timePerGp,
      rounding: Object.hasOwn(ROUNDING, o?.rounding) ? o.rounding : d.rounding,
      hoursPerDay: (() => { const n = optNum(o?.hoursPerDay, 0, DAY_HOURS_MAX); return n ? n : null; })(),
      materialPct: optNum(o?.materialPct, 0, PCT_MAX),
      byRarity,
      consumablePct: optNum(o?.consumablePct, 0, PCT_MAX) ?? 100,
      dc: dcOf(o?.dc),
      helpersMax: intOr(o?.helpersMax, 0, HELPERS_MAX, 0),
      helperDivides: o?.helperDivides === true,
      failMaterials: Object.hasOwn(FAIL_RULES, o?.failMaterials) ? o.failMaterials : d.failMaterials,
      chargeCoin: o?.chargeCoin === true,
      rankTime
    };
  }
});

/**
 * What is and isn't set, as plain sentences for the setup page and the health check: `{ set: string[], unset: string[] }`.
 * @param {CraftRules} r
 */
export function rulesStatus(r) {
  const set = []; const unset = [];
  const anyRarity = (/** @type {"hours" | "cost" | "dc"} */ k) => RARITY_KEYS.some(x => r.byRarity[x][k] !== null);
  (r.timeHours !== null && r.timePerGp ? set : unset).push("time from the item's price");
  (r.materialPct !== null ? set : unset).push("coin cost from the item's price");
  (anyRarity("hours") || anyRarity("cost") ? set : unset).push("time and cost by rarity");
  (r.dc !== null || anyRarity("dc") ? set : unset).push("a DC");
  return { set, unset };
}

/** The Export box's text. @param {unknown} stored */
export const exportRules = stored => JSON.stringify({ format: RULES_FORMAT, rules: normalizeRules(stored) }, null, 2);

/**
 * Reads pasted JSON (our wrapper or a bare rules object): `{ ok, rules }` or `{ ok: false, error }`. Never throws.
 * @param {unknown} text
 */
export function readRulesImport(text) {
  let d;
  try { d = JSON.parse(String(text ?? "")); } catch { return { ok: false, error: "The text isn't JSON." }; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, error: "Expected an object." };
  if (d.format !== undefined && d.format !== RULES_FORMAT) return { ok: false, error: `This is a "${String(d.format).slice(0, 60)}" file, not crafting rules.` };
  const raw = d.format === RULES_FORMAT ? d.rules : d;
  if (!raw || typeof raw !== "object") return { ok: false, error: "No rules found." };
  if (Number.isInteger(raw.v) && raw.v > RULES_VERSION) return { ok: false, error: "These rules come from a newer version of the module." };
  return { ok: true, rules: normalizeRules({ ...raw, v: RULES_VERSION }) };
}

// ------------------------------------------------------------------ money

/** @typedef {Record<string, number>} CoinValues denomination → value in the smallest coin */

/**
 * A price (`{ value, denomination }`) in the smallest coin, or null.
 * @param {import("./recipes-model.mjs").Price | null | undefined} price @param {CoinValues} values
 */
export function priceAmount(price, values) {
  if (!price) return null;
  const per = values[price.denomination] ?? values.gp;
  const n = Number(price.value) * Number(per);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

/** Gold pieces → the smallest coin. @param {number} gp @param {CoinValues} values */
export const gpAmount = (gp, values) => Math.max(0, Math.round(gp * (values.gp || 100)));
/** The smallest coin → gold pieces. @param {number} amount @param {CoinValues} values */
export const amountGp = (amount, values) => amount / (values.gp || 100);

/** A purse's total in the smallest coin. @param {Record<string, unknown>} currency @param {CoinValues} values */
export function purseTotal(currency, values) {
  let t = 0;
  for (const [k, v] of Object.entries(values)) t += Math.max(0, Math.floor(Number(currency?.[k]) || 0)) * v;
  return t;
}

/**
 * The purse after paying `amount`: smallest coins first, then one larger coin is broken and the change given in smaller coins (no
 * electrum), so the purse keeps its mix. `{ currency }` (only the coins in `values` are touched) or `{ error }` (not enough).
 * @param {Record<string, unknown>} currency @param {number} amount @param {CoinValues} values
 */
export function payPlan(currency, amount, values) {
  const need0 = Math.max(0, Math.round(amount));
  if (purseTotal(currency, values) < need0) return { error: "Not enough coin." };
  /** @type {Record<string, number>} */
  const c = {};
  for (const k of Object.keys(values)) c[k] = Math.max(0, Math.floor(Number(currency?.[k]) || 0));
  const asc = Object.entries(values).sort((a, b) => a[1] - b[1]);
  let need = need0;
  for (const [k, v] of asc) { const take = Math.min(c[k], Math.floor(need / v)); c[k] -= take; need -= take * v; }
  if (need > 0) {
    for (const [k, v] of asc) {
      if (c[k] > 0 && v >= need) {
        c[k] -= 1; let change = v - need; need = 0;
        for (const [k2, v2] of [...asc].reverse()) { if (v2 >= v || k2 === "ep") continue; const n = Math.floor(change / v2); c[k2] += n; change -= n * v2; }
        break;
      }
    }
  }
  return need > 0 ? { error: "Not enough coin." } : { currency: c };
}

// ------------------------------------------------------------------ time

/**
 * Hours as text: "45 minutes", "4 hours", "27 hours (4.5 days of 6 hours)".
 * @param {number | null} h @param {number | null} [perDay]
 */
export function hoursText(h, perDay = null) {
  if (h === null || !Number.isFinite(h)) return "";
  if (h > 0 && h < 1) return `${Math.max(1, Math.round(h * 60))} minutes`;
  const n = Math.round(h * 100) / 100;
  const base = `${n} hour${n === 1 ? "" : "s"}`;
  if (!perDay || n < perDay) return base;
  const days = Math.round((n / perDay) * 10) / 10;
  return `${base} (${days} day${days === 1 ? "" : "s"} of ${perDay} hours)`;
}

// ------------------------------------------------------------------ materials

/**
 * @typedef {{ id: string, name: string, qty: number, type?: string, sources: string[] }} InvItem an item the character carries:
 *   `sources` = its own UUID and where it came from (`_stats.compendiumSource`, `_stats.duplicateSource`, `flags.core.sourceId`)
 */

/** Folded for a name match. @param {string} s */
const fold = s => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Whether a carried item counts as a material: the same source UUID, or (when the material has a name) the same name, so a
 * stack from another compendium or made by hand still counts.
 * @param {InvItem} item @param {import("./recipes-model.mjs").Material} m
 */
export function matches(item, m) {
  if (m.uuid && item.sources.includes(m.uuid)) return true;
  return !!m.name && fold(item.name) === fold(m.name);
}

/** How many of a material the character carries. @param {InvItem[]} inv @param {import("./recipes-model.mjs").Material} m */
export const haveOf = (inv, m) => inv.filter(i => matches(i, m)).reduce((t, i) => t + Math.max(0, i.qty), 0);

/**
 * The item updates that use up the materials `times` over: `{ updates: [{ _id, "system.quantity" }], deletes: [id] }`, or
 * `{ error }` when something is short. A stack counts once even if it matches two materials (taken by the first).
 * @param {InvItem[]} inv @param {import("./recipes-model.mjs").Material[]} materials @param {number} [times]
 */
export function consumePlan(inv, materials, times = 1) {
  const left = new Map(inv.map(i => [i.id, Math.max(0, i.qty)]));
  for (const m of materials) {
    let need = m.qty * times;
    for (const i of inv) {
      if (need <= 0) break;
      if (!matches(i, m)) continue;
      const take = Math.min(need, left.get(i.id) ?? 0);
      left.set(i.id, (left.get(i.id) ?? 0) - take); need -= take;
    }
    if (need > 0) return { error: `Not enough ${m.name || "material"}.` };
  }
  const updates = []; const deletes = [];
  for (const i of inv) {
    const n = left.get(i.id) ?? 0;
    if (n === Math.max(0, i.qty)) continue;
    if (n <= 0) deletes.push(i.id); else updates.push({ _id: i.id, "system.quantity": n });
  }
  return { updates, deletes };
}

// ------------------------------------------------------------------ the decision

/** The lowest rank row that crafts this rarity, or null ("" = mundane needs none). @param {string} rarity @param {import("./ranks-model.mjs").RankTable} table */
export function minRankFor(rarity, table) {
  if (!rarity) return null;
  const need = RARITY_KEYS.indexOf(rarity);
  return table.rows.find(r => RARITY_KEYS.indexOf(r.rarity) >= need) ?? null;
}

/** Whether a rank row crafts a rarity ("" = mundane: always). @param {string} rarity @param {import("./ranks-model.mjs").RankRow | null} row */
export function rankAllows(rarity, row) {
  if (!rarity) return true;
  return !!row && RARITY_KEYS.indexOf(row.rarity) >= RARITY_KEYS.indexOf(rarity);
}

/**
 * The tool a profession crafts with for this character: the linked tool with the best proficiency (1 or more), the first on a tie;
 * null when the character isn't proficient with any (or the profession links none).
 * @param {import("./professions-model.mjs").Profession} p @param {{ tools: Record<string, number> }} facts
 */
export function craftTool(p, facts) {
  /** @type {{ key: string, mult: number } | null} */
  let best = null;
  for (const key of p.tools) { const m = Number(facts.tools?.[key] ?? 0) || 0; if (m >= 1 && (!best || m > best.mult)) best = { key, mult: m }; }
  return best;
}

/**
 * Everything about crafting one recipe now, from plain facts: the numbers, what's missing and whether it can be crafted.
 * @param {object} a
 * @param {import("./recipes-model.mjs").Recipe} a.recipe
 * @param {import("./professions-model.mjs").Profession | null} a.profession
 * @param {CraftRules} a.rules normalized
 * @param {import("./ranks-model.mjs").RankTable} a.ranks normalized
 * @param {{ pb: number | null, tools: Record<string, number> }} a.facts
 * @param {import("./recipes-model.mjs").Known} a.known
 * @param {InvItem[]} a.inventory
 * @param {number} a.purse the crafter's coin, in the world's smallest coin
 * @param {CoinValues} a.values the prices' economy (book or world)
 * @param {CoinValues} a.worldValues the world's coins (what the purse is paid in)
 * @param {number} [a.helpers]
 * @param {Record<string, string>} [a.rarityLabels]
 * @param {Record<string, string>} [a.toolLabels]
 */
export function assess(a) {
  const { recipe: r, profession: p, rules, ranks } = a;
  const rarity = recipeRarity(r);
  const labels = a.rarityLabels ?? {};
  const problems = [];
  const learned = !!p && (p.tools.length === 0 || p.tools.some(t => (Number(a.facts.tools?.[t]) || 0) >= 1));
  const tool = p ? craftTool(p, a.facts) : null;
  const know = knows(r, a.known);
  const rank = rankFor(a.facts.pb, ranks);
  const need = minRankFor(rarity, ranks);
  const rankOk = rankAllows(rarity, rank.row);
  if (!p) problems.push("The recipe's profession doesn't exist.");
  else if (!learned) problems.push(`Needs the ${p.name} profession.`);
  else if (!p.tools.length) problems.push(`${p.name} has no linked tool, so there is no tool check to roll (link one in setup).`);
  else if (!tool) problems.push(`Needs proficiency with ${p.name}'s tool.`);
  if (!know) problems.push("Recipe unknown.");
  if (!rankOk) problems.push(need ? `Needs ${need.name} ${signed(need.bonus)} (crafts up to ${rarityLabel(need.rarity, labels)}).` : `No rank crafts ${rarityLabel(rarity, labels)}.`);
  if (!r.result.uuid) problems.push("The recipe has no result item.");

  const materials = r.materials.map(m => { const have = haveOf(a.inventory, m); return { name: m.name || "Material", uuid: m.uuid, img: m.img, need: m.qty, have, ok: have >= m.qty }; });
  const materialsOk = materials.every(m => m.ok);
  if (!materialsOk) problems.push("Missing materials.");

  const magic = !!rarity && rarity !== "";
  const rr = magic ? rules.byRarity[rarity] ?? null : null;
  const consumable = r.result.type === "consumable";
  const share = consumable ? rules.consumablePct / 100 : 1;
  const price = priceAmount(r.result.price, a.values);
  const priceGp = price === null ? null : amountGp(price, a.values);
  /** @type {string[]} */
  const timeNotes = [];

  // Time (for reference only): recipe → rarity table → from the price.
  /** @type {number | null} */
  let hours = null; let timeFrom = "";
  if (r.hours !== null) { hours = r.hours; timeFrom = "recipe"; }
  else if (rr?.hours !== null && rr?.hours !== undefined) { hours = rr.hours * share; timeFrom = "rarity"; if (consumable && share !== 1) timeNotes.push(`consumable ${rules.consumablePct}%`); }
  else if (rules.timeHours !== null && rules.timePerGp && priceGp !== null) { hours = rules.timeHours * (priceGp / rules.timePerGp); timeFrom = "price"; }
  if (hours !== null) {
    const pct = rank.row ? rules.rankTime[String(rank.row.bonus)] : undefined;
    if (pct !== undefined) { hours = hours * pct / 100; timeNotes.push(`${rank.row?.name} ${pct}%`); }
    const helpers = Math.max(0, Math.min(rules.helpersMax, Math.floor(Number(a.helpers) || 0)));
    if (helpers && rules.helperDivides) { hours = hours / (1 + helpers); timeNotes.push(`${helpers} helper${helpers === 1 ? "" : "s"}`); }
    const h = /** @type {number} */ (hours);
    if (rules.rounding === "hour") hours = Math.ceil(h - 1e-9);
    else if (rules.rounding === "day" && rules.hoursPerDay) hours = Math.ceil(h / rules.hoursPerDay - 1e-9) * rules.hoursPerDay;
  }

  // Coin cost: recipe → rarity table → share of the price.
  /** @type {number | null} */
  let costGp = null; let costFrom = "";
  if (r.cost !== null) { costGp = r.cost; costFrom = "recipe"; }
  else if (rr?.cost !== null && rr?.cost !== undefined) { costGp = rr.cost * share; costFrom = "rarity"; }
  else if (rules.materialPct !== null && priceGp !== null) { costGp = priceGp * rules.materialPct / 100; costFrom = "price"; }
  const cost = costGp === null ? null : Math.floor(costGp * (a.values.gp || 100) + 1e-9);
  const charge = rules.chargeCoin && costGp !== null ? Math.floor(costGp * (a.worldValues.gp || 100) + 1e-9) : 0;
  const coinOk = a.purse >= charge;
  if (!coinOk) problems.push("Not enough coin for the cost.");

  // DC: recipe → rarity table → the base DC; none = the GM decides.
  const dc = r.dc ?? rr?.dc ?? rules.dc ?? null;

  const status = !know ? "unknown" : !rankOk ? "rank" : problems.length ? "missing" : "ok";
  return {
    id: r.id, name: r.name, rarity, rarityLabel: rarity ? rarityLabel(rarity, labels) : "Mundane", magic, consumable,
    learned, tool: tool ? { ...tool, label: a.toolLabels?.[tool.key] ?? tool.key } : null, knows: know,
    rank: rank.row, need, rankOk, materials, materialsOk,
    hours, timeFrom, timeNotes, price, cost, costFrom, charge, coinOk, dc,
    problems, canCraft: problems.length === 0, status
  };
}

/**
 * A finished check: success when the total meets the DC; with no DC the GM decides (`null`).
 * @param {number} total @param {number | null} dc
 */
export const outcome = (total, dc) => (dc === null ? null : Number(total) >= dc);

/**
 * What a craft does to the character, by result: success makes the item and uses up the materials (and the coin cost when it is
 * charged); a failure uses them up only when the rules say "lose".
 * @param {boolean} success @param {CraftRules} rules
 */
export const spends = (success, rules) => success || rules.failMaterials === "lose";

// ------------------------------------------------------------------ the craft card's state

export const CARD_VERSION = 1;
export const CARD_STATES = Object.freeze(["pending", "done", "failed", "refused", "error"]);
/** GM choices on a pending card. */
export const CHOICES = Object.freeze(["approve", "success", "failure", "refuse"]);

/**
 * The decision a GM's choice makes on a pending card: `{ success }` (true / false) or `{ refuse: true }`; an approve needs a
 * rolled result against a DC. Null for a choice that doesn't fit the card.
 * @param {{ dc: number | null, total: number }} card @param {string} choice
 */
export function decide(card, choice) {
  if (choice === "refuse") return { refuse: true };
  if (choice === "approve") return card.dc === null ? null : { success: Number(card.total) >= card.dc };
  if (choice === "success") return { success: true };
  if (choice === "failure") return { success: false };
  return null;
}
