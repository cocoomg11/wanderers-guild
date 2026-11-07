/**
 * Checking a player's roll on the leader, pure (tested in Node: tests/roll.test.mjs). Crafting and gathering checks are rolled on the
 * player's client and only the chat message's id travels to the active GM's client, which reads the roll from the message. The
 * message belongs to its author, so its content can be edited (or a message made by hand): the leader re-checks what it can.
 *
 * - `verifyRoll(facts, expect)`: the message's first roll starts with a d20 with one kept result from 1 to 20, it is the check the
 *   leader expects (skill / tool key and ability, when the message names them), every other die term is one of the dice bonuses
 *   the leader sees on the character for that check (an effect's 1d4, say) with results in range, and total − the d20 − those
 *   dice equals the flat bonus the leader works out itself (0.3.3; dnd5e.mjs `checkBonus` mirrors dnd5e 6.0.6's
 *   `_buildSkillToolConfig`: ability modifier, flat proficiency, the combined `roll.bonus` fields and rules, condition
 *   reductions). A situational bonus or a die typed in the roll dialog, a changed ability or proficiency dice can't be checked, so
 *   such a roll is refused. What remains on the honor system: the dice faces themselves (a client can still write any 1–20 d20
 *   result, or any in-range bonus die result).
 * - `splitBonus(formula, evalFlat)`: a resolved bonus formula → flat number + dice terms.
 * - `usedRolls(maxAgeMs)`: the roll message ids the leader has already used, kept in memory for `maxAgeMs` (after that the age check
 *   refuses the roll anyway), next to the `rollUsed` flag on the message (which its author could unset).
 */

/**
 * Plain facts read from a roll's chat message (dnd5e.mjs `rollFacts`).
 * @typedef {object} RollFacts
 * @property {number} total the first roll's total
 * @property {Array<{ number?: number, faces: number, results: Array<{ result: number, active: boolean }> }>} dice every die term in
 *   the first roll (nested ones too); the first d20 is the check's
 * @property {string | null} [skill] the message's `system.skill`
 * @property {string | null} [tool] the message's `system.tool`
 * @property {string | null} [ability] the message's `system.ability`
 */

/**
 * One dice term of a bonus formula: `number` dice with `faces` faces, added (`sign` 1) or taken away (−1).
 * @typedef {{ number: number, faces: number, sign: 1 | -1 }} BonusDie
 */

/**
 * What the leader expects: the check (kind + key), its ability, the character's flat bonus and dice bonuses, from prepared data
 * (dnd5e.mjs `checkBonus`). `problem` = why the character's bonus can't be checked at all (proficiency dice, a formula that isn't
 * plain dice and numbers).
 * @typedef {{ kind: "skill" | "tool", key: string, bonus: number | null, ability?: string | null, dice?: BonusDie[], problem?: string | null }} RollExpect
 */

/** Signed number text ("+3", "−1"). @param {number} n */
const sgn = n => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/** "1d4", "2d6". @param {{ number?: number, faces: number }} d */
export const dieText = d => `${Number(d.number) || 1}d${d.faces}`;

/**
 * The top-level signed parts of a formula ("2 + 1d4 - (3)" → [[1, "2"], [1, "1d4"], [−1, "(3)"]]); null when brackets don't balance.
 * @param {string} formula
 * @returns {Array<[1 | -1, string]> | null}
 */
function signedParts(formula) {
  /** @type {Array<[1 | -1, string]>} */
  const out = [];
  let depth = 0, sign = /** @type {1 | -1} */ (1), cur = "";
  const flush = () => { if (cur.trim()) out.push([sign, cur.trim()]); cur = ""; sign = 1; };
  for (const ch of formula) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") { depth--; if (depth < 0) return null; }
    if (depth === 0 && (ch === "+" || ch === "-")) {
      if (cur.trim()) { flush(); }
      if (ch === "-") sign = /** @type {1 | -1} */ (-sign);
      continue;
    }
    cur += ch;
  }
  if (depth !== 0) return null;
  flush();
  return out;
}

/** Whether the text is one bracket pair around everything ("(1d4 + 2)", not "(1) + (2)"). @param {string} t */
function wrapped(t) {
  if (!t.startsWith("(") || !t.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")") { depth--; if (depth === 0 && i < t.length - 1) return false; }
  }
  return true;
}

/**
 * Splits a bonus formula whose data references are already replaced (dnd5e's `Roll.replaceFormulaData`) into a flat number and
 * dice terms: top-level `+` / `−` parts that are a number, `NdM` (flavor like `[radiant]` ignored) or a bracketed group of those.
 * Any other part goes to `evalFlat` (on the leader: a deterministic Foundry Roll, like dnd5e's `simplifyBonus`), which returns a
 * number or null; null (dice inside a function, a multiplied die, …) → `ok: false`.
 * @param {string} formula
 * @param {(part: string) => number | null} [evalFlat]
 * @returns {{ ok: true, flat: number, dice: BonusDie[] } | { ok: false, part: string }}
 */
export function splitBonus(formula, evalFlat = () => null) {
  let flat = 0;
  /** @type {BonusDie[]} */
  const dice = [];
  const parts = signedParts(String(formula ?? ""));
  if (!parts) return { ok: false, part: String(formula) };
  for (const [sign, raw] of parts) {
    const part = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (!part) continue;
    if (/^\d+(\.\d+)?$/.test(part)) { flat += sign * Number(part); continue; }
    const die = /^(\d*)d(\d+)$/i.exec(part);
    if (die) {
      const number = die[1] ? Number(die[1]) : 1, faces = Number(die[2]);
      if (number > 0 && faces > 0) { dice.push({ number, faces, sign }); continue; }
      return { ok: false, part: raw };
    }
    if (wrapped(part)) {
      const inner = splitBonus(part.slice(1, -1), evalFlat);
      if (!inner.ok) return inner;
      flat += sign * inner.flat;
      for (const d of inner.dice) dice.push({ ...d, sign: /** @type {1 | -1} */ (d.sign * sign) });
      continue;
    }
    const n = evalFlat(part);
    if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, part: raw };
    flat += sign * n;
  }
  return { ok: true, flat, dice };
}

/**
 * Whether the roll is the check the leader expects, with the character's own bonus. The first d20 is the check's die (one kept result
 * 1–20); every other die term must be one of the character's dice bonuses (`expect.dice`: same count and faces, each result
 * 1..faces) and every one of those must be in the roll; then total − d20 − the bonus dice (with their signs) = the flat bonus.
 * @param {RollFacts | null | undefined} f @param {RollExpect} expect
 * @returns {{ ok: true, die: number, bonus: number } | { ok: false, error: string }}
 */
export function verifyRoll(f, expect) {
  const no = (/** @type {string} */ error) => ({ ok: /** @type {false} */ (false), error });
  if (!f || !Number.isFinite(f.total) || !Number.isInteger(f.total)) return no("The roll has no total.");
  const all = Array.isArray(f.dice) ? f.dice : [];
  if (!all.length) return no("The roll has no d20, so it can't be checked.");
  // The check's d20 is the first d20 (Foundry may list dice from bracketed parts first).
  const at = all.findIndex(x => Number(x?.faces) === 20);
  if (at < 0) return no("The roll isn't a d20 check.");
  const d = all[at];
  const results = Array.isArray(d.results) ? d.results : [];
  if (!results.length || !results.every(r => Number.isInteger(r?.result) && r.result >= 1 && r.result <= 20)) return no("The d20's result isn't valid.");
  const kept = results.filter(r => r.active !== false);
  if (kept.length !== 1) return no("The d20's result isn't valid.");
  const want = expect.kind === "tool" ? f.tool : f.skill;
  const other = expect.kind === "tool" ? f.skill : f.tool;
  if ((want && want !== expect.key) || (!want && other)) return no("That roll is for a different check.");
  if (f.ability && expect.ability && f.ability !== expect.ability) return no("The check was rolled with a different ability, which can't be checked. Roll again with the default ability.");
  if (expect.problem) return no(expect.problem);
  if (expect.bonus === null || !Number.isFinite(expect.bonus)) return no("The character's check bonus can't be read.");
  // Extra dice: each must match one of the character's dice bonuses, once.
  const open = (Array.isArray(expect.dice) ? expect.dice : []).map(e => ({ ...e }));
  let extra = 0;
  for (const x of all.filter((_, i) => i !== at)) {
    const faces = Number(x?.faces);
    const rs = Array.isArray(x?.results) ? x.results : [];
    const active = rs.filter(r => r?.active !== false);
    const number = Number.isInteger(x?.number) ? Number(x.number) : active.length;
    const i = open.findIndex(e => e.faces === faces && e.number === number);
    if (i < 0) return no(`The roll has a die (${dieText({ number, faces })}) that isn't one of the character's bonuses. A die typed in the roll dialog or proficiency dice can't be checked: roll again without it.`);
    if (active.length !== number || !rs.every(r => Number.isInteger(r?.result) && r.result >= 1 && r.result <= faces)) return no(`The roll's ${dieText({ number, faces })} result isn't valid.`);
    extra += open[i].sign * active.reduce((s, r) => s + r.result, 0);
    open.splice(i, 1);
  }
  if (open.length) return no(`The roll is missing the character's dice bonus (${open.map(dieText).join(", ")}). Roll again from the window.`);
  const die = kept[0].result;
  const bonus = f.total - die - extra;
  if (bonus !== expect.bonus) return no(`The roll's bonus (${sgn(bonus)}) isn't the character's (${sgn(expect.bonus)}). A situational bonus can't be checked: roll again without one.`);
  return { ok: true, die, bonus };
}

/**
 * The roll message ids already used, remembered for `maxAgeMs` (in memory, on the leader's client).
 * @param {number} maxAgeMs
 */
export function usedRolls(maxAgeMs) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  const prune = (/** @type {number} */ now) => { for (const [id, at] of seen) if (now - at > maxAgeMs) seen.delete(id); };
  return {
    /** @param {string} id @param {number} [now] */
    has(id, now = Date.now()) { prune(now); return seen.has(id); },
    /** @param {string} id @param {number} [now] */
    add(id, now = Date.now()) { prune(now); seen.set(id, now); },
    get size() { return seen.size; }
  };
}
