/**
 * Prices: book values (the standard dnd5e coins) by default, or the world's own coins through the Wanderer's Toolkit when the
 * *Prices in the world's coins* switch is on and the toolkit is active. The toolkit is read only through its public API
 * (`coinRatio()`, `moneyHTML()`, `pay(actor, amount, { reason })`), defensively; it is never required. Untested in Node (reads
 * CONFIG and the toolkit); the money maths are in craft-model.mjs.
 */
import { coins } from "../vendor/wanderers-core/index.mjs";
import { TOOLKIT_ID } from "./const.mjs";
import { S, log } from "./core.mjs";
import { BOOK_VALUES, payPlan, purseTotal } from "./craft-model.mjs";
import * as D5 from "./dnd5e.mjs";

/** The toolkit's API when it is active. */
const toolkit = () => { const m = game.modules.get(TOOLKIT_ID); return m?.active ? /** @type {any} */ (m).api ?? null : null; };

/** Whether prices use the world's coins (the switch is on and the toolkit is active). */
export const world = () => !!S.get("worldCoins") && !!toolkit();

/** The coin values prices are read in. */
export const values = () => (world() ? D5.coinValues() : { ...BOOK_VALUES });

/** What the prices are, for the window's note. */
export const note = () => (world() ? "the world's coins" : "book values");

/**
 * An amount (in the smallest coin of `values()`) as coin markup: the toolkit's `moneyHTML` for the world's coins, else core's
 * coins at 10 to 1. @param {number} amount
 */
export function html(amount) {
  const tk = world() ? toolkit() : null;
  if (tk && typeof tk.moneyHTML === "function") { try { return String(tk.moneyHTML(amount)); } catch (e) { log("toolkit moneyHTML", e); } }
  const ratio = world() && typeof tk?.coinRatio === "function" ? Number(tk.coinRatio()) || 10 : 10;
  return coins(amount, { ratio });
}

/** An actor's coin in the world's smallest coin. @param {any} actor */
export const purse = actor => purseTotal(actor?.system?.currency ?? {}, D5.coinValues());

/**
 * Takes `amount` (world's smallest coin) from the actor (active GM's client). The toolkit's `pay` when it is active (it logs the
 * reason in its coin log), else our own change-giving plan. Resolves to true, or throws on a shortfall.
 * @param {any} actor @param {number} amount @param {string} reason
 */
export async function pay(actor, amount, reason) {
  if (!(amount > 0)) return true;
  if (purse(actor) < amount) throw new Error("not enough coin");
  const tk = toolkit();
  // The toolkit's pay (2.3.2+) returns false and takes nothing on a short purse; older ones return nothing.
  if (tk && typeof tk.pay === "function") { if (await tk.pay(actor, amount, { reason }) === false) throw new Error("not enough coin"); return true; }
  const plan = payPlan(actor.system?.currency ?? {}, amount, D5.coinValues());
  if (plan.error || !plan.currency) throw new Error(plan.error ?? "not enough coin");
  await actor.update({ "system.currency": plan.currency });
  return true;
}
