/**
 * Checking a player's roll on the leader, pure (tested in Node: tests/roll.test.mjs). Crafting and gathering checks are rolled on the
 * player's client and only the chat message's id travels to the active GM's client, which reads the roll from the message. The
 * message belongs to its author, so its content can be edited (or a message made by hand): the leader re-checks what it can.
 *
 * - `verifyRoll(facts, expect)`: the message's first roll has exactly one die, a d20 with one kept result from 1 to 20, it is the
 *   check the leader expects (skill / tool key and ability, when the message names them), and total − the d20's result equals the
 *   bonus the leader reads itself from the character's prepared data (dnd5e 6.0.6: `system.skills[key].total` /
 *   `system.tools[key].total`, which hold the ability modifier, the proficiency, every bonus and the condition reductions). A
 *   situational bonus typed in the roll dialog, a changed ability or proficiency dice can't be checked, so such a roll is refused.
 *   What remains on the honor system: the d20's face itself (a client can still write any 1–20 result).
 * - `usedRolls(maxAgeMs)`: the roll message ids the leader has already used, kept in memory for `maxAgeMs` (after that the age check
 *   refuses the roll anyway), next to the `rollUsed` flag on the message (which its author could unset).
 */

/**
 * Plain facts read from a roll's chat message (dnd5e.mjs `rollFacts`).
 * @typedef {object} RollFacts
 * @property {number} total the first roll's total
 * @property {Array<{ faces: number, results: Array<{ result: number, active: boolean }> }>} dice every die in the first roll (nested ones too)
 * @property {string | null} [skill] the message's `system.skill`
 * @property {string | null} [tool] the message's `system.tool`
 * @property {string | null} [ability] the message's `system.ability`
 */

/**
 * What the leader expects: the check (kind + key), its ability and the character's bonus, from prepared data.
 * @typedef {{ kind: "skill" | "tool", key: string, bonus: number | null, ability?: string | null }} RollExpect
 */

/** Signed number text ("+3", "−1"). @param {number} n */
const sgn = n => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/**
 * Whether the roll is the check the leader expects, with the character's own bonus.
 * @param {RollFacts | null | undefined} f @param {RollExpect} expect
 * @returns {{ ok: true, die: number, bonus: number } | { ok: false, error: string }}
 */
export function verifyRoll(f, expect) {
  const no = (/** @type {string} */ error) => ({ ok: /** @type {false} */ (false), error });
  if (!f || !Number.isFinite(f.total) || !Number.isInteger(f.total)) return no("The roll has no total.");
  const dice = Array.isArray(f.dice) ? f.dice : [];
  if (dice.length !== 1) return no("The roll has more than one die (proficiency dice or a dice bonus), so it can't be checked. Roll again without extra dice.");
  const d = dice[0];
  if (Number(d?.faces) !== 20) return no("The roll isn't a d20 check.");
  const results = Array.isArray(d.results) ? d.results : [];
  if (!results.length || !results.every(r => Number.isInteger(r?.result) && r.result >= 1 && r.result <= 20)) return no("The d20's result isn't valid.");
  const kept = results.filter(r => r.active !== false);
  if (kept.length !== 1) return no("The d20's result isn't valid.");
  const want = expect.kind === "tool" ? f.tool : f.skill;
  const other = expect.kind === "tool" ? f.skill : f.tool;
  if ((want && want !== expect.key) || (!want && other)) return no("That roll is for a different check.");
  if (f.ability && expect.ability && f.ability !== expect.ability) return no("The check was rolled with a different ability, which can't be checked. Roll again with the default ability.");
  if (expect.bonus === null || !Number.isFinite(expect.bonus)) return no("The character's check bonus can't be read.");
  const die = kept[0].result;
  const bonus = f.total - die;
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
