/**
 * The Professions window's HTML, pure (tested in Node: tests/views.test.mjs). Built from `professionsView()` (character-model.mjs).
 * The window keeps its own dark, in-world palette in both Foundry themes (tokens on `.wg-prof`, no theme selectors), like the
 * toolkit's character sheet. Buttons carry `data-action`; professions.mjs handles them. Every value is escaped.
 */
import { esc } from "./const.mjs";

/** An inline stroke icon. @param {string} d */
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${esc(d)}"></path></svg>`;

/** What the placeholder buttons say. */
export const COMING = "Coming in a later version.";

/** @typedef {ReturnType<typeof import("./character-model.mjs").professionsView>} View */
/** @typedef {View["cards"][number]} Prof */

/** @param {Prof} p */
function ladderHTML(p) {
  if (!p.ladder.length) return "";
  return `<ol class="wg-ladder" aria-label="${esc(p.name)} ranks, set by proficiency bonus">${p.ladder.map(l =>
    `<li class="${l.state}"${l.state === "on" ? ` aria-current="step"` : ""} title="${esc(`${l.name} +${l.bonus}${l.rarityLabel ? `: crafts up to ${l.rarityLabel}` : ""}`)}"><b>+${l.bonus}</b>${esc(l.name)}</li>`).join("")}</ol>`;
}

/** @param {Prof} p @param {boolean} [small] */
function actionsHTML(p, small = true) {
  if (!p.actions.length) return "";
  return `<div class="wg-actions">${p.actions.map(a =>
    `<button type="button" class="wg-gbtn${small ? " sm" : ""}" data-action="wgComing" data-what="${esc(a.id)}" data-prof="${esc(p.id)}" title="${esc(COMING)}">${svg(a.icon)}${esc(a.label)}</button>`).join("")}</div>`;
}

/** @param {{ mark: string, label: string, word?: string }} t */
const toolHTML = t => `<span class="wg-tool"><i class="wg-pm ${esc(t.mark)}" aria-hidden="true"></i>${esc(t.label)}${t.word ? ` <span class="wg-dim">· ${esc(t.word)}</span>` : ""}</span>`;

/** One card (crafting or gathering). @param {Prof} p */
export function cardHTML(p) {
  const rows = [`<li><span>Linked proficiency</span><b>${toolHTML(p.tool)}</b></li>`];
  if (p.tools.length > 1) rows.push(`<li><span>Any of</span><b>${esc(p.toolText)}</b></li>`);
  if (p.craftsUpTo && p.actions.some(a => a.id === "craft")) rows.push(`<li><span>Crafts up to</span><b>${esc(p.craftsUpTo)}</b></li>`);
  if (p.check) rows.push(`<li><span>Check</span><b>${esc(p.check)} <span class="wg-dim">· DC set by the GM</span></b></li>`);
  if (p.next) rows.push(`<li><span>Next rank</span><b>${esc(p.next)}</b></li>`);
  return `<section class="wg-box" data-prof="${esc(p.id)}">
    <h4>${esc(p.kindLabel)}</h4>
    <div class="wg-card">
      <div class="wg-phd"><span class="wg-ico" aria-hidden="true">${svg(p.icon)}</span><div class="wg-grow"><b class="wg-pname">${esc(p.name)}</b><span class="wg-rank">${esc(p.rank)}</span></div></div>
      ${ladderHTML(p)}
      <ul class="wg-kv">${rows.join("")}</ul>
      ${p.notes ? `<p class="wg-note">${esc(p.notes)}</p>` : ""}
      ${actionsHTML(p)}
    </div>
  </section>`;
}

/** One row of the Other professions list (and of Not learned). @param {Prof} p */
export function rowHTML(p) {
  const note = p.notes || (p.check ? `${p.check}, DC set by the GM` : p.craftsUpTo ? `Crafts up to ${p.craftsUpTo}` : "");
  return `<li class="wg-srow${p.learned ? "" : " wg-unlearned"}" data-prof="${esc(p.id)}">
    <span class="wg-ico" aria-hidden="true">${svg(p.icon)}</span>
    <span class="wg-nm"><b>${esc(p.name)}</b><small>${p.noTool ? "No tool needed" : toolHTML(p.tool)}</small></span>
    <span class="wg-rank">${esc(p.rank)}</span>
    <span class="wg-rar">${esc(note)}</span>
    ${actionsHTML(p)}
  </li>`;
}

/** The whole window body. @param {View} v */
export function professionsHTML(v) {
  const head = `<header class="wg-head"><div class="wg-grow"><h2 class="wg-ttl">${esc(v.name)}</h2><p class="wg-sub">${esc(v.subtitle || "No proficiency bonus")}</p></div>
    <p class="wg-headnote">Professions come from tool proficiencies.<br>Rank follows the proficiency bonus.</p></header>`;
  if (!v.defined) {
    return `<div class="wg-prof">${head}<main class="wg-body"><div class="wg-empty"><p>This world has no professions yet.</p>
      <p class="wg-dim">${v.isGM ? "Add them in the Professions setup window (Game Settings › Wanderer's Guild, or the button below)." : "Your GM sets them up."}</p>
      ${v.isGM ? `<p><button type="button" class="wg-gbtn" data-action="wgSetup">Open setup</button></p>` : ""}</div></main></div>`;
  }
  const none = !v.cards.length && !v.others.length;
  const cards = v.cards.length ? `<div class="wg-grid">${v.cards.map(cardHTML).join("")}</div>` : "";
  const others = v.others.length ? `<section class="wg-box"><h4>Other professions<span class="r">no limit</span></h4><ul class="wg-list">${v.others.map(rowHTML).join("")}</ul></section>` : "";
  const unlearned = v.unlearned.length ? `<section class="wg-box"><h4>Not learned<span class="r">needs a tool proficiency</span></h4><ul class="wg-list">${v.unlearned.map(rowHTML).join("")}</ul></section>` : "";
  const empty = none ? `<div class="wg-empty"><p>No professions yet.</p><p class="wg-dim">A profession is learned with a tool proficiency (from a background, class, species or training).${v.hiddenUnlearned ? ` This world has ${v.hiddenUnlearned} to choose from.` : ""}</p></div>` : "";
  const recent = `<section class="wg-box"><h4>Recent<span class="r">crafting and gathering checks</span></h4><p class="wg-dim wg-pad">${esc(COMING)}</p></section>`;
  return `<div class="wg-prof">${head}<main class="wg-body">${empty}${cards}${others}${unlearned}${recent}</main></div>`;
}
