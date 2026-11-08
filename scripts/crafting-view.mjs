/**
 * The Crafting window's two pages (Craft and Recipes) and the craft chat card, as HTML strings, pure (tested in Node:
 * tests/crafting-views.test.mjs). Built from plain models that crafting.mjs and craft-leader.mjs assemble from `assess()`
 * (craft-model.mjs). The window uses the Professions window's dark palette (`.wg-prof`). Coin amounts come in as HTML from the
 * caller's `money(amount)` (core's coin markup, or the Wanderer's Toolkit's `moneyHTML`), so this file stays pure. Every other value
 * is escaped. Buttons carry `data-action`; crafting.mjs handles them. Kept as plain strings so another host (a sheet page) can show
 * them later.
 */
import { esc } from "./const.mjs";
import { quality, itemSlot, UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { hoursText, usesNotice } from "./craft-model.mjs";
import { signed } from "./ranks-model.mjs";
import { ICONS } from "./professions-model.mjs";
import { LEARN_SECTIONS, visibleRows } from "./learn-model.mjs";

const svg = (/** @type {string} */ d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${esc(d)}"></path></svg>`;
/** The quality colour key for a rarity (mundane shows like common). @param {string} rarity */
export const qualityOf = rarity => (rarity ? quality(rarity) : "common");

/** What a status means, for the list and the legend. */
export const STATUS = Object.freeze({
  ok: { label: "can craft", cls: "wg-st-ok" },
  missing: { label: "missing something", cls: "wg-st-miss" },
  rank: { label: "needs a higher rank", cls: "wg-st-rank" },
  unknown: { label: "recipe unknown", cls: "wg-st-unk" }
});

/** The note under every time line. */
export const TIME_NOTE = "in game, for reference: the calendar is not advanced";

/**
 * @typedef {ReturnType<typeof import("./craft-model.mjs").assess>} Assessed
 * @typedef {Assessed & { group: string, img: string, notes: string, qty: number, toolTotal: string, source: string, route?: string, learnState?: string, hasItem?: boolean, itemUuid?: string, itemName?: string }} Row
 *   `learnState` (learn-model.mjs `learnState`): known, learn, item, teach, rank, needsItem, gm; `itemUuid`: a carried recipe item
 *   that teaches it
 * @typedef {object} CraftView
 * @property {"craft" | "recipes"} mode
 * @property {string} actorName
 * @property {{ id: string, name: string, icon: string }} profession
 * @property {string} rankText e.g. "Apprentice +3"
 * @property {string} craftsUpTo
 * @property {boolean} gm
 * @property {boolean} playersLearn
 * @property {boolean} [hideUnknown] *Recipes not known yet* is on Hide (players see only known recipes)
 * @property {string} economyNote
 * @property {string} query
 * @property {"all" | "can"} filter
 * @property {Row[]} rows
 * @property {string | null} selected
 * @property {number} helpers
 * @property {number} helpersMax
 * @property {boolean} helperDivides
 * @property {number | null} hoursPerDay
 * @property {string} failText
 * @property {string} [failRule] "lose" (default) or "keep": what a failure does to the materials
 * @property {boolean} approval
 * @property {boolean} noGM no GM is connected
 * @property {boolean} [locked] a craft is under way, or this user only observes the actor
 * @property {(amount: number) => string} money
 */

/** Rows matching the search box (name or group). @param {Row[]} rows @param {string} q */
export function searchRows(rows, q) {
  const s = String(q ?? "").trim().toLowerCase();
  return s ? rows.filter(r => r.name.toLowerCase().includes(s) || r.group.toLowerCase().includes(s)) : rows;
}

/** Rows grouped by `group`, groups in first-seen order. @param {Row[]} rows */
export function groupRows(rows) {
  /** @type {Map<string, Row[]>} */
  const by = new Map();
  for (const r of rows) by.set(r.group, [...(by.get(r.group) ?? []), r]);
  return [...by].map(([label, list]) => ({ label, rows: list }));
}

/** The window's tabs and band. @param {CraftView} v @param {string} body */
function frame(v, body) {
  const tab = (/** @type {string} */ id, /** @type {string} */ label) => `<button type="button" class="wg-tab${v.mode === id ? " on" : ""}" data-action="wgMode" data-mode="${id}" role="tab" aria-selected="${v.mode === id}">${esc(label)}</button>`;
  return `<div class="wg-prof wg-craft">
    <header class="wg-head"><span class="wg-ico" aria-hidden="true">${svg(v.profession.icon || ICONS.hammer.d)}</span>
      <div class="wg-grow"><h2 class="wg-ttl">${esc(v.profession.name)}</h2><p class="wg-sub">${esc(v.actorName)} · <b class="wg-gold">${esc(v.rankText)}</b>${v.craftsUpTo ? ` · crafts up to ${esc(v.craftsUpTo)}` : ""}</p></div>
      <nav class="wg-tabs" role="tablist" aria-label="Crafting pages">${tab("craft", "Craft")}${tab("recipes", "Recipes")}</nav></header>
    ${v.noGM ? `<p class="wg-banner" role="status">No GM is connected: crafting and learning wait for a GM.</p>` : ""}
    ${body}</div>`;
}

/** One list row on the Craft page. @param {Row} r @param {string | null} sel */
function listRow(r, sel) {
  const st = STATUS[/** @type {keyof typeof STATUS} */ (r.status)] ?? STATUS.missing;
  const small = r.status === "rank" && r.need ? `needs ${r.need.name} ${signed(r.need.bonus)}` : st.label;
  return `<button type="button" class="wg-rl ${st.cls}${r.id === sel ? " sel" : ""}" data-action="wgPick" data-id="${esc(r.id)}" aria-pressed="${r.id === sel}" aria-label="${esc(`${r.name}, ${r.rarityLabel}, ${small}`)}">
    <span class="wg-nm wc-q-text" data-quality="${esc(qualityOf(r.rarity))}">${esc(r.name)}</span><small>${esc(small)}</small></button>`;
}

/** The Craft page's detail side. @param {CraftView} v @param {Row} r */
function detailHTML(v, r) {
  const st = STATUS[/** @type {keyof typeof STATUS} */ (r.status)] ?? STATUS.missing;
  const q = qualityOf(r.rarity);
  const head = `<section class="wg-box"><div class="wg-res">
    ${itemSlot({ img: r.img || "icons/svg/item-bag.svg", name: r.name, rarity: q, size: "lg", count: r.qty })}
    <div class="wg-grow"><b class="wg-pname wc-q-text" data-quality="${esc(q)}">${esc(r.name)}</b>
      <span class="wg-dim">${esc(r.rarityLabel)}${r.consumable ? " · consumable" : ""}${r.qty > 1 ? ` · makes ${r.qty}` : ""}${r.source === "everyone" ? " · known by everyone with the profession" : ""}</span>
      ${r.price !== null ? `<span class="wg-dim">Value ${v.money(r.price)} · ${esc(v.economyNote)}</span>` : ""}</div>
    <span class="wg-dk ${st.cls}"><i aria-hidden="true"></i>${esc(st.label)}</span></div>
    ${r.notes ? `<p class="wg-note wg-pad">${esc(r.notes)}</p>` : ""}</section>`;
  const mats = r.materials.length
    ? r.materials.map(m => `<li class="wg-mat"><span class="wg-nm">${esc(m.name)}</span><b class="${m.ok ? "wg-pos" : "wg-neg"}">${m.have} / ${m.need}</b></li>`).join("")
    : `<li class="wg-mat"><span class="wg-dim">No materials listed.</span></li>`;
  const uses = usesNotice(r.materials, { fail: v.failRule ?? "lose", charge: r.charge > 0, approval: v.approval });
  const time = r.hours === null ? `<span class="wg-dim">not set (Crafting rules)</span>`
    : `${esc(hoursText(r.hours, v.hoursPerDay))}${r.timeNotes.length ? ` <span class="wg-dim">(${esc(r.timeNotes.join(", "))})</span>` : ""} <span class="wg-dim">· ${esc(TIME_NOTE)}</span>`;
  const rankLine = !r.rarity ? `Any <span class="wg-dim">(mundane)</span>`
    : r.need ? `${esc(r.need.name)} ${signed(r.need.bonus)} or higher <span class="${r.rankOk ? "wg-pos" : "wg-neg"}">(you: ${esc(v.rankText)})</span>` : `<span class="wg-neg">No rank crafts ${esc(r.rarityLabel)}</span>`;
  const check = r.tool ? `Roll ${esc(r.tool.label)}${r.toolTotal ? ` <span class="wg-dim">(${esc(r.toolTotal)})</span>` : ""}, ${r.dc === null ? `<span class="wg-dim">no DC set: the roll crafts it</span>` : `DC ${r.dc}`}` : `<span class="wg-neg">No proficient tool</span>`;
  const req = `<section class="wg-box"><h4>Requirements</h4><ul class="wg-kv wg-pad">
    <li><span>Tool</span><b>${r.tool ? `<i class="wg-pm ${r.tool.mult >= 2 ? "e" : "f"}" aria-hidden="true"></i> ${esc(r.tool.label)}` : `<span class="wg-neg">not proficient</span>`}</b></li>
    <li><span>Rank</span><b>${rankLine}</b></li>
    <li><span>Check</span><b>${check}</b></li>
    <li><span>Time</span><b>${time}</b></li></ul></section>`;
  const cost = `<section class="wg-box"><h4>Cost<span class="r">${esc(v.economyNote)}</span></h4><ul class="wg-kv wg-pad">
    <li><span>Item value</span><b>${r.price === null ? `<span class="wg-dim">no price</span>` : v.money(r.price)}</b></li>
    <li><span>Coin cost</span><b>${r.cost === null ? `<span class="wg-dim">not set (Crafting rules)</span>` : `${v.money(r.cost)}${r.charge ? ` <span class="${r.coinOk ? "wg-dim" : "wg-neg"}">· paid from your coin</span>` : ` <span class="wg-dim">· not charged</span>`}`}</b></li>
    <li><span>On a failure</span><b class="wg-dim">${esc(v.failText)}</b></li></ul></section>`;
  const helpers = v.helpersMax > 0 ? `<label class="wg-lab" for="wg-helpers">Helpers</label><input id="wg-helpers" class="wg-num" type="number" min="0" max="${v.helpersMax}" step="1" value="${v.helpers}" data-wg-helpers>${v.helperDivides ? "" : `<span class="wg-dim">(time not divided)</span>`}` : "";
  const why = r.problems.length ? `<span class="wg-neg">${esc(r.problems[0])}</span>` : `<span class="wg-dim">One ${esc(r.tool?.label ?? "tool")} check${v.approval ? "; the GM approves the result" : r.dc === null ? "; no DC is set, so the roll crafts it" : ""}.</span>`;
  const can = r.canCraft && !v.noGM && !v.locked;
  const foot = `<footer class="wg-foot">${helpers}<div class="wg-grow wg-footmsg">${why}<p class="wg-uses" role="note" data-wg-uses>${esc(uses)}</p></div><button type="button" class="wg-gbtn big pri" data-action="wgCraftNow" data-id="${esc(r.id)}" title="${esc(uses)}"${can ? "" : " disabled"}>${svg(ICONS.hammer.d)}Craft</button></footer>`;
  return `${head}<div class="wg-two"><section class="wg-box"><h4>Materials<span class="r">in the inventory: have / need</span></h4><ul class="wg-list">${mats}</ul></section>${req}</div>${cost}${foot}`;
}

/** The Craft page. @param {CraftView} v */
export function craftPageHTML(v) {
  v = { ...v, rows: visibleRows(/** @type {any[]} */ (v.rows.map(r => ({ learnState: r.knows ? "known" : "", ...r }))), { gm: v.gm, hide: !!v.hideUnknown, craft: true }) };
  if (!v.rows.length) return frame(v, `<main class="wg-body"><div class="wg-empty"><p>No recipes for ${esc(v.profession.name)} yet.</p><p class="wg-dim">${v.gm ? "Add them on the setup window's Recipes page." : "Your GM adds them."}</p></div></main>`);
  const shown = searchRows(v.rows, v.query).filter(r => v.filter !== "can" || r.canCraft);
  const sel = v.rows.find(r => r.id === v.selected) ?? shown[0] ?? v.rows[0];
  const list = shown.length ? groupRows(shown).map(g => `<div class="wg-sect">${esc(g.label)}</div>${g.rows.map(r => listRow(r, sel.id)).join("")}`).join("") : `<p class="wg-dim wg-pad">Nothing matches.</p>`;
  const chip = (/** @type {string} */ id, /** @type {string} */ label) => `<button type="button" class="wg-chip${v.filter === id ? " on" : ""}" data-action="wgFilter" data-filter="${id}" aria-pressed="${v.filter === id}">${esc(label)}</button>`;
  const legend = Object.values(STATUS).map(s => `<span class="wg-dk ${s.cls}"><i aria-hidden="true"></i>${esc(s.label)}</span>`).join("");
  const aside = `<aside class="wg-aside">
    <div class="wg-pad wg-tools"><input type="search" class="wg-search" placeholder="Search recipes" aria-label="Search recipes" value="${esc(v.query)}" data-wg-search>
      <div class="wg-chips">${chip("all", "All")}${chip("can", "Can craft")}</div></div>
    <div class="wg-scroll">${list}</div><div class="wg-legend">${legend}</div></aside>`;
  return frame(v, `<div class="wg-split">${aside}<main class="wg-body">${detailHTML(v, sel)}</main></div>`);
}

/** What the Recipes page says for each state (players). */
export const LEARN_TEXT = Object.freeze({ needsItem: "Needs a recipe item", gm: "Ask your GM" });

/** One row of the Recipes page. @param {CraftView} v @param {Row} r */
function learnRow(v, r) {
  const q = qualityOf(r.rarity);
  const req = r.rarity ? (r.need ? `${r.need.name} ${signed(r.need.bonus)}` : "no rank") : "any rank";
  const off = v.noGM || v.locked ? " disabled" : "";
  const st = r.learnState ?? "";
  let act = "";
  if (st === "known") act = r.source === "everyone" ? `<span class="wg-dim">with the profession</span>` : v.gm ? `<button type="button" class="wg-gbtn sm" data-action="wgForget" data-id="${esc(r.id)}">Forget</button>` : `<span class="wg-dim">Learned</span>`;
  else if (st === "teach") act = `<button type="button" class="wg-gbtn sm" data-action="wgLearn" data-id="${esc(r.id)}">Teach</button>`;
  else if (st === "learn") act = `<button type="button" class="wg-gbtn sm" data-action="wgLearn" data-id="${esc(r.id)}"${off}>Learn</button>`;
  else if (st === "item") act = `<button type="button" class="wg-gbtn sm" data-action="wgLearnItem" data-item="${esc(r.itemUuid ?? "")}" title="${esc(`Uses ${r.itemName ?? "the recipe item"}`)}"${off}>Learn from item</button>`;
  else if (st === "rank") act = `<span class="wg-dim">needs ${esc(req)}</span>`;
  else act = `<span class="wg-dim">${esc(LEARN_TEXT[/** @type {keyof typeof LEARN_TEXT} */ (st)] ?? "Ask your GM")}</span>`;
  const known = st === "known";
  return `<li class="wg-lrow${known ? " done" : " wg-unknown"}">
    <span class="wg-tick${known ? " on" : ""}" role="img" aria-label="${known ? "Known" : "Not known"}">${known ? svg("M5 12l5 5l9-10") : ""}</span>
    ${itemSlot({ img: r.img || "icons/svg/item-bag.svg", name: r.name, rarity: q, size: "sm" })}
    <span class="wg-nm"><b class="wc-q-text" data-quality="${esc(q)}">${esc(r.name)}</b><small>${esc([r.group, r.rarityLabel, r.hasItem && st !== "known" ? `you carry ${r.itemName ?? "its recipe item"}` : ""].filter(Boolean).join(" · "))}</small></span>
    <span class="wg-req${r.rankOk ? "" : " wg-neg"}">${esc(req)}</span><span class="wg-act">${act}</span></li>`;
}

/** The Recipes page: Known, Can learn, Needs a higher rank, Needs a recipe item, Ask your GM. @param {CraftView} v */
export function recipesPageHTML(v) {
  const all = visibleRows(/** @type {any[]} */ (v.rows), { gm: v.gm, hide: !!v.hideUnknown });
  const rows = searchRows(all, v.query);
  const sect = (/** @type {string} */ label, /** @type {Row[]} */ list) => (list.length ? `<section class="wg-box"><h4>${esc(label)}<span class="r">${list.length}</span></h4><ul class="wg-list">${list.map(r => learnRow(v, r)).join("")}</ul></section>` : "");
  const hint = v.gm ? "Teach and Forget change this character's known recipes."
    : v.hideUnknown ? "Recipes you know, and the ones a recipe item you carry teaches. Your GM teaches you others, or you find recipe items."
      : v.playersLearn ? "Learn adds a recipe your rank allows; some are learned from a recipe item, some only from the GM." : "Your GM teaches you recipes, or you find recipe items.";
  const sections = LEARN_SECTIONS.map(([states, label]) => sect(label, rows.filter(r => states.includes(r.learnState ?? "")))).join("");
  const empty = v.hideUnknown && !v.gm ? `<div class="wg-empty"><p>No ${esc(v.profession.name)} recipes known yet.</p><p class="wg-dim">Your GM teaches recipes, or you find recipe items.</p></div>` : `<div class="wg-empty"><p>No recipes for ${esc(v.profession.name)} yet.</p></div>`;
  const body = all.length
    ? `<div class="wg-pad wg-tools"><input type="search" class="wg-search" placeholder="Search recipes" aria-label="Search recipes" value="${esc(v.query)}" data-wg-search><span class="wg-dim">${esc(hint)}</span></div>
      ${sections}${rows.length ? "" : `<p class="wg-dim wg-pad">Nothing matches.</p>`}`
    : empty;
  return frame(v, `<main class="wg-body">${body}</main>`);
}

/** The window body for its mode. @param {CraftView} v */
export const craftWindowHTML = v => (v.mode === "recipes" ? recipesPageHTML(v) : craftPageHTML(v));

// ------------------------------------------------------------------ chat card

/**
 * @typedef {object} CardView
 * @property {"pending" | "done" | "failed" | "refused" | "error"} state
 * @property {string} actorName
 * @property {string} recipeName
 * @property {string} rarity
 * @property {string} img
 * @property {number} qty
 * @property {string} toolLabel
 * @property {number | null} total
 * @property {number | null} dc
 * @property {string} timeText
 * @property {string} reason refusal or error text
 * @property {string[]} used what was used up (plain text)
 * @property {string} coin coin markup, or ""
 * @property {boolean} approvalAsked the GM was asked because of the approval switch (the only reason a card waits)
 */

const STATE_TEXT = { pending: "Waiting for the GM", done: "Crafted", failed: "Failed", refused: "Refused", error: "Not crafted" };

/** The craft chat card (GM buttons carry `data-wg-choice` and the `wg-gm-only` class; craft-leader.mjs hides them from players). @param {CardView} c */
export function cardHTML(c) {
  const q = qualityOf(c.rarity);
  const noDc = c.dc === null && c.state === "done" ? ` <span class="wg-dim">(no DC set: crafted)</span>` : "";
  const roll = c.total === null ? "" : `<p class="wg-cline"><span>${esc(c.toolLabel)} check</span><b>${c.total}${c.dc === null ? "" : ` vs DC ${c.dc}`}${noDc}</b></p>`;
  const time = c.timeText ? `<p class="wg-cline"><span>Time</span><b>${esc(c.timeText)} <span class="wg-dim">(${esc(TIME_NOTE)})</span></b></p>` : "";
  const used = c.used.length ? `<p class="wg-cline"><span>Used up</span><b>${esc(c.used.join(", "))}</b></p>` : "";
  const coin = c.coin ? `<p class="wg-cline"><span>Coin</span><b>${c.coin}</b></p>` : "";
  const reason = c.reason ? `<p class="wg-creason">${esc(c.reason)}</p>` : "";
  let buttons = "";
  if (c.state === "pending") {
    const b = (/** @type {string} */ choice, /** @type {string} */ label, /** @type {string} */ cls = "") => `<button type="button" class="wc-btn wc-btn-sm ${cls}" data-wg-choice="${choice}">${esc(label)}</button>`;
    buttons = `<div class="wg-cbtns wg-gm-only">${c.dc === null ? `${b("success", "Success", "wc-btn-primary")}${b("failure", "Failure")}` : b("approve", c.total !== null && c.total >= c.dc ? "Approve success" : "Approve failure", "wc-btn-primary")}${b("refuse", "Refuse", "wc-btn-danger")}</div>
      <p class="wg-dim wg-player-only">The GM approves each craft; nothing is made or used up until then.</p>`;
  }
  return `<div class="${UI_CLASSES.join(" ")} wg-chat wg-chat-${esc(c.state)}">
    <header class="wg-chead">${itemSlot({ img: c.img || "icons/svg/item-bag.svg", name: c.recipeName, rarity: q, count: c.qty })}
      <div><b class="wc-q-text" data-quality="${esc(q)}">${esc(c.recipeName)}</b><span class="wg-dim">${esc(c.actorName)} · ${esc(STATE_TEXT[c.state] ?? c.state)}</span></div></header>
    ${roll}${time}${used}${coin}${reason}${buttons}</div>`;
}

// ------------------------------------------------------------------ learn card

/** What the learn card says about where the recipe came from. */
export const LEARN_FROM = Object.freeze({ rank: "", item: "from a recipe item", gm: "from the GM" });

/**
 * The learn card: "X learned Y (from an item / from the GM)". Whispered by the leader to the player and the GMs.
 * @param {{ actorName: string, recipeName: string, rarity: string, img: string, source: string }} c
 */
export function learnCardHTML(c) {
  const q = qualityOf(c.rarity);
  const from = LEARN_FROM[/** @type {keyof typeof LEARN_FROM} */ (c.source)] ?? "";
  return `<div class="${UI_CLASSES.join(" ")} wg-chat wg-chat-learn">
    <header class="wg-chead">${itemSlot({ img: c.img || "icons/svg/book.svg", name: c.recipeName, rarity: q })}
      <div><b class="wc-q-text" data-quality="${esc(q)}">${esc(c.recipeName)}</b><span class="wg-dim">${esc(c.actorName)} · Recipe learned</span></div></header>
    <p class="wg-cline"><span>${esc(c.actorName)} learned ${esc(c.recipeName)}</span><b>${from ? esc(from) : ""}</b></p></div>`;
}
