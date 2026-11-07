/**
 * The active GM's side of crafting (feature "crafting"): the request handlers that learn and forget recipes and make crafted items,
 * the craft chat card, and the card's GM buttons. Every actor write in the module happens here, and only in a handler, which core's
 * leader runs on the one writing GM client (`leader.isLeader()`); players and other GM tabs reach it with `leader.request()`.
 * Handlers check Foundry's sending user's rights (owns the actor, or is a GM) and re-check everything the window showed (`assess()`
 * in craft-model.mjs, from the same facts), never trusting the payload beyond ids.
 *
 * The tool check is rolled on the crafter's client (dnd5e `rollToolCheck`); the request names the roll's chat message and the leader
 * reads the total from that message (author = the sender, our flag names this actor and recipe, at most ROLL_MAX_AGE_MS old, not used
 * before, by its flag and by the leader's in-memory list; then it is marked used; a player's roll must also be one d20 plus the
 * character's own tool bonus, roll-model.mjs `verifyRoll`) and resolves the craft at once: the materials are taken from the inventory (on a failure too,
 * unless the rules keep them), and on a success the item is made. A craft with no DC set anywhere succeeds on the roll. Nothing waits
 * for a GM unless *GM approves each craft* is on. If the materials (or the coin) are gone by then, the craft is refused and nothing is
 * used. Crafts for one character are handled one after another, so two rolls can't spend the same stack. The d20's face itself can
 * still be forged by a client (as with any Foundry roll): turn on *GM approves each craft* if that matters at your table (then a
 * roll that can't be checked goes to the GM's card with the reason instead of being refused).
 *
 * Writes: `flags.wanderers-guild.recipes` on actors (known recipes), the crafted item (created, or added to a matching stack), the
 * materials' quantities (lowered or deleted), the coin cost (`system.currency`, or the toolkit's `pay`), `flags.wanderers-guild.rollUsed`
 * on roll messages and our craft cards (`flags.wanderers-guild.craft`). cleanup.mjs covers the flags and the cards. Untested in Node.
 */
import { ID, TITLE, HOOKS } from "./const.mjs";
import { S, leader, log, warn } from "./core.mjs";
import * as CM from "./craft-model.mjs";
import * as RC from "./recipes-model.mjs";
import * as Data from "./data.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Eco from "./economy.mjs";
import { verifyRoll, usedRolls } from "./roll-model.mjs";
import { context, assessIn } from "./craft-read.mjs";
import { cardHTML } from "./crafting-view.mjs";

/** Roll messages being handled (a second request for the same roll waits its turn and then finds it used). */
const BUSY = new Set();
/** Roll messages already used, kept on the leader for ROLL_MAX_AGE_MS (the message's `rollUsed` flag can be unset by its author). */
const USED = usedRolls(CM.ROLL_MAX_AGE_MS);
/** The last queued craft per actor UUID: crafts for one character run one after another. @type {Map<string, Promise<unknown>>} */
const QUEUE = new Map();

/**
 * Runs `fn` after the actor's earlier crafts have finished (failed ones too).
 * @template T @param {string} key @param {() => Promise<T>} fn @returns {Promise<T>}
 */
async function serial(key, fn) {
  const run = (QUEUE.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  QUEUE.set(key, tail);
  try { return await run; } finally { if (QUEUE.get(key) === tail) QUEUE.delete(key); }
}

/** @param {string} uuid */
async function actorOf(uuid) {
  try { const a = await fromUuid(uuid); return a instanceof Actor ? a : null; } catch { return null; }
}
/** @param {any} actor @param {any} user */
const owns = (actor, user) => !!user?.isGM || !!actor?.testUserPermission?.(user, "OWNER");
/** GM user ids. */
const gmIds = () => game.users.filter((/** @type {any} */ u) => u.isGM).map((/** @type {any} */ u) => u.id);

/**
 * A short whispered line to the user (and the GMs): how a refused request is answered, since the leader has no other way to reach
 * a player's screen.
 * @param {any} user @param {any} actor @param {string} text
 */
async function tell(user, actor, text) {
  try {
    await ChatMessage.create({ content: `<p class="wg-chat-line"><b>${TITLE}</b>: ${String(text).replace(/[<>&]/g, "")}</p>`, whisper: [...new Set([user.id, ...gmIds()])], speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined, flags: { [ID]: { notice: true } } });
  } catch (e) { warn("notice", e); }
}

// ------------------------------------------------------------------ learn / forget

/** @param {{ actor: string, recipe: string }} data @param {any} user */
async function onLearn(data, user) {
  const actor = await actorOf(data.actor); if (!actor) return log("learn: no such actor");
  if (!owns(actor, user)) return log(`learn refused: ${user.name} doesn't own ${actor.name}`);
  const recipe = Data.recipes().list.find(r => r.id === data.recipe); if (!recipe) return tell(user, actor, "That recipe no longer exists.");
  if (!user.isGM) {
    if (!S.get("playersLearn")) return tell(user, actor, "Only the GM teaches recipes in this world.");
    const a = assessIn(context(actor), recipe);
    if (!a.learned || !a.tool) return tell(user, actor, `${actor.name} doesn't have the profession for ${recipe.name}.`);
    if (!a.rankOk) return tell(user, actor, `${recipe.name} needs a higher rank.`);
  }
  const r = RC.learn(Data.known(actor), recipe.id);
  if (r.error || !r.known) return tell(user, actor, r.error ?? "Couldn't learn it.");
  if (!r.changed) return;
  await actor.setFlag(ID, "recipes", r.known);
  log(`${actor.name} learned ${recipe.name}`);
}

/** @param {{ actor: string, recipe: string }} data */
async function onForget(data) {
  const actor = await actorOf(data.actor); if (!actor) return;
  const r = RC.forget(Data.known(actor), data.recipe);
  if (r.changed) await actor.setFlag(ID, "recipes", r.known);
}

// ------------------------------------------------------------------ craft

/**
 * The roll's total when the chat message is a usable roll for this craft, else a reason.
 * @param {any} msg @param {any} user @param {any} actor @param {string} recipeId
 * @returns {{ total: number, whisper: string[] } | { error: string }}
 */
function readRoll(msg, user, actor, recipeId) {
  if (!msg) return { error: "The tool check's chat message is gone." };
  const authorId = msg.author?.id ?? msg.user?.id;
  if (authorId !== user.id) return { error: "That roll isn't yours." };
  const f = msg.flags?.[ID] ?? {};
  if (f.rollUsed || USED.has(msg.id)) return { error: "That roll was already used for a craft." };
  if (f.craftRoll?.recipe !== recipeId || f.craftRoll?.actor !== actor.uuid) return { error: "That roll wasn't made for this craft." };
  if (Date.now() - Number(msg.timestamp ?? 0) > CM.ROLL_MAX_AGE_MS) return { error: "That roll is too old; roll again." };
  const total = Number(msg.rolls?.[0]?.total);
  if (!Number.isFinite(total)) return { error: "The roll has no total." };
  return { total, whisper: Array.isArray(msg.whisper) ? [...msg.whisper] : [] };
}

/**
 * Makes the craft's changes to the actor. Success: the item (or more of a matching stack), then the materials and the coin cost.
 * Failure: the materials and coin only when the rules say they are lost. Returns what was used, for the card.
 * @param {any} actor @param {import("./recipes-model.mjs").Recipe} recipe @param {ReturnType<typeof assessIn>} a @param {boolean} success
 */
async function apply(actor, recipe, a, success) {
  const rules = Data.rules();
  const spend = CM.spends(success, rules);
  const inv = D5.inventory(actor);
  const consumed = spend ? CM.consumePlan(inv, recipe.materials) : { updates: [], deletes: [] };
  if (consumed.error || !consumed.updates || !consumed.deletes) throw new Error(consumed.error ?? "Missing materials.");
  /** @type {{ updates: Array<Record<string, any>>, deletes: string[] }} */
  const plan = { updates: consumed.updates, deletes: consumed.deletes };
  if (spend && a.charge && Eco.purse(actor) < a.charge) throw new Error("Not enough coin for the cost.");
  if (success) {
    const doc = await fromUuid(recipe.result.uuid);
    if (!doc || doc.documentName !== "Item") throw new Error("The result item can't be found.");
    const qty = recipe.result.qty;
    const stack = CM.stackOf(inv, { uuid: doc.uuid, name: doc.name, type: doc.type }, plan.deletes);
    if (stack) {
      const left = plan.updates.find(u => u._id === stack.id)?.["system.quantity"] ?? stack.qty;
      plan.updates = plan.updates.filter(u => u._id !== stack.id);
      plan.updates.push({ _id: stack.id, "system.quantity": left + qty });
    } else {
      const data = doc.pack ? game.items.fromCompendium(doc) : doc.toObject();
      delete data._id;
      if (data.system && "quantity" in data.system) data.system.quantity = qty;
      await actor.createEmbeddedDocuments("Item", [data]);
    }
  }
  const used = spend ? CM.usedList(recipe.materials) : [];
  if (plan.updates.length) await actor.updateEmbeddedDocuments("Item", plan.updates);
  if (plan.deletes.length) await actor.deleteEmbeddedDocuments("Item", plan.deletes);
  let coin = "";
  if (spend && a.charge) { await Eco.pay(actor, a.charge, `Crafting: ${recipe.name}`); coin = Eco.html(a.cost ?? 0); }
  return { used, coin };
}

/**
 * The card's view from its stored state.
 * @param {any} st @param {{ actor: any, recipe: import("./recipes-model.mjs").Recipe | undefined, timeText?: string, used?: string[], coin?: string, reason?: string }} x
 */
function cardView(st, x) {
  return cardHTML({
    state: st.state, actorName: x.actor?.name ?? "?", recipeName: x.recipe?.name ?? st.recipe, rarity: x.recipe ? RC.recipeRarity(x.recipe) : "",
    img: x.recipe?.result.img ?? "", qty: x.recipe?.result.qty ?? 1, toolLabel: D5.toolLabel(st.tool ?? ""), total: st.total ?? null, dc: st.dc ?? null,
    timeText: x.timeText ?? st.timeText ?? "", reason: x.reason ?? "", used: x.used ?? [], coin: x.coin ?? "", approvalAsked: !!st.approval
  });
}

/** Posts a craft card. @param {any} actor @param {any} st @param {string} content @param {string[]} whisper */
const postCard = (actor, st, content, whisper) => ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }), whisper, flags: { [ID]: { craft: st } } });

/** @param {{ actor: string, recipe: string, roll: string, helpers: number }} data @param {any} user */
async function onCraft(data, user) {
  if (BUSY.has(data.roll)) return log("craft: that roll is being handled");
  BUSY.add(data.roll);
  try { await serial(data.actor, () => craftNow(data, user)); } finally { BUSY.delete(data.roll); }
}

/** @param {{ actor: string, recipe: string, roll: string, helpers: number }} data @param {any} user */
async function craftNow(data, user) {
  const actor = await actorOf(data.actor); if (!actor) return log("craft: no such actor");
  if (!owns(actor, user)) return log(`craft refused: ${user.name} doesn't own ${actor.name}`);
  const recipe = Data.recipes().list.find(r => r.id === data.recipe); if (!recipe) return tell(user, actor, "That recipe no longer exists.");
  const msg = game.messages.get(data.roll);
  const roll = readRoll(msg, user, actor, recipe.id);
  if ("error" in roll) return tell(user, actor, `${recipe.name}: ${roll.error}`);
  USED.add(msg.id);
  await msg.setFlag(ID, "rollUsed", true);
  const a = assessIn(context(actor), recipe, data.helpers);
  const rules = Data.rules();
  // A player's roll must be the tool check with the character's own bonus (a GM's is trusted). With *GM approves each craft* on,
  // a roll that can't be checked goes to the GM's card with the reason instead of being refused.
  const bad = a.canCraft && a.tool && !user.isGM ? verifyRoll(D5.rollFacts(msg), { kind: "tool", key: a.tool.key, ...D5.checkBonus(actor, "tool", a.tool.key) }) : null;
  const unchecked = bad && !bad.ok ? bad.error : "";
  if (unchecked && !S.get("craftApproval")) return tell(user, actor, `${recipe.name}: nothing was made or used up. ${unchecked}`);
  const st = { v: CM.CARD_VERSION, state: "pending", actor: actor.uuid, recipe: recipe.id, user: user.id, roll: data.roll, tool: a.tool?.key ?? "", total: roll.total, dc: a.dc, helpers: data.helpers, whisper: roll.whisper, approval: !!S.get("craftApproval"), timeText: CM.hoursText(a.hours, rules.hoursPerDay), at: Date.now() };
  if (!a.canCraft) {
    st.state = "refused";
    return postCard(actor, st, cardView(st, { actor, recipe, reason: `Nothing was made or used up: ${a.problems.join(" ")}` }), st.whisper);
  }
  if (st.approval) {
    log(`craft ${recipe.name}: waiting for the GM's approval`);
    return postCard(actor, st, cardView(st, { actor, recipe, reason: unchecked ? `Roll not checked: ${unchecked}` : "" }), [...new Set([user.id, ...gmIds()])]);
  }
  await finish(actor, recipe, a, st, CM.outcome(roll.total, a.dc), null);
}

/**
 * Applies a decided craft and posts (or updates) its card; fires `wanderers-guild.crafted` here (ids only).
 * @param {any} actor @param {import("./recipes-model.mjs").Recipe} recipe @param {ReturnType<typeof assessIn>} a @param {any} st
 * @param {boolean} success @param {any} card an existing pending card, or null
 */
async function finish(actor, recipe, a, st, success, card) {
  let extras;
  try {
    const r = await apply(actor, recipe, a, success);
    st.state = success ? "done" : "failed";
    extras = { actor, recipe, used: r.used, coin: r.coin, reason: success ? "" : CM.spends(false, Data.rules()) ? "The check failed; the materials are used up." : "The check failed; the materials are kept." };
  } catch (e) {
    warn("craft", e);
    st.state = "error";
    extras = { actor, recipe, reason: `Nothing was made: ${String(/** @type {any} */ (e)?.message ?? e)}` };
  }
  const content = cardView(st, extras);
  const message = card ? await card.update({ content, whisper: st.whisper, [`flags.${ID}.craft`]: st }) : await postCard(actor, st, content, st.whisper);
  if (st.state === "done" || st.state === "failed") {
    try { Hooks.callAll(HOOKS.crafted, { actorId: actor.id, recipeId: recipe.id, success, messageId: message?.id ?? card?.id ?? null }); } catch (e) { warn("crafted hook", e); }
  }
}

/** @param {{ message: string, choice: string }} data */
async function onDecide(data) {
  const st0 = game.messages.get(data.message)?.flags?.[ID]?.craft;
  if (!st0?.actor) return log("decide: not a craft card");
  return serial(st0.actor, () => decideNow(data));
}

/** @param {{ message: string, choice: string }} data */
async function decideNow(data) {
  const card = game.messages.get(data.message);
  const st = card?.flags?.[ID]?.craft;
  if (!st || st.state !== "pending") return log("decide: not a pending craft card");
  const d = CM.decide(st, data.choice); if (!d) return log(`decide: ${data.choice} doesn't fit this card`);
  const actor = await actorOf(st.actor);
  const recipe = Data.recipes().list.find(r => r.id === st.recipe);
  const next = { ...st };
  if ("refuse" in d) { next.state = "refused"; await card.update({ content: cardView(next, { actor, recipe, reason: "The GM refused this craft: nothing was made or used." }), [`flags.${ID}.craft`]: next }); return; }
  if (!actor || !recipe) { next.state = "error"; await card.update({ content: cardView(next, { actor, recipe, reason: "The character or the recipe no longer exists." }), [`flags.${ID}.craft`]: next }); return; }
  const a = assessIn(context(actor), recipe, st.helpers);
  if (!a.canCraft) { next.state = "refused"; await card.update({ content: cardView(next, { actor, recipe, reason: `Nothing was made or used up: ${a.problems.join(" ")}` }), [`flags.${ID}.craft`]: next }); return; }
  await finish(actor, recipe, a, next, d.success, card);
}

/** Registers the handlers (every client; core runs them only on the leader). */
export function registerHandlers() {
  leader.handle("learnRecipe", onLearn);
  leader.handle("forgetRecipe", onForget);
  leader.handle("craft", onCraft);
  leader.handle("craftDecide", onDecide);
}

/**
 * The craft card's buttons: shown to GMs (a click asks the leader to decide), hidden from players. A hot hook: bails unless the
 * message is one of our craft cards.
 */
export function registerCardHook() {
  Hooks.on("renderChatMessageHTML", (/** @type {any} */ message, /** @type {HTMLElement} */ html) => {
    const st = message?.flags?.[ID]?.craft; if (!st || !html?.querySelectorAll) return;
    const gm = !!game.user?.isGM;
    for (const el of html.querySelectorAll(gm ? ".wg-player-only" : ".wg-gm-only")) el.remove();
    if (!gm || st.state !== "pending") return;
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (html.querySelectorAll("[data-wg-choice]"))) {
      b.addEventListener("click", ev => {
        ev.preventDefault();
        html.querySelectorAll("[data-wg-choice]").forEach(x => { /** @type {HTMLButtonElement} */ (x).disabled = true; });
        if (!leader.request("craftDecide", { message: message.id, choice: String(b.dataset.wgChoice) })) ui.notifications.warn(`${TITLE}: couldn't reach the writing GM client.`);
      });
    }
  });
}
