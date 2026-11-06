/**
 * The rank table, pure (tested in Node: tests/ranks.test.mjs). A profession's rank is the character's proficiency bonus: each row
 * of the table names one bonus (+2 … +6 by default), what the rank is called and the highest item rarity it can craft. The GM
 * edits the names and rarities (and may add or remove rows) in the setup window; the table is stored in the world setting
 * `rankTable` and always read through `normalizeRanks`.
 *
 * Defaults are neutral: the rank names are plain English words, and the rarity per rank follows dnd5e's rarity order one step per
 * bonus. Nothing here is rules text; a GM who wants other numbers changes the table.
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";

export const RANKS_VERSION = 1;
/** The table holds at most this many rows (one per bonus). */
export const RANKS_MAX = 12;
export const RANK_NAME_MAX = 40;
/** Lowest and highest bonus a row may name. */
export const BONUS_MIN = 1;
export const BONUS_MAX = 20;

/** dnd5e's item rarity keys, lowest first ("" = no rarity limit shown). Labels are fallbacks; the UI uses CONFIG.DND5E.itemRarity. */
export const RARITIES = Object.freeze([
  { key: "common", label: "Common" },
  { key: "uncommon", label: "Uncommon" },
  { key: "rare", label: "Rare" },
  { key: "veryRare", label: "Very rare" },
  { key: "legendary", label: "Legendary" },
  { key: "artifact", label: "Artifact" }
]);
export const RARITY_KEYS = Object.freeze(RARITIES.map(r => r.key));

/**
 * @typedef {{ bonus: number, name: string, rarity: string }} RankRow
 * @typedef {{ v: number, rows: RankRow[] }} RankTable
 */

/** The shipped table: neutral names, one rarity step per bonus. */
export const DEFAULT_ROWS = Object.freeze([
  Object.freeze({ bonus: 2, name: "Novice", rarity: "common" }),
  Object.freeze({ bonus: 3, name: "Apprentice", rarity: "uncommon" }),
  Object.freeze({ bonus: 4, name: "Adept", rarity: "rare" }),
  Object.freeze({ bonus: 5, name: "Expert", rarity: "veryRare" }),
  Object.freeze({ bonus: 6, name: "Master", rarity: "legendary" })
]);

/** A fresh copy of the default table. @returns {RankTable} */
export const defaultRanks = () => ({ v: RANKS_VERSION, rows: DEFAULT_ROWS.map(r => ({ ...r })) });

/**
 * One row cleaned, or null. Bonus is a whole number in range; the name is trimmed and cut; an unknown rarity becomes "".
 * @param {unknown} raw
 * @returns {RankRow | null}
 */
export function cleanRow(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return null;
  const bonus = Math.round(Number(o.bonus));
  if (!Number.isFinite(bonus) || bonus < BONUS_MIN || bonus > BONUS_MAX) return null;
  const name = String(o.name ?? "").replace(/\s+/g, " ").trim().slice(0, RANK_NAME_MAX) || `Rank +${bonus}`;
  const rarity = RARITY_KEYS.includes(String(o.rarity)) ? String(o.rarity) : "";
  return { bonus, name, rarity };
}

/**
 * Reads whatever is stored into the current shape: rows sorted by bonus, one row per bonus (the first one wins), at most
 * `RANKS_MAX`. Missing, empty or unreadable values give the default table. Never throws.
 * @type {(raw: unknown) => RankTable}
 */
export const normalizeRanks = versioned({
  version: RANKS_VERSION,
  empty: defaultRanks,
  clean: t => {
    const seen = new Set();
    const rows = (Array.isArray(t?.rows) ? t.rows : []).map(cleanRow).filter(/** @returns {r is RankRow} */ r => !!r && !seen.has(r.bonus) && !!seen.add(r.bonus));
    rows.sort((a, b) => a.bonus - b.bonus);
    return rows.length ? { v: RANKS_VERSION, rows: rows.slice(0, RANKS_MAX) } : defaultRanks();
  }
});

/**
 * The proficiency bonus at a character level by the SRD 5.2 table (+2 at levels 1–4, +1 every four levels after), or null for a
 * level that isn't a whole number from 1 to 20.
 * @param {unknown} level
 */
export function bonusAtLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return 2 + Math.floor((n - 1) / 4);
}

/**
 * The first character level with this proficiency bonus by the SRD 5.2 table, or null (a bonus no level 1–20 has).
 * @param {number} bonus
 */
export function levelForBonus(bonus) {
  if (!Number.isInteger(bonus) || bonus < 2 || bonus > 6) return null;
  return 4 * (bonus - 2) + 1;
}

/**
 * A rarity's label: from `labels` (the system's own, e.g. CONFIG.DND5E.itemRarity) when given, else ours; "" stays "".
 * @param {string} key
 * @param {Record<string, string>} [labels]
 */
export function rarityLabel(key, labels = {}) {
  if (!key) return "";
  return labels[key] || RARITIES.find(r => r.key === key)?.label || key;
}

/**
 * The rank for a proficiency bonus: the row with the highest bonus at or below it. `index` is -1 (and `row` null) when the bonus
 * is below the lowest row. `next` is the row after it (or the first row when below), null at the top.
 * @param {unknown} pb
 * @param {RankTable} table a normalized table
 * @returns {{ row: RankRow | null, index: number, next: RankRow | null }}
 */
export function rankFor(pb, table) {
  const rows = table.rows;
  const n = Number(pb);
  let index = -1;
  if (Number.isFinite(n)) rows.forEach((r, i) => { if (r.bonus <= n) index = i; });
  return { row: index >= 0 ? rows[index] : null, index, next: rows[index + 1] ?? null };
}

/**
 * The ladder for the view: one step per row, `state` "past" (below the current rank), "on" (the current rank) or "" (above).
 * @param {unknown} pb
 * @param {RankTable} table
 * @param {Record<string, string>} [labels] rarity labels
 */
export function ladder(pb, table, labels = {}) {
  const { index } = rankFor(pb, table);
  return table.rows.map((r, i) => ({ bonus: r.bonus, name: r.name, rarity: r.rarity, rarityLabel: rarityLabel(r.rarity, labels), state: i === index ? "on" : i < index ? "past" : "" }));
}

/** "+3" for 3, "−1" for -1 (a real minus sign), "+0" for 0. @param {number} n */
export const signed = n => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/**
 * The "next rank" line: "Adept +4 at level 9 · crafts up to Rare". The level part is shown only when the character's bonus is the
 * standard one for its level (so a bonus raised or lowered by an effect never shows a wrong level). At the top: "Highest rank".
 * @param {{ pb: unknown, level?: unknown }} who
 * @param {RankTable} table
 * @param {Record<string, string>} [labels]
 */
export function nextRankText(who, table, labels = {}) {
  const { next } = rankFor(who.pb, table);
  if (!next) return "Highest rank";
  const at = bonusAtLevel(who.level) === Number(who.pb) ? levelForBonus(next.bonus) : null;
  const when = at ? ` at level ${at}` : ` at proficiency bonus ${signed(next.bonus)}`;
  const rar = next.rarity ? ` · crafts up to ${rarityLabel(next.rarity, labels)}` : "";
  return `${next.name} ${signed(next.bonus)}${when}${rar}`;
}

/**
 * Problems a GM should see in the setup window and the health check (plain sentences; empty when fine): rarities that go down as
 * the bonus goes up, and a table with no row at +2 or lower (new characters would have no rank).
 * @param {RankTable} table
 * @returns {string[]}
 */
export function rankWarnings(table) {
  const out = [];
  const rows = table.rows;
  if (rows.length && rows[0].bonus > 2) out.push(`The lowest rank needs a proficiency bonus of ${signed(rows[0].bonus)}, so level 1 characters have no rank yet.`);
  let best = -1;
  for (const r of rows) {
    const i = RARITY_KEYS.indexOf(r.rarity);
    if (i < 0) continue;
    if (i < best) out.push(`${r.name} (${signed(r.bonus)}) crafts a lower rarity than a rank below it.`);
    best = Math.max(best, i);
  }
  return out;
}
