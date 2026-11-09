/**
 * Crafting rules and the crafting decision, pure (tested in Node: tests/craft.test.mjs).
 *
 * **Rules are world data.** Every number crafting uses (time per value of the item, the material cost as a share of the price, the
 * time, cost and DC per rarity, the consumable modifier, helpers, a time change per rank, a base DC) lives in the world setting
 * `craftRules`, edited on the setup window's Crafting rules page or pasted as JSON. Nothing from any published rulebook ships here:
 * the defaults are empty ("not set") or neutral (100 %, no helpers, no coin charged), and the GM fills them in from the rules their
 * table uses. A craft with no DC at all succeeds on the roll (the roll is still made and shown).
 *
 * **Materials come from the inventory** and are used up when the roll lands: on a success, and on a failure too unless the GM's
 * rule says failures keep them (`failMaterials`, default "lose").
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
import { recipeRarity, knows, optNum, hasBetter, DC_MIN, DC_MAX, HOURS_MAX, COST_MAX } from "./recipes-model.mjs";

/** 2 (0.5): `betterMargin` and `batchMax` (v1 reads with both "not set"). */
export const RULES_VERSION = 2;
/** The most a batch can ever hold (the rules' `batchMax` is capped here, and so is the `craft` request's `qty`). */
export const BATCH_LIMIT = 50;
/** The better-result margin's range (above the DC). */
export const MARGIN_MAX = DC_MAX;
export const RULES_FORMAT = "wanderers-guild.craftRules";
export const PCT_MAX = 1000;
export const HELPERS_MAX = 20;
export const DAY_HOURS_MAX = 24;
/** How long a tool check roll stays usable for a craft. */
export const ROLL_MAX_AGE_MS = 10 * 60 * 1000;

/** What happens to the materials (and the coin cost) on a failed check. */
export const FAIL_RULES = Object.freeze({ lose: "Used up: the materials (and any coin cost) are spent on a failure too", keep: "Kept: a failure uses up nothing" });
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
 * @property {number | null} betterMargin a roll of at least DC + this makes the recipe's better result (null = off)
 * @property {number | null} batchMax the most crafted in one batch (null = batches off: one at a time)
 */

/** A fresh rules object: nothing set. @returns {CraftRules} */
export const defaultRules = () => ({
  v: RULES_VERSION, timeHours: null, timePerGp: null, rounding: "hour", hoursPerDay: null, materialPct: null,
  byRarity: Object.fromEntries(RARITY_KEYS.map(k => [k, { hours: null, cost: null, dc: null }])),
  consumablePct: 100, dc: null, helpersMax: 0, helperDivides: false, failMaterials: "lose", chargeCoin: false, rankTime: {},
  betterMargin: null, batchMax: null
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
  // v1 → v2: `betterMargin` and `batchMax` (missing = not set).
  upgrades: { 1: o => o },
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
      rankTime,
      betterMargin: (() => { const n = optNum(o?.betterMargin, 0, MARGIN_MAX); return n === null ? null : Math.round(n); })(),
      batchMax: (() => { const n = optNum(o?.batchMax, 1, BATCH_LIMIT); return n === null || Math.round(n) < 2 ? null : Math.round(n); })()
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
  (r.betterMargin !== null ? set : unset).push("a better-result margin");
  (r.batchMax !== null ? set : unset).push("batches");
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

/**
 * The carried stack a new result joins: only consumables and loot stack; the same source UUID first, else an item of the same
 * type and name (a world item copied onto a character keeps no link to its source, so results made later must still find it).
 * @param {InvItem[]} inv @param {{ uuid: string, name: string, type: string }} result @param {string[]} [skip] ids not to use
 * @returns {InvItem | null}
 */
export function stackOf(inv, result, skip = []) {
  if (!["consumable", "loot"].includes(result.type)) return null;
  const pool = inv.filter(i => !skip.includes(i.id) && i.type === result.type);
  return pool.find(i => i.sources.includes(result.uuid)) ?? pool.find(i => !!result.name && fold(i.name) === fold(result.name)) ?? null;
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
 * How many one craft makes in a batch: a whole number from 1 to the rules' `batchMax` (1 when batches are off). Never more than
 * asked, so a clamp only ever makes (and spends) less.
 * @param {unknown} n @param {CraftRules} rules
 */
export function clampBatch(n, rules) {
  const max = rules.batchMax ?? 1;
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(1, v)) : 1;
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
 * @param {number} [a.batch] how many to make in one go (clamped with `clampBatch`; 1 when batches are off)
 * @param {Record<string, string>} [a.rarityLabels]
 * @param {Record<string, string>} [a.toolLabels]
 */
export function assess(a) {
  const { recipe: r, profession: p, rules, ranks } = a;
  const batch = clampBatch(a.batch ?? 1, rules);
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

  const materials = r.materials.map(m => { const have = haveOf(a.inventory, m); const need = m.qty * batch; return { name: m.name || "Material", uuid: m.uuid, img: m.img, need, each: m.qty, have, ok: have >= need }; });
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
    if (batch > 1) { hours = hours * batch; timeNotes.push(`batch of ${batch}`); }
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
  if (costGp !== null) costGp = costGp * batch;
  const cost = costGp === null ? null : Math.floor(costGp * (a.values.gp || 100) + 1e-9);
  const charge = rules.chargeCoin && costGp !== null ? Math.floor(costGp * (a.worldValues.gp || 100) + 1e-9) : 0;
  const coinOk = a.purse >= charge;
  if (!coinOk) problems.push("Not enough coin for the cost.");

  // DC: recipe → rarity table → the base DC; none = the GM decides.
  const dc = r.dc ?? rr?.dc ?? rules.dc ?? null;
  // Better result: the recipe has one, a DC is set and the rules give a margin.
  const betterAt = dc !== null && rules.betterMargin !== null && hasBetter(r) ? dc + rules.betterMargin : null;

  const status = !know ? "unknown" : !rankOk ? "rank" : problems.length ? "missing" : "ok";
  return {
    id: r.id, name: r.name, rarity, rarityLabel: rarity ? rarityLabel(rarity, labels) : "Mundane", magic, consumable,
    learned, tool: tool ? { ...tool, label: a.toolLabels?.[tool.key] ?? tool.key } : null, knows: know,
    rank: rank.row, need, rankOk, materials, materialsOk,
    hours, timeFrom, timeNotes, price, cost, costFrom, charge, coinOk, dc, batch, batchMax: rules.batchMax ?? 1, betterAt,
    makes: r.result.qty * batch,
    problems, canCraft: problems.length === 0, status
  };
}

/**
 * A finished check: success when the total meets the DC; with no DC set anywhere the roll crafts it (success).
 * @param {number} total @param {number | null} dc
 */
export const outcome = (total, dc) => (dc === null ? true : Number(total) >= dc);

/**
 * Whether a successful check makes the better result: the total reaches `betterAt` (DC + the rules' margin; null = no better
 * result for this craft: no DC, no margin, or the recipe has none).
 * @param {boolean} success @param {number | null} total @param {number | null} betterAt
 */
export const isBetter = (success, total, betterAt) => success && betterAt !== null && total !== null && Number(total) >= betterAt;

/**
 * What a successful craft makes: the normal result, or with a better roll the better item (when set) and the extra quantity, all
 * times the batch. `{ uuid, name, img, type, qty, better }`.
 * @param {import("./recipes-model.mjs").Recipe} r @param {{ batch: number, better: boolean }} o
 */
export function resultPlan(r, o) {
  const n = Math.max(1, Math.floor(o.batch) || 1);
  const b = o.better && hasBetter(r) ? r.better : null;
  const item = b?.uuid ? { uuid: b.uuid, name: b.name, img: b.img, type: b.type, rarity: b.rarity } : { uuid: r.result.uuid, name: r.result.name, img: r.result.img, type: r.result.type, rarity: r.result.rarity };
  return { ...item, qty: (r.result.qty + (b?.qty ?? 0)) * n, better: !!b };
}

/**
 * The card state fields that follow the assessment made when a craft resolves (0.5.2): the batch, the better-result roll and the
 * time text, so a batch lowered between the pending card and Approve shows its own time.
 * @param {{ batch: number, betterAt: number | null, hours: number | null }} a @param {{ hoursPerDay: number | null }} rules
 */
export function assessedState(a, rules) {
  return { batch: a.batch, betterAt: a.betterAt, timeText: hoursText(a.hours, rules.hoursPerDay) };
}

/**
 * What the better result is, as text for the window ("+2 more", "Fine Sword instead", "Fine Sword ×3 instead"), "" when none.
 * @param {import("./recipes-model.mjs").Recipe} r
 */
export function betterText(r) {
  if (!hasBetter(r)) return "";
  const b = r.better;
  if (!b.uuid) return `${b.qty} more`;
  const name = b.name || "the better item";
  const qty = r.result.qty + b.qty;
  return `${name}${qty > 1 ? ` ×${qty}` : ""} instead`;
}

/**
 * What a craft does to the character, by result: success makes the item and uses up the materials (and the coin cost when it is
 * charged); a failure uses them up too unless the rules say "keep".
 * @param {boolean} success @param {CraftRules} rules
 */
export const spends = (success, rules) => success || rules.failMaterials !== "keep";

/**
 * What a recipe's materials use up, as "2× Copper Bar" lines (`need` is already the batch's total; a recipe's `qty` is times `times`).
 * @param {Array<{ name: string, qty?: number, need?: number }>} materials @param {number} [times]
 */
export const usedList = (materials, times = 1) => materials.map(m => `${m.need !== undefined ? Number(m.need) || 1 : (Number(m.qty) || 1) * times}× ${m.name || "material"}`);

/**
 * The notice shown before a craft (next to the Craft button and as its tooltip): what the craft takes from the inventory and when.
 * `charge` adds the coin cost; `approval` (GM approves each craft) moves the moment to the GM's decision.
 * `batch` (0.5) names the batch; the materials' `need` is already its total.
 * @param {Array<{ name: string, need: number }>} materials @param {{ fail: string, charge?: boolean, approval?: boolean, batch?: number }} o
 */
export function usesNotice(materials, o) {
  const items = usedList(materials);
  if (o.charge) items.push("the coin cost");
  const what = (o.batch ?? 1) > 1 ? `A batch of ${o.batch}` : "Crafting";
  if (!items.length) return `${what} uses up nothing from the inventory.`;
  const when = o.approval ? "when the GM decides" : "when you roll";
  const tail = o.fail === "keep" ? `taken ${when}, on success; kept on a failure` : `taken ${when}, success or failure`;
  return `${what} uses up: ${items.join(", ")} (${tail}).`;
}

/**
 * The `wanderers-guild.crafted` hook's payload: ids, the outcome and (0.5) `better` and `batch`, nothing else.
 * @param {{ actorId: string, recipeId: string, success: boolean, better?: boolean, batch?: number, messageId: string | null }} o
 */
export const craftedPayload = o => ({
  actorId: String(o.actorId), recipeId: String(o.recipeId), success: !!o.success, better: !!o.better && !!o.success,
  batch: Math.max(1, Math.floor(Number(o.batch)) || 1), messageId: o.messageId ?? null
});

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

// ------------------------------------------------------------------ paying before writing (0.5.3)

/** An error's message as text. @param {unknown} e */
const errText = e => String(/** @type {any} */ (e)?.message ?? e ?? "unknown error");

/**
 * Runs a craft's writes in a safe order (0.5.3): the coin cost is taken first (when `charge` > 0), and the item and materials are
 * written only after the payment went through. A refused payment (`pay` resolves false, or throws) writes nothing. When a write fails
 * after a payment, `refund` gives the coin back (when there is one); the result says whether it did, so the card can tell the GM.
 * `write` gets a `step(name)` callback to record what it finished, so a failure part-way can list what was already written.
 * Resolves to `{ ok: true, value, paid }` or `{ ok: false, stage: "pay" | "write", error, paid, refunded, refundError, done }`.
 * @template T
 * @param {{ charge: number, pay: () => Promise<unknown>, write: (step: (name: string) => void) => Promise<T>, refund?: (() => Promise<unknown>) | null }} o
 */
export async function payThenWrite(o) {
  const charged = Number(o.charge) > 0;
  if (charged) {
    let r;
    try { r = await o.pay(); } catch (e) { return { ok: false, stage: "pay", error: errText(e), paid: false, refunded: false, refundError: "", done: [] }; }
    if (r === false) return { ok: false, stage: "pay", error: "not enough coin", paid: false, refunded: false, refundError: "", done: [] };
  }
  /** @type {string[]} */
  const done = [];
  try { return { ok: true, value: await o.write(name => { done.push(String(name)); }), paid: charged }; } catch (e) {
    let refunded = false; let refundError = "";
    if (charged && typeof o.refund === "function") {
      try { refunded = (await o.refund()) !== false; if (!refunded) refundError = "the refund was refused"; } catch (e2) { refundError = errText(e2); }
    } else if (charged) refundError = "no way to give coin back";
    return { ok: false, stage: "write", error: errText(e), paid: charged, refunded, refundError, done };
  }
}

/**
 * The card's text for a craft whose writes failed (`payThenWrite`'s failure), with `coin` the cost as plain text ("5 gp").
 * @param {{ stage: string, error: string, paid: boolean, refunded: boolean, refundError?: string, done?: string[] }} r @param {string} coin
 */
export function writeFailText(r, coin) {
  if (r.stage === "pay") return `Nothing was made or used up: the coin cost couldn't be paid (${r.error}).`;
  const done = r.done?.length ? ` Already done: ${r.done.join(", ")}; check the character's items.` : " Nothing was made or used up.";
  if (!r.paid) return `The craft failed: ${r.error}.${done}`;
  if (r.refunded) return `The craft failed after the coin cost was paid: ${r.error}. The coin (${coin}) was given back.${done}`;
  return `The craft failed after the coin cost was paid: ${r.error}. The coin (${coin}) was taken and could NOT be given back (${r.refundError || "unknown"}): GM, return it by hand.${done}`;
}

/**
 * The purse after adding `amount` (smallest coin) on top in the largest coins (no electrum), for a refund without the toolkit.
 * @param {Record<string, unknown>} currency @param {number} amount @param {CoinValues} values
 */
export function addPlan(currency, amount, values) {
  /** @type {Record<string, number>} */
  const c = {};
  for (const k of Object.keys(values)) c[k] = Math.max(0, Math.floor(Number(currency?.[k]) || 0));
  let left = Math.max(0, Math.round(Number(amount) || 0));
  for (const [k, v] of Object.entries(values).sort((a, b) => b[1] - a[1])) { if (k === "ep" || !(v > 0)) continue; const n = Math.floor(left / v); c[k] += n; left -= n * v; }
  return c;
}
