/**
 * The active GM's side of gathering (feature "gathering"): the `gather` and `gatherReset` request handlers and the toolkit journey
 * listener. Every gathering write happens here, run by core's leader on the one writing GM client: the resources added to the
 * character (or to a matching stack), the character's limits (`flags.wanderers-guild.gathered`), a node's uses (its Note's flag),
 * a harvested creature's mark (`flags.wanderers-guild.harvested` on its token), `rollUsed` on the roll message, the gather card
 * (`flags.wanderers-guild.gather`) and, after a journey, the world's reset record. The handler checks Foundry's sending user (owns
 * the actor, or is a GM), reads the roll from its chat message (author, our `gatherRoll` flag for this actor, profession and target,
 * age, not used before: the `rollUsed` flag and an in-memory list of used rolls), caps a player's days at the last journey's
 * (`allowedDays`), re-runs `assessGather()` from the same facts the window used and checks a player's roll (one d20, the
 * character's own bonus: roll-model.mjs `verifyRoll`). Untested in Node.
 */
import { ID, TITLE, HOOKS, TOOLKIT_ID } from "./const.mjs";
import { S, leader, log, warn } from "./core.mjs";
import * as GM from "./gather-model.mjs";
import * as Data from "./data.mjs";
import * as D5 from "./dnd5e.mjs";
import { verifyRoll, usedRolls } from "./roll-model.mjs";
import { stackOf } from "./craft-model.mjs";
import { gatherFacts, rollLabel } from "./gather-read.mjs";
import { gatherCardHTML } from "./gather-view.mjs";

/** The toolkit's journey hook (fired on its writing GM client after a trip; ids only). */
export const JOURNEY_HOOK = "wayfarersToolkit.journey";

const BUSY = new Set();
/** Roll messages already used, kept on the leader for ROLL_MAX_AGE_MS (the message's `rollUsed` flag can be unset by its author). */
const USED = usedRolls(GM.ROLL_MAX_AGE_MS);
/** @type {Map<string, Promise<unknown>>} */
const QUEUE = new Map();
/** Runs gathers for one actor one after another. @template T @param {string} key @param {() => Promise<T>} fn @returns {Promise<T>} */
async function serial(key, fn) {
  const run = (QUEUE.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  QUEUE.set(key, tail);
  try { return await run; } finally { if (QUEUE.get(key) === tail) QUEUE.delete(key); }
}

const gmIds = () => game.users.filter((/** @type {any} */ u) => u.isGM).map((/** @type {any} */ u) => u.id);
/** @param {string} uuid */
async function docOf(uuid) { try { return await fromUuid(uuid); } catch { return null; } }

/** @param {any} user @param {any} actor @param {string} text */
async function tell(user, actor, text) {
  try {
    await ChatMessage.create({ content: `<p class="wg-chat-line"><b>${TITLE}</b>: ${String(text).replace(/[<>&]/g, "")}</p>`, whisper: [...new Set([user.id, ...gmIds()])], speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined, flags: { [ID]: { notice: true } } });
  } catch (e) { warn("notice", e); }
}

/** The target string a roll was made for: the node's or token's UUID, or "scene:<id>". @param {{ node?: string, scene?: string, token?: string }} d */
export const targetKey = d => d.node ?? d.token ?? (d.scene ? `scene:${d.scene}` : "");

/**
 * The roll's total when the message is a usable gather roll for this request, else a reason.
 * @param {any} msg @param {any} user @param {any} actor @param {string} profession @param {string} target
 */
function readRoll(msg, user, actor, profession, target) {
  if (!msg) return { error: "The check's chat message is gone." };
  if ((msg.author?.id ?? msg.user?.id) !== user.id) return { error: "That roll isn't yours." };
  const f = msg.flags?.[ID] ?? {};
  if (f.rollUsed || USED.has(msg.id)) return { error: "That roll was already used." };
  const g = f.gatherRoll;
  if (g?.actor !== actor.uuid || g?.profession !== profession || g?.target !== target) return { error: "That roll wasn't made for this." };
  if (Date.now() - Number(msg.timestamp ?? 0) > GM.ROLL_MAX_AGE_MS) return { error: "That roll is too old; roll again." };
  const total = Number(msg.rolls?.[0]?.total);
  if (!Number.isFinite(total)) return { error: "The roll has no total." };
  return { total, whisper: Array.isArray(msg.whisper) ? [...msg.whisper] : [] };
}

/**
 * Whether the roll is the check `assessGather` expects, with the character's own bonus (roll-model.mjs `verifyRoll`).
 * @param {any} msg @param {any} actor @param {{ kind: "skill" | "tool", key: string } | null} expected
 * @returns {string | null} the reason it is refused, or null
 */
function checkRoll(msg, actor, expected) {
  if (!expected || actor === null) return null; // assessGather refuses it with its own reason
  const v = verifyRoll(D5.rollFacts(msg), { kind: expected.kind, key: expected.key, ...D5.checkBonus(actor, expected.kind, expected.key) });
  return v.ok ? null : v.error;
}

/**
 * Adds `qty` of an item to the actor: onto a consumable / loot stack of the same item (source, else type and name), else as a new item.
 * @param {any} actor @param {GM.ItemRef} ref @param {number} qty
 */
async function addItem(actor, ref, qty) {
  const doc = await fromUuid(ref.uuid);
  if (!doc || doc.documentName !== "Item") throw new Error(`The item ${ref.name || ref.uuid} can't be found.`);
  const stack = stackOf(D5.inventory(actor), { uuid: doc.uuid, name: doc.name, type: doc.type });
  if (stack) { await actor.updateEmbeddedDocuments("Item", [{ _id: stack.id, "system.quantity": stack.qty + qty }]); return { name: doc.name, img: doc.img }; }
  const data = doc.pack ? game.items.fromCompendium(doc) : doc.toObject();
  delete data._id;
  if (data.system && "quantity" in data.system) data.system.quantity = qty;
  await actor.createEmbeddedDocuments("Item", [data]);
  return { name: doc.name, img: doc.img };
}

/** @typedef {{ actor: string, profession: string, roll: string, days: number, node?: string, scene?: string, token?: string }} GatherData */
/** @param {GatherData} data @param {any} user */
async function onGather(data, user) {
  if ([data.node, data.scene, data.token].filter(Boolean).length !== 1) return log("gather: needs exactly one target");
  if (BUSY.has(data.roll)) return log("gather: that roll is being handled");
  BUSY.add(data.roll);
  // One gather per character at a time; a creature is also handled one gather at a time (its marks are per profession).
  const run = () => gatherNow(data, user);
  try { await serial(data.actor, data.token ? () => serial(`token:${data.token}`, run) : run); } finally { BUSY.delete(data.roll); }
}

/** @param {GatherData} data @param {any} user */
async function gatherNow(data, user) {
  const actor = await docOf(data.actor);
  if (!(actor instanceof Actor)) return log("gather: no such actor");
  if (!user.isGM && !actor.testUserPermission?.(user, "OWNER")) return log(`gather refused: ${user.name} doesn't own ${actor.name}`);
  /** @type {{ note?: any, scene?: any, token?: any }} */
  const target = {};
  if (data.node) { const n = await docOf(data.node); if (n?.documentName !== "Note") return tell(user, actor, "That gathering node is gone."); target.note = n; }
  if (data.token) { const t = await docOf(data.token); if (t?.documentName !== "Token" || !t.actor) return tell(user, actor, "That creature is gone."); target.token = t; }
  if (data.scene) { const s = game.scenes.get(data.scene); if (!s) return tell(user, actor, "That scene is gone."); target.scene = s; }
  const msg = game.messages.get(data.roll);
  const roll = readRoll(msg, user, actor, data.profession, targetKey(data));
  if ("error" in roll) return tell(user, actor, String(roll.error));
  USED.add(msg.id);
  await msg.setFlag(ID, "rollUsed", true);
  // A player's days are capped by the last journey's (1 without one); a GM's are taken as sent.
  const days = GM.allowedDays(data.days, { isGM: !!user.isGM, journeyDays: Data.journeyDays() });
  const f = gatherFacts(actor, data.profession, target, { isGM: !!user.isGM, days });
  const a = GM.assessGather(f);
  // A GM's roll is trusted (a GM can change anything anyway); a player's must be the check with the character's own bonus.
  const bad = a.ok && !user.isGM ? checkRoll(msg, actor, a.roll) : null;
  if (bad) return tell(user, actor, `Nothing was gathered: ${bad}`);
  const profName = f.profession?.name ?? data.profession;
  /** @type {import("./gather-view.mjs").GatherCard} */
  const card = { state: "error", actorName: actor.name, professionName: profName, kind: f.kind, where: a.where, rollText: rollLabel(a.roll), total: roll.total, dc: a.dc, tierName: a.tierName, rare: false, items: [], noItem: false, perDay: a.perDayMode ? a.perDay : null, days: a.perDayMode ? a.days : null };
  if (!a.ok) return post(actor, { ...card, reason: `Nothing was gathered: ${a.problems.join(" ")}` }, roll.whisper, f, data);
  const out = GM.gatherOutcome(roll.total, a.dc, a.rareMargin, !!a.rare);
  const gains = GM.gains(a, out);
  try {
    for (const g of gains) { const made = await addItem(actor, g.ref, g.qty); card.items.push({ name: made.name, img: made.img, qty: g.qty, rare: g.rare }); }
    card.state = out.success ? "done" : "failed"; card.rare = out.rare; card.noItem = out.success && !gains.length;
    if (!out.success) card.reason = "The check failed.";
  } catch (e) { warn("gather", e); card.reason = `Something went wrong: ${String(/** @type {any} */ (e)?.message ?? e)}`; }
  // The limits count a check made (success or failure), as one check per stage; a node's uses count successes only.
  const now = Date.now();
  if (f.key) await actor.setFlag(ID, "gathered", GM.withMark(Data.gathered(actor), f.key, now));
  if (target.note && out.success && f.node?.uses !== null && f.node?.uses !== undefined) await target.note.setFlag(ID, "node", GM.spendUse(f.node));
  if (target.token && out.success) await target.token.setFlag(ID, "harvested", GM.withHarvest(target.token.flags?.[ID]?.harvested, { actor: actor.uuid, profession: data.profession, at: now }));
  return post(actor, card, roll.whisper, f, data);
}

/**
 * Posts the card and fires `wanderers-guild.gathered` (ids only) for a decided gather.
 * @param {any} actor @param {import("./gather-view.mjs").GatherCard} card @param {string[]} whisper @param {any} f @param {any} data
 */
async function post(actor, card, whisper, f, data) {
  const st = { v: 1, state: card.state, actor: actor.uuid, profession: data.profession, kind: f.kind, target: targetKey(data), total: card.total, dc: card.dc, rare: card.rare, days: card.days ?? null, at: Date.now() };
  const message = await ChatMessage.create({ content: gatherCardHTML(card), speaker: ChatMessage.getSpeaker({ actor }), whisper, flags: { [ID]: { gather: st } } });
  if (card.state === "done" || card.state === "failed") {
    try { Hooks.callAll(HOOKS.gathered, { actorId: actor.id, professionId: data.profession, kind: f.kind, success: card.state === "done", rare: card.rare, messageId: message?.id ?? null }); } catch (e) { warn("gathered hook", e); }
  }
}

/** Registers the handlers (every client; core runs them only on the leader). */
export function registerHandlers() {
  leader.handle("gather", onGather);
  leader.handle("gatherReset", async (/** @type {{ days?: number }} */ d) => { await Data.resetGatherLimits(d?.days ? GM.clampDays(d.days) : null); log("gathering limits reset (relayed)"); });
}

/**
 * The toolkit's journey hook (setting *Travel resets gathering limits*): fired on the toolkit's writing GM client. The writing
 * client resets at once; another GM tab relays to it. Read defensively: the event, plus `hours` (a positive number, turned into
 * days with `daysFromHours`; anything else = no days) to prefill the Gather window's *Days in this stage* on every client.
 */
export function registerJourneyHook() {
  Hooks.on(JOURNEY_HOOK, (/** @type {any} */ payload) => {
    if (!S.get("gatherJourney") || !game.user?.isGM || !game.modules.get(TOOLKIT_ID)?.active) return;
    const days = GM.daysFromHours(payload && typeof payload === "object" ? payload.hours : null);
    if (leader.isLeader()) Data.resetGatherLimits(days).then(() => log(`gathering limits reset after a journey${days ? ` (${days} day${days === 1 ? "" : "s"})` : ""}`)).catch(e => warn("journey reset", e));
    else leader.request("gatherReset", days ? { days } : {});
  });
}
