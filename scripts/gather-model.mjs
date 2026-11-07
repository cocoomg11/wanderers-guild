/**
 * Gathering, pure (tested in Node: tests/gather.test.mjs). A gathering profession (one with the "gather" action) makes a check (the
 * profession's skill, or its linked tool) at a **node** on the map, in the **area** of a scene (its tier), or on a defeated
 * **creature** (harvesting). Every number is world data the GM fills in: nothing from any rulebook ships. Empty DC = no DC: the
 * check is made and succeeds, as with crafting.
 *
 * Stored shapes (each read through one normalizer here):
 * - world setting `gatherRules` `{ v: 1, tiers: [{ id, name, dc }], rareMargin, qty, qtyMode, reach, crBands: [{ cr, dc }],
 *   creatures: [{ type, profession, item, rare, minBonus }], areas: [{ profession, tier, item, rare }] }` (item / rare =
 *   `{ uuid, name, img }` or null).
 * - world setting `gatherReset` `{ v: 2, at, days }`: gathering limits older than `at` no longer count (the GM's reset, or a journey);
 *   `days` = the last journey's length in days (from the toolkit's `hours`; null after a GM reset or a journey without hours), which
 *   prefills the Gather window's *Days in this stage*. v1 `{ v: 1, at }` reads as `days: null`.
 * - a node: a core Note with `flags.wanderers-guild.node` `{ v: 1, profession, name, item, rare, tier, dc, qty, uses, minBonus,
 *   hidden, resetAt }`.
 * - an actor's limits: `flags.wanderers-guild.gathered` `{ v: 1, marks: [{ key, at }] }` (key `n:<sceneId>.<noteId>` or
 *   `s:<sceneId>`), at most MARKS_MAX.
 * - a harvested creature: the token's `flags.wanderers-guild.harvested` `{ v: 2, list: [{ actor, profession, at }] }`, one entry per
 *   profession (a creature is harvested once per profession), at most HARVEST_MAX; v1 `{ v: 1, actor, profession, at }` reads as a
 *   one-entry list.
 *
 * Quantity: a success at a node or in an area gives `qty` per day of the journey stage (`qtyMode` "perDay", the default; the days
 * come with the request, 1–DAYS_MAX), or just `qty` (`qtyMode` "flat"). One check per stage either way; a rare result replaces one
 * of them. Harvesting a creature always gives `qty` (no days).
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";
import { UUID_RE, optNum, DC_MIN, DC_MAX } from "./recipes-model.mjs";
import { ID_RE } from "./professions-model.mjs";
import { signed } from "./ranks-model.mjs";

export const GATHER_VERSION = 1;
export const GATHER_FORMAT = "wanderers-guild.gatherRules";
export const TIERS_MAX = 12;
export const BANDS_MAX = 12;
export const CREATURES_MAX = 60;
export const AREAS_MAX = 100;
export const MARKS_MAX = 100;
export const QTY_MAX = 99;
export const USES_MAX = 999;
export const REACH_MAX = 100;
export const NAME_MAX = 60;
export const CR_MAX = 30;
/** Most professions one creature keeps a harvested mark for. */
export const HARVEST_MAX = 10;
/** Days in one journey stage (the Gather window's field and the `gather` request). */
export const DAYS_MAX = 30;
/** How a success's quantity is counted. */
export const QTY_MODES = Object.freeze(["perDay", "flat"]);
/** A gather roll is usable for this long after it was made. */
export const ROLL_MAX_AGE_MS = 10 * 60 * 1000;
/** Tier ids: t + digits or letters. */
export const TIER_ID_RE = /^[a-z][a-z0-9_-]{0,15}$/;
/** dnd5e creature type keys. */
export const TYPE_RE = /^[a-z][a-zA-Z0-9]{0,31}$/;

/**
 * SRD 5.2 typical DCs by difficulty: offered as suggestions next to the DC fields (a picker help), never filled in for you.
 */
export const SRD_DCS = Object.freeze([
  { dc: 5, label: "Very easy" }, { dc: 10, label: "Easy" }, { dc: 15, label: "Medium" },
  { dc: 20, label: "Hard" }, { dc: 25, label: "Very hard" }, { dc: 30, label: "Nearly impossible" }
]);

/**
 * @typedef {{ uuid: string, name: string, img: string }} ItemRef
 * @typedef {{ id: string, name: string, dc: number | null }} Tier
 * @typedef {{ cr: number, dc: number | null }} Band
 * @typedef {{ type: string, profession: string, item: ItemRef | null, rare: ItemRef | null, minBonus: number | null }} CreatureRow
 * @typedef {{ profession: string, tier: string, item: ItemRef | null, rare: ItemRef | null }} AreaRow
 * @typedef {{ v: number, tiers: Tier[], rareMargin: number | null, qty: number, qtyMode: "perDay" | "flat", reach: number, crBands: Band[], creatures: CreatureRow[], areas: AreaRow[] }} GatherRules
 * @typedef {{ v: number, profession: string, name: string, item: ItemRef | null, rare: ItemRef | null, tier: string, dc: number | null, qty: number | null, uses: number | null, minBonus: number | null, hidden: boolean, resetAt: number }} Node
 */

const line = (/** @type {unknown} */ s, /** @type {number} */ max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const dcOf = (/** @type {unknown} */ v) => { const n = optNum(v, DC_MIN, DC_MAX); return n === null ? null : Math.round(n); };
const intOpt = (/** @type {unknown} */ v, /** @type {number} */ min, /** @type {number} */ max) => { const n = optNum(v, min, max); return n === null ? null : Math.round(n); };
const profId = (/** @type {unknown} */ v) => (ID_RE.test(String(v ?? "")) ? String(v) : "");
const tierId = (/** @type {unknown} */ v) => (TIER_ID_RE.test(String(v ?? "")) ? String(v) : "");

/** An item reference, or null (no UUID). @param {unknown} raw @returns {ItemRef | null} */
export function cleanRef(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return null;
  const uuid = String(o.uuid ?? "").trim();
  if (!(uuid.length <= 300 && UUID_RE.test(uuid))) return null;
  const img = String(o.img ?? "").trim();
  return { uuid, name: line(o.name, 80), img: img.length <= 500 && !/[<>"'`\s]/.test(img) ? img : "" };
}

/** The neutral tiers a new world starts with: names only, no DC. */
export const defaultTiers = () => [1, 2, 3, 4, 5].map(n => ({ id: `t${n}`, name: `Tier ${n}`, dc: null }));

/** Rules with nothing set: neutral tier names with empty DCs, no rare margin, 1 per success (per day of the stage), a reach of 2 grid spaces. */
export const defaultGatherRules = () => /** @type {GatherRules} */ ({ v: GATHER_VERSION, tiers: defaultTiers(), rareMargin: null, qty: 1, qtyMode: "perDay", reach: 2, crBands: [], creatures: [], areas: [] });

/** @type {(raw: unknown) => GatherRules} */
export const normalizeGatherRules = versioned({
  version: GATHER_VERSION,
  empty: defaultGatherRules,
  clean: s => {
    const o = /** @type {any} */ (s ?? {});
    /** @type {Tier[]} */ const tiers = []; const ids = new Set();
    for (const t of Array.isArray(o.tiers) ? o.tiers : []) {
      if (tiers.length >= TIERS_MAX) break;
      const id = tierId(t?.id); const name = line(t?.name, NAME_MAX);
      if (!id || !name || ids.has(id)) continue;
      ids.add(id); tiers.push({ id, name, dc: dcOf(t?.dc) });
    }
    /** @type {Band[]} */ const crBands = []; const crs = new Set();
    for (const b of Array.isArray(o.crBands) ? o.crBands : []) {
      const cr = optNum(b?.cr, 0, CR_MAX); if (cr === null || crs.has(cr)) continue;
      crs.add(cr); crBands.push({ cr, dc: dcOf(b?.dc) });
    }
    crBands.sort((a, b) => a.cr - b.cr); crBands.splice(BANDS_MAX);
    /** @type {CreatureRow[]} */ const creatures = []; const seen = new Set();
    for (const c of Array.isArray(o.creatures) ? o.creatures : []) {
      if (creatures.length >= CREATURES_MAX) break;
      const type = TYPE_RE.test(String(c?.type ?? "")) ? String(c.type) : ""; const profession = profId(c?.profession);
      if (!type || !profession || seen.has(`${type}|${profession}`)) continue;
      seen.add(`${type}|${profession}`);
      creatures.push({ type, profession, item: cleanRef(c?.item), rare: cleanRef(c?.rare), minBonus: intOpt(c?.minBonus, 0, 20) });
    }
    /** @type {AreaRow[]} */ const areas = []; const seenA = new Set();
    for (const a of Array.isArray(o.areas) ? o.areas : []) {
      if (areas.length >= AREAS_MAX) break;
      const profession = profId(a?.profession); const tier = tierId(a?.tier);
      if (!profession || seenA.has(`${profession}|${tier}`)) continue;
      seenA.add(`${profession}|${tier}`);
      areas.push({ profession, tier, item: cleanRef(a?.item), rare: cleanRef(a?.rare) });
    }
    return {
      v: GATHER_VERSION, tiers: Array.isArray(o.tiers) ? tiers : defaultTiers(),
      rareMargin: intOpt(o.rareMargin, 1, 30), qty: intOpt(o.qty, 1, QTY_MAX) ?? 1, qtyMode: o.qtyMode === "flat" ? "flat" : "perDay", reach: intOpt(o.reach, 0, REACH_MAX) ?? 2,
      crBands, creatures, areas
    };
  }
});

/** Days in a stage, clamped to 1–DAYS_MAX (anything unreadable = 1). @param {unknown} v */
export function clampDays(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(DAYS_MAX, Math.max(1, Math.round(n))) : 1;
}
/**
 * The days the leader uses for a `gather` request. A GM's request: the requested days (clamped). A player's: the requested days, at
 * most the last journey's length (`gatherReset.days`), and 1 when there is no journey on record (after a GM reset, or a journey
 * without hours): a player can't raise the quantity by typing more days.
 * @param {unknown} requested @param {{ isGM: boolean, journeyDays: number | null | undefined }} o
 */
export function allowedDays(requested, { isGM, journeyDays }) {
  const want = clampDays(requested);
  if (isGM) return want;
  const j = Number(journeyDays);
  return Number.isFinite(j) && j >= 1 ? Math.min(want, clampDays(j)) : 1;
}
/** A journey's length in days from its hours: max(1, ceil(hours / 24)), at most DAYS_MAX; null without usable hours. @param {unknown} hours */
export function daysFromHours(hours) {
  const h = Number(hours);
  return Number.isFinite(h) && h > 0 ? Math.min(DAYS_MAX, Math.max(1, Math.ceil(h / 24))) : null;
}

/** The reset record (v2: + `days`, the last journey's length). @type {(raw: unknown) => { v: number, at: number, days: number | null }} */
export const normalizeReset = versioned({
  version: 2, empty: () => ({ v: 2, at: 0, days: null }),
  upgrades: { 0: s => s, 1: s => ({ ...s, days: null }) },
  clean: s => {
    const o = /** @type {any} */ (s); const at = Number(o?.at);
    const d = o?.days === null || o?.days === undefined ? null : Number(o.days);
    return { v: 2, at: Number.isFinite(at) && at > 0 ? Math.round(at) : 0, days: d !== null && Number.isFinite(d) && d >= 1 ? clampDays(d) : null };
  }
});
/** The record a reset writes. @param {number} at @param {number | null} [days] the journey's days (null: a GM reset) */
export const resetRecord = (at, days = null) => normalizeReset({ v: 2, at, days });

/** A node's flag, normalized (null when it has no profession). @param {unknown} raw @returns {Node | null} */
export function normalizeNode(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return null;
  const profession = profId(o.profession); if (!profession) return null;
  const resetAt = Number(o.resetAt);
  return {
    v: GATHER_VERSION, profession, name: line(o.name, NAME_MAX) || "Gathering node", item: cleanRef(o.item), rare: cleanRef(o.rare),
    tier: tierId(o.tier), dc: dcOf(o.dc), qty: intOpt(o.qty, 1, QTY_MAX), uses: intOpt(o.uses, 0, USES_MAX), minBonus: intOpt(o.minBonus, 0, 20),
    hidden: o.hidden === true, resetAt: Number.isFinite(resetAt) && resetAt > 0 ? Math.round(resetAt) : 0
  };
}

/** An actor's gathering limits. @type {(raw: unknown) => { v: number, marks: Array<{ key: string, at: number }> }} */
export const normalizeMarks = versioned({
  version: 1, empty: () => ({ v: 1, marks: [] }),
  clean: s => {
    const marks = [];
    for (const m of Array.isArray(/** @type {any} */ (s)?.marks) ? /** @type {any} */ (s).marks : []) {
      const key = String(m?.key ?? ""); const at = Number(m?.at);
      if (/^(n|s):[A-Za-z0-9.]{1,80}$/.test(key) && Number.isFinite(at) && at > 0) marks.push({ key, at: Math.round(at) });
    }
    return { v: 1, marks: marks.slice(-MARKS_MAX) };
  }
});

/** The marks with `key` set to `at` (moved to the end; the oldest dropped past MARKS_MAX). @param {unknown} stored @param {string} key @param {number} at */
export function withMark(stored, key, at) {
  const s = normalizeMarks(stored);
  return { v: 1, marks: [...s.marks.filter(m => m.key !== key), { key, at }].slice(-MARKS_MAX) };
}
/** When the actor last gathered at `key` (0 = never). @param {unknown} stored @param {string} key */
export const markAt = (stored, key) => normalizeMarks(stored).marks.find(m => m.key === key)?.at ?? 0;
/** The mark keys. @param {string} sceneId @param {string} [noteId] */
export const markKey = (sceneId, noteId) => (noteId ? `n:${sceneId}.${noteId}` : `s:${sceneId}`);

/** @typedef {{ actor: string, profession: string, at: number }} HarvestMark */
/** A creature token's harvested marks, one per profession (v1's single mark reads as a one-entry list). @type {(raw: unknown) => { v: number, list: HarvestMark[] }} */
export const normalizeHarvested = versioned({
  version: 2, empty: () => ({ v: 2, list: [] }),
  upgrades: { 0: s => s, 1: s => ({ list: [{ actor: s.actor, profession: s.profession, at: s.at }] }) },
  clean: s => {
    /** @type {HarvestMark[]} */ const list = []; const seen = new Set();
    const raw = Array.isArray(/** @type {any} */ (s)?.list) ? /** @type {any} */ (s).list : [];
    for (const m of [...raw].reverse()) {
      const at = Number(m?.at); const profession = profId(m?.profession);
      if (!profession || seen.has(profession) || !(Number.isFinite(at) && at > 0)) continue;
      seen.add(profession); list.unshift({ actor: String(m?.actor ?? "").slice(0, 300), profession, at: Math.round(at) });
    }
    return { v: 2, list: list.slice(-HARVEST_MAX) };
  }
});
/** The professions a creature was already harvested for. @param {unknown} raw */
export const harvestedFor = raw => normalizeHarvested(raw).list.map(m => m.profession);
/** The marks with this profession's harvest added (replacing an older one for it; the oldest dropped past HARVEST_MAX). @param {unknown} raw @param {HarvestMark} mark */
export function withHarvest(raw, mark) {
  const s = normalizeHarvested(raw);
  return normalizeHarvested({ v: 2, list: [...s.list.filter(m => m.profession !== mark.profession), mark] });
}

/** A tier by id, or null. @param {GatherRules} rules @param {string} id */
export const tierOf = (rules, id) => rules.tiers.find(t => t.id === id) ?? null;

/**
 * The DC for a creature's challenge rating: the first band whose `cr` is at least the creature's (bands sorted by CR); above every
 * band, the last one. No bands, or the band has no DC → null.
 * @param {GatherRules} rules @param {number | null} cr
 */
export function crDC(rules, cr) {
  if (!rules.crBands.length || cr === null || !Number.isFinite(cr)) return null;
  return (rules.crBands.find(b => b.cr >= cr) ?? rules.crBands[rules.crBands.length - 1]).dc;
}

/** A challenge rating as text ("1/4", "2"). @param {number | null} cr */
export const crText = cr => (cr === null ? "?" : cr === 0.125 ? "1/8" : cr === 0.25 ? "1/4" : cr === 0.5 ? "1/2" : String(cr));

/** The harvest row for a creature type and profession, or null. @param {GatherRules} rules @param {string} type @param {string} profession */
export const creatureRow = (rules, type, profession) => rules.creatures.find(c => c.type === type && c.profession === profession) ?? null;
/** The area row for a profession on a tier (that tier's row, else the row for any tier), or null. @param {GatherRules} rules @param {string} profession @param {string} tier */
export const areaRow = (rules, profession, tier) => rules.areas.find(a => a.profession === profession && a.tier === tier && tier) ?? rules.areas.find(a => a.profession === profession && !a.tier) ?? null;

/** Distance in grid spaces between two canvas points. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b @param {number} gridSize */
export const cellsBetween = (a, b, gridSize) => Math.hypot(a.x - b.x, a.y - b.y) / (gridSize > 0 ? gridSize : 100);

/**
 * The roll a profession gathers with for this character: its skill (default), or (`roll: "tool"`) its best linked tool (1 or more).
 * @param {import("./professions-model.mjs").Profession} p @param {{ tools: Record<string, number> }} facts
 * @returns {{ kind: "skill" | "tool", key: string } | null}
 */
export function gatherRoll(p, facts) {
  if (p.roll !== "tool") return { kind: "skill", key: p.check };
  /** @type {{ key: string, m: number } | null} */ let best = null;
  for (const key of p.tools) { const m = Number(facts.tools?.[key] ?? 0) || 0; if (m >= 1 && (!best || m > best.m)) best = { key, m }; }
  return best ? { kind: "tool", key: best.key } : null;
}

/**
 * @typedef {object} GatherFacts
 * @property {"node" | "area" | "creature"} kind
 * @property {import("./professions-model.mjs").Profession | null} profession
 * @property {{ pb: number | null, tools: Record<string, number> }} facts the gatherer's
 * @property {GatherRules} rules
 * @property {boolean} isGM
 * @property {boolean} once one gather per node / scene until a reset (setting)
 * @property {boolean} [areaOn] gathering without a node allowed (setting)
 * @property {number} [epoch] the world's last reset (ms)
 * @property {number} [days] days in this journey stage (1–DAYS_MAX; default 1; nodes and areas in "perDay" mode only)
 * @property {number} [lastAt] when this actor last gathered here (ms; 0 = never)
 * @property {number | null} [distance] grid spaces from the gatherer's token (null = no token on that scene)
 * @property {Node} [node]
 * @property {string} [sceneTier] the scene's tier id ("" = none)
 * @property {string} [sceneName]
 * @property {{ name: string, type: string, cr: number | null, dead: boolean, harvested: string[], npc: boolean }} [creature] `harvested`: the professions it was harvested for
 */

/**
 * Everything about one gather now: the DC, what it gives, what's wrong. The one decision for the window and the leader.
 * @param {GatherFacts} f
 */
export function assessGather(f) {
  const p = f.profession; const rules = f.rules; const problems = [];
  const learned = !!p && (p.tools.length === 0 || p.tools.some(t => (Number(f.facts.tools?.[t]) || 0) >= 1));
  if (!p) problems.push("That profession doesn't exist.");
  else if (!learned) problems.push(`Needs the ${p.name} profession.`);
  else if (!p.actions.includes("gather")) problems.push(`${p.name} doesn't gather (setup › Professions: its actions).`);
  const roll = p ? gatherRoll(p, f.facts) : null;
  if (p && learned && !roll) problems.push(`Needs proficiency with ${p.name}'s tool (it rolls the tool).`);
  /** @type {number | null} */
  let dc = null;
  let where = ""; let tierName = "";
  /** @type {ItemRef | null} */
  let item = null;
  /** @type {ItemRef | null} */
  let rare = null;
  let qty = rules.qty;
  /** @type {number | null} */
  let minBonus = null;
  const reachOk = () => {
    if (f.isGM || !rules.reach) return;
    if (f.distance === null || f.distance === undefined) problems.push("Your character needs a token on this scene, within reach.");
    else if (f.distance > rules.reach + 0.5) problems.push(`Too far: get within ${rules.reach} grid space${rules.reach === 1 ? "" : "s"}.`);
  };
  const onceOk = (/** @type {number} */ resetAt) => {
    if (f.once && f.lastAt && f.lastAt > Math.max(f.epoch ?? 0, resetAt)) problems.push("Already gathered here (until the GM resets the limits or the party travels on).");
  };
  if (f.kind === "node") {
    const n = f.node;
    if (!n || (n.hidden && !f.isGM)) problems.push("That node isn't there.");
    else {
      where = n.name;
      if (p && n.profession !== p.id) problems.push(`This node is for another profession.`);
      if (n.uses === 0) problems.push("This node is used up.");
      const tier = tierOf(rules, n.tier || f.sceneTier || "");
      tierName = tier?.name ?? "";
      dc = n.dc ?? tier?.dc ?? null;
      item = n.item; rare = n.rare; qty = n.qty ?? rules.qty; minBonus = n.minBonus;
      reachOk(); onceOk(n.resetAt);
    }
  } else if (f.kind === "area") {
    where = f.sceneName || "This area";
    if (!f.areaOn) problems.push("Gathering without a node is off in this world.");
    const tier = tierOf(rules, f.sceneTier ?? "");
    tierName = tier?.name ?? "";
    dc = tier?.dc ?? null;
    const row = p ? areaRow(rules, p.id, f.sceneTier ?? "") : null;
    item = row?.item ?? null; rare = row?.rare ?? null;
    if (!f.isGM && (f.distance === null || f.distance === undefined)) problems.push("Gathering in an area needs your character's token on this scene.");
    onceOk(0);
  } else {
    const c = f.creature;
    if (!c) problems.push("Target a defeated creature first.");
    else {
      where = c.name;
      if (!c.npc) problems.push("Only creatures (NPCs) can be harvested.");
      if (!c.dead) problems.push(`${c.name} isn't defeated.`);
      if (p && (c.harvested ?? []).includes(p.id)) problems.push(`${c.name} was already harvested for ${p.name}.`);
      const row = p ? creatureRow(rules, c.type, p.id) : null;
      if (p && !row) problems.push(`${p.name} has nothing to harvest from this kind of creature (setup › Gathering: Harvesting).`);
      dc = crDC(rules, c.cr); tierName = `CR ${crText(c.cr)}`;
      item = row?.item ?? null; rare = row?.rare ?? null; minBonus = row?.minBonus ?? null;
      reachOk();
    }
  }
  if (minBonus !== null && (f.facts.pb ?? 0) < minBonus) problems.push(`Needs a proficiency bonus of ${signed(minBonus)}.`);
  const dcText = dc === null ? "no DC set" : `DC ${dc}${tierName ? ` (${tierName})` : ""}`;
  // One check per stage: "perDay" gives `qty` for each day of it (nodes and areas; a creature is harvested once).
  const perDayMode = rules.qtyMode !== "flat" && f.kind !== "creature";
  const days = perDayMode ? clampDays(f.days ?? 1) : 1;
  return { ok: !problems.length, problems, dc, dcText, tierName, where, item, rare, qty: qty * days, perDay: qty, days, perDayMode, roll, rareMargin: rules.rareMargin };
}

/**
 * The result of a roll: success (no DC = success) and whether it beat the DC by the rare margin (needs a DC, a margin and a rare item).
 * @param {number} total @param {number | null} dc @param {number | null} margin @param {boolean} hasRare
 */
export function gatherOutcome(total, dc, margin, hasRare) {
  const success = dc === null || total >= dc;
  return { success, rare: success && hasRare && dc !== null && margin !== null && total >= dc + margin };
}

/**
 * What a success gives: `qty` of the item (with "perDay", already per day × days), or (rare) one rare item in place of one of them. Nothing on a failure, or with no item
 * set (the GM hands out what was found).
 * @param {{ item: ItemRef | null, rare: ItemRef | null, qty: number }} a @param {{ success: boolean, rare: boolean }} out
 * @returns {Array<{ ref: ItemRef, qty: number, rare: boolean }>}
 */
export function gains(a, out) {
  if (!out.success) return [];
  const list = [];
  if (out.rare && a.rare) list.push({ ref: a.rare, qty: 1, rare: true });
  const common = out.rare && a.rare ? a.qty - 1 : a.qty;
  if (a.item && common > 0) list.push({ ref: a.item, qty: common, rare: false });
  return list;
}

/** The node with one use spent (unlimited stays null). @param {Node} n */
export const spendUse = n => ({ ...n, uses: n.uses === null ? null : Math.max(0, n.uses - 1) });

/** A plain-text status of the rules for the health check and the setup page. @param {GatherRules} r */
export function gatherStatus(r) {
  const withDc = r.tiers.filter(t => t.dc !== null).length;
  return {
    set: [withDc ? `${withDc} of ${r.tiers.length} tier DCs` : "", r.rareMargin !== null ? `rare margin ${r.rareMargin}` : "", r.crBands.some(b => b.dc !== null) ? "creature DCs by CR" : "", r.creatures.length ? `${r.creatures.length} harvesting row${r.creatures.length === 1 ? "" : "s"}` : "", r.areas.length ? `${r.areas.length} area resource${r.areas.length === 1 ? "" : "s"}` : ""].filter(Boolean),
    unset: [withDc ? "" : "tier DCs", r.rareMargin === null ? "rare margin (off)" : "", r.crBands.some(b => b.dc !== null) ? "" : "creature DCs by CR"].filter(Boolean)
  };
}

/** The rules as JSON to keep or move. @param {unknown} stored */
export const exportGatherRules = stored => JSON.stringify({ format: GATHER_FORMAT, rules: normalizeGatherRules(stored) }, null, 2);

/** Reads pasted rules JSON. @param {string} text @returns {{ ok: true, rules: GatherRules } | { ok: false, error: string }} */
export function readGatherImport(text) {
  let o; try { o = JSON.parse(String(text ?? "")); } catch { return { ok: false, error: "That isn't JSON." }; }
  if (o?.format !== GATHER_FORMAT || !o.rules || typeof o.rules !== "object") return { ok: false, error: "That isn't a gathering rules export." };
  return { ok: true, rules: normalizeGatherRules(o.rules) };
}

/**
 * Problems for the health check: tiers, nodes and rows naming professions that don't exist or have no item.
 * @param {GatherRules} r @param {string[]} professionIds @param {Array<{ scene: string, node: Node }>} nodes
 */
export function gatherWarnings(r, professionIds, nodes = []) {
  const ids = new Set(professionIds); const out = [];
  const badNodes = nodes.filter(n => !ids.has(n.node.profession));
  if (badNodes.length) out.push(`Node${badNodes.length === 1 ? "" : "s"} for a profession that doesn't exist: ${badNodes.slice(0, 6).map(n => `${n.node.name} (${n.scene})`).join(", ")}.`);
  const noItem = nodes.filter(n => !n.node.item && !n.node.rare);
  if (noItem.length) out.push(`Node${noItem.length === 1 ? "" : "s"} with no resource item (a success gives nothing; the GM hands it out): ${noItem.slice(0, 6).map(n => n.node.name).join(", ")}.`);
  const tierIds = new Set(r.tiers.map(t => t.id));
  const badTier = nodes.filter(n => n.node.tier && !tierIds.has(n.node.tier));
  if (badTier.length) out.push(`Node${badTier.length === 1 ? "" : "s"} on a tier that was removed: ${badTier.slice(0, 6).map(n => n.node.name).join(", ")}.`);
  const rows = [...r.creatures, ...r.areas].filter(x => !ids.has(x.profession));
  if (rows.length) out.push(`${rows.length} harvesting / area row${rows.length === 1 ? "" : "s"} name a profession that doesn't exist.`);
  return out;
}

/** A node's map mark: one of our stroke icons (styles/nodes/<key>.svg). @param {string} icon */
export const nodeIconPath = icon => `modules/wanderers-guild/styles/nodes/${/^[a-z]+$/.test(icon) ? icon : "pick"}.svg`;
/** Node icon sizes on the map, in pixels. */
export const NODE_SIZE = Object.freeze({ min: 24, def: 48, max: 128 });

/**
 * The Note data for a new node (core Note, no journal entry): its label is the node's name, its picture our mark for the
 * profession's icon, `flags.wanderers-guild.node` the node.
 * @param {Node} node @param {{ x: number, y: number, icon: string, level?: string | null, size?: number }} at
 */
export function nodeNoteData(node, at) {
  const d = /** @type {Record<string, any>} */ ({
    x: Math.round(at.x), y: Math.round(at.y), text: node.name, global: true,
    iconSize: Math.min(NODE_SIZE.max, Math.max(NODE_SIZE.min, Math.round(Number(at.size) || NODE_SIZE.def))),
    texture: { src: nodeIconPath(at.icon) }, flags: { "wanderers-guild": { node } }
  });
  if (typeof at.level === "string" && at.level) d.levels = [at.level];
  return d;
}
/** The update that rewrites a node's Note. @param {Node} node @param {string} icon */
export const nodeNoteUpdate = (node, icon) => ({ text: node.name, "texture.src": nodeIconPath(icon), "flags.wanderers-guild.node": node });
