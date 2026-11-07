/**
 * Gathering's HTML, pure (tested in Node: tests/gather-views.test.mjs): the Gather window (one character, one profession: the node
 * nearby, the area, the targeted creature), the gather chat card, the GM's node editor and its reader, the scene's tier field (core's
 * Table Tools tab) and the setup window's Gathering page with its reader. Every value is escaped. The Gather window uses the
 * Professions window's dark palette (`.wg-prof`); its buttons carry `data-action` (gathering.mjs handles them).
 */
import { esc } from "./const.mjs";
import { itemSlot, UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { ICONS } from "./professions-model.mjs";
import { DC_MIN, DC_MAX } from "./recipes-model.mjs";
import { SRD_DCS, TIERS_MAX, BANDS_MAX, CREATURES_MAX, AREAS_MAX, QTY_MAX, USES_MAX, REACH_MAX, NAME_MAX, CR_MAX, DAYS_MAX, GATHER_VERSION, crText } from "./gather-model.mjs";

const svg = (/** @type {string} */ d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${esc(d)}"></path></svg>`;
const opt = (/** @type {string} */ v, /** @type {string} */ label, /** @type {boolean} */ sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;
const nv = (/** @type {number | null | undefined} */ v) => (v === null || v === undefined ? "" : String(v));
/** @param {import("./gather-model.mjs").ItemRef | null} r */
const refName = r => (r ? r.name || "an item" : "");

/** The DC suggestions list (SRD 5.2 typical DCs), once per page. */
export const DC_LIST = `<datalist id="wg-dc-list">${SRD_DCS.map(d => `<option value="${d.dc}" label="${esc(d.label)}"></option>`).join("")}</datalist>`;
const dcInput = (/** @type {string} */ name, /** @type {number | null} */ v, /** @type {string} */ label) => `<input type="number" class="wg-num" name="${esc(name)}" value="${nv(v)}" min="${DC_MIN}" max="${DC_MAX}" step="1" list="wg-dc-list" aria-label="${esc(label)}">`;

/**
 * @typedef {object} GatherOption
 * @property {string} key "node:<uuid>", "area:<sceneId>" or "creature:<tokenUuid>"
 * @property {"node" | "area" | "creature"} kind
 * @property {string} title
 * @property {string} dcText
 * @property {string} rollText e.g. "Wisdom (Survival)"
 * @property {string} gives e.g. "2 copper ore · rare: tigerseye"
 * @property {string[]} problems
 * @property {boolean} ok
 * @typedef {object} GatherView
 * @property {string} actorName
 * @property {{ id: string, name: string, icon: string }} profession
 * @property {Array<{ id: string, name: string }>} professions the character's gathering professions (for the switch)
 * @property {GatherOption[]} options
 * @property {{ value: number, max: number, hint: string } | null} [days] the *Days in this stage* field ("perDay" mode with a node or area option)
 * @property {boolean} noGM
 * @property {boolean} locked a roll is under way, or the user can't act for the character
 * @property {string} [note] a hint under the list (e.g. how to target a creature)
 */

const dayWord = (/** @type {number} */ n) => `${n} day${n === 1 ? "" : "s"}`;
/** "2 per day × 3 days". @param {number} perDay @param {number} days */
export const perDayText = (perDay, days) => `${perDay} per day × ${dayWord(days)}`;

/** What an option gives, as text. @param {{ item: any, rare: any, qty: number, perDay?: number, days?: number, perDayMode?: boolean }} a @param {number | null} margin */
export function givesText(a, margin) {
  const parts = [];
  if (a.item) parts.push(a.perDayMode ? `${perDayText(a.perDay ?? a.qty, a.days ?? 1)}: ${a.qty} × ${refName(a.item)}` : `${a.qty} × ${refName(a.item)}`);
  if (a.rare) parts.push(margin !== null ? `rare (beat the DC by ${margin}): ${refName(a.rare)}` : `rare: ${refName(a.rare)} (no rare margin set)`);
  return parts.length ? parts.join(" · ") : "no resource set: the GM hands out what you find";
}

const KIND_TEXT = { node: "Gather here", area: "Gather in this area", creature: "Harvest" };

/** The Gather window. @param {GatherView} v */
export function gatherWindowHTML(v) {
  const profs = v.professions.length > 1
    ? `<label class="wg-gprof">Profession <select data-wg-gprof>${v.professions.map(p => opt(p.id, p.name, p.id === v.profession.id)).join("")}</select></label>` : "";
  const rows = v.options.map(o => `<li class="wg-gopt${o.ok ? "" : " wg-off"}">
      <div class="wg-grow"><b>${esc(KIND_TEXT[o.kind])}: ${esc(o.title)}</b>
        <span class="wg-dim">${esc(o.rollText)} · ${esc(o.dcText)}</span>
        <span class="wg-dim">${esc(o.gives)}</span>
        ${o.problems.map(p => `<span class="wg-gprob">${esc(p)}</span>`).join("")}</div>
      <button type="button" class="wg-gbtn" data-action="wgGatherNow" data-key="${esc(o.key)}"${o.ok && !v.locked && !v.noGM ? "" : " disabled"}>${svg(ICONS.pick.d)}${o.kind === "creature" ? "Harvest" : "Gather"}</button></li>`).join("");
  const days = v.days ? `<label class="wg-gdays">Days in this stage <input type="number" class="wg-num" data-wg-days value="${v.days.value}" min="1" max="${v.days.max ?? DAYS_MAX}" step="1">${v.days.hint ? ` <span class="wg-dim">${esc(v.days.hint)}</span>` : ""}</label>` : "";
  const none = v.options.length ? "" : `<div class="wg-empty"><p>Nothing to gather here.</p><p class="wg-dim">Stand near a gathering node for ${esc(v.profession.name)}, or target a defeated creature to harvest it.</p></div>`;
  return `<div class="wg-prof wg-gather">
    <header class="wg-head"><span class="wg-ico" aria-hidden="true">${svg(v.profession.icon)}</span><div class="wg-grow"><h2 class="wg-ttl">${esc(v.profession.name)}</h2><p class="wg-sub">${esc(v.actorName)}</p></div>${profs}</header>
    ${v.noGM ? `<p class="wg-banner">No GM is connected: gathering waits until one joins.</p>` : ""}
    <main class="wg-body">${days}${none}${rows ? `<ul class="wg-list wg-glist">${rows}</ul>` : ""}
      <p class="wg-dim wg-pad">${esc(v.note ?? "The check is rolled here; the GM's client gives the items. Results go to chat.")}</p></main></div>`;
}

/**
 * @typedef {object} GatherCard
 * @property {"done" | "failed" | "error"} state
 * @property {string} actorName
 * @property {string} professionName
 * @property {"node" | "area" | "creature"} kind
 * @property {string} where
 * @property {string} rollText
 * @property {number | null} total
 * @property {number | null} dc
 * @property {string} tierName
 * @property {boolean} rare
 * @property {Array<{ name: string, img: string, qty: number, rare: boolean }>} items
 * @property {boolean} noItem a success with no resource set
 * @property {number | null} [perDay] "perDay" mode (nodes and areas): resources per day
 * @property {number | null} [days] "perDay" mode: days in the stage
 * @property {string} [reason]
 */

/** The gather chat card. @param {GatherCard} c */
export function gatherCardHTML(c) {
  const verb = c.kind === "creature" ? "Harvested" : "Gathered";
  const head = c.state === "done"
    ? (c.items.length ? `${verb} ${c.items.map(i => `${i.qty} × ${i.name}${i.rare ? " (rare)" : ""}`).join(", ")}` : `${verb}: the GM hands out what was found`)
    : c.state === "failed" ? `Found nothing` : `Nothing was gathered`;
  const img = c.items[0]?.img || "icons/svg/item-bag.svg";
  const noDc = c.dc === null && c.state === "done" ? ` <span class="wg-dim">(no DC set)</span>` : "";
  const roll = c.total === null ? "" : `<p class="wg-cline"><span>${esc(c.rollText)}</span><b>${c.total}${c.dc === null ? "" : ` vs DC ${c.dc}`}${noDc}</b></p>`;
  const amount = c.perDay && c.days ? `<p class="wg-cline"><span>Amount</span><b>${esc(perDayText(c.perDay, c.days))}</b></p>` : "";
  const rare = c.rare ? `<p class="wg-cline"><span>Rare</span><b>beat the DC by the rare margin</b></p>` : "";
  const where = `<p class="wg-cline"><span>${c.kind === "creature" ? "Creature" : "Where"}</span><b>${esc(c.where)}${c.tierName ? ` <span class="wg-dim">· ${esc(c.tierName)}</span>` : ""}</b></p>`;
  const reason = c.reason ? `<p class="wg-creason">${esc(c.reason)}</p>` : "";
  return `<div class="${UI_CLASSES.join(" ")} wg-chat wg-chat-${esc(c.state)} wg-gcard">
    <header class="wg-chead">${itemSlot({ img, name: c.items[0]?.name ?? c.where, rarity: c.rare ? "rare" : "common", count: c.items[0]?.qty ?? 0 })}
      <div><b>${esc(head)}</b><span class="wg-dim">${esc(c.actorName)} · ${esc(c.professionName)}</span></div></header>
    ${where}${roll}${amount}${rare}${reason}</div>`;
}

/**
 * The GM's node editor (a dialog's content).
 * @param {{ node: Partial<import("./gather-model.mjs").Node> | null, professions: Array<{ id: string, name: string }>, tiers: Array<{ id: string, name: string, dc: number | null }>, sceneTierName: string }} m
 */
export function nodeFormHTML(m) {
  const n = m.node ?? {};
  const ref = (/** @type {string} */ key, /** @type {any} */ r, /** @type {string} */ label) => `<label class="wg-field"><span>${esc(label)}</span><span class="wg-refbox" data-wg-ref="${key}">
      <input type="text" name="${key}.uuid" value="${esc(r?.uuid ?? "")}" placeholder="Drop an item here, or paste its UUID" aria-label="${esc(label)} UUID">
      <input type="hidden" name="${key}.name" value="${esc(r?.name ?? "")}"><input type="hidden" name="${key}.img" value="${esc(r?.img ?? "")}">
      <small class="wc-hint" data-wg-refname>${esc(r?.name ?? "")}</small></span></label>`;
  return `<div class="wg-form wg-node-form">${DC_LIST}
    <label class="wg-field"><span>Name</span><input type="text" name="name" value="${esc(n.name ?? "")}" maxlength="${NAME_MAX}" placeholder="Copper vein"></label>
    <label class="wg-field"><span>Profession</span><select name="profession">${m.professions.map(p => opt(p.id, p.name, p.id === n.profession)).join("")}</select></label>
    ${ref("item", n.item, "Resource")}
    ${ref("rare", n.rare, "Rare resource")}
    <label class="wg-field"><span>Tier</span><select name="tier">${opt("", `The scene's (${m.sceneTierName || "none"})`, !n.tier)}${m.tiers.map(t => opt(t.id, `${t.name}${t.dc === null ? "" : ` (DC ${t.dc})`}`, t.id === n.tier)).join("")}</select></label>
    <label class="wg-field"><span>DC</span><span>${dcInput("dc", n.dc ?? null, "DC")} <span class="wc-hint">empty: the tier's</span></span></label>
    <label class="wg-field"><span>Per success</span><span><input type="number" class="wg-num" name="qty" value="${nv(n.qty)}" min="1" max="${QTY_MAX}" step="1"> <span class="wc-hint">empty: the Gathering page's (per day of the stage, unless it counts flat)</span></span></label>
    <label class="wg-field"><span>Uses left</span><span><input type="number" class="wg-num" name="uses" value="${nv(n.uses)}" min="0" max="${USES_MAX}" step="1"> <span class="wc-hint">empty: unlimited; a success spends one</span></span></label>
    <label class="wg-field"><span>Needs bonus</span><span><input type="number" class="wg-num" name="minBonus" value="${nv(n.minBonus)}" min="0" max="20" step="1"> <span class="wc-hint">empty: any rank</span></span></label>
    <label class="wg-check"><input type="checkbox" name="hidden"${n.hidden ? " checked" : ""}> Hidden from players (they don't see or use it; its details still reach their browsers, so keep secrets off it)</label>
    <label class="wg-check"><input type="checkbox" name="reset"> Reset this node's limits (everyone may gather here again)</label>
  </div>`;
}

/**
 * Reads the node editor into a raw node (normalizeNode checks it); `reset` asks for a new `resetAt`.
 * @param {Iterable<[string, unknown]>} entries
 */
export function readNodeForm(entries) {
  /** @type {Record<string, any>} */
  const o = { v: GATHER_VERSION, hidden: false, reset: false, item: {}, rare: {} };
  for (const [k, v] of entries) {
    const s = String(v ?? "").trim();
    const r = /^(item|rare)\.(uuid|name|img)$/.exec(k);
    if (r) { o[r[1]][r[2]] = s; continue; }
    if (k === "hidden" || k === "reset") o[k] = s === "on" || s === "true";
    else if (["dc", "qty", "uses", "minBonus"].includes(k)) o[k] = s === "" ? null : Number(s);
    else if (["name", "profession", "tier"].includes(k)) o[k] = s;
  }
  for (const k of ["item", "rare"]) if (!o[k].uuid) o[k] = null;
  return o;
}

/** The scene's field in core's Table Tools tab. @param {{ tiers: Array<{ id: string, name: string, dc: number | null }>, value: string, field: string }} m */
export function sceneSectionHTML(m) {
  return `<div class="form-group"><label>Gathering tier</label><div class="form-fields"><select name="${esc(m.field)}">${opt("", "None", !m.value)}${m.tiers.map(t => opt(t.id, `${t.name}${t.dc === null ? " (no DC set)" : ` (DC ${t.dc})`}`, t.id === m.value)).join("")}</select></div>
    <p class="hint">Sets the DC for gathering in this scene (and for its nodes without their own tier or DC). Tiers and their DCs are on the Professions setup window's Gathering page.</p></div>`;
}

/**
 * The setup window's Gathering page.
 * @param {{ rules: import("./gather-model.mjs").GatherRules, professions: Array<{ key: string, label: string }>, types: Array<{ key: string, label: string }>, status: { set: string[], unset: string[] }, json: string, nodes: Array<{ scene: string, count: number }>, epoch: string }} m
 */
export function gatherPage(m) {
  const r = m.rules;
  const head = `<header class="wc-pagehead"><div class="wc-pagehead-title"><h2>Gathering</h2><div class="wc-pagehead-meta"><span class="wc-hint">Your table's numbers: every DC starts empty (no DC = the check succeeds). Suggestions in the DC fields are SRD 5.2's typical DCs.</span></div></div>
    <div class="wc-row"><button type="button" class="wc-btn" data-action="gatherReset"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Reset gathering limits</button></div></header>`;
  const status = `<div class="wc-alert wc-info" role="note"><i class="fa-solid fa-leaf" aria-hidden="true"></i><div><p class="wc-alert-title">How it works</p>
    <p>Place nodes on a map (Journal Notes controls › Gathering node), give scenes a tier (Scene configuration › Table Tools), fill in the tier DCs here. Players press Gather on a gathering profession: the check is rolled on their client and the GM's client gives the items. ${m.status.set.length ? `Set: ${esc(m.status.set.join(", "))}.` : "Nothing is set yet."}${m.status.unset.length ? ` Not set: ${esc(m.status.unset.join(", "))}.` : ""}</p>
    <p>Nodes: ${m.nodes.length ? esc(m.nodes.map(n => `${n.scene} (${n.count})`).join(", ")) : "none yet"}. Limits last reset: ${esc(m.epoch || "never")}.</p></div></div>`;
  const tierRows = r.tiers.map((t, i) => `<tr><td><input type="hidden" name="tier.${i}.id" value="${esc(t.id)}"><input type="text" name="tier.${i}.name" value="${esc(t.name)}" maxlength="${NAME_MAX}" aria-label="Tier name"></td><td>${dcInput(`tier.${i}.dc`, t.dc, `${t.name}: DC`)}</td>
    <td class="wc-end"><button type="button" class="wc-btn wc-btn-sm wc-btn-ghost" data-action="gRowRemove" data-list="tiers" data-index="${i}" aria-label="Remove ${esc(t.name)}">Remove</button></td></tr>`).join("");
  const bandRows = r.crBands.map((b, i) => `<tr><td><input type="number" class="wg-num" name="band.${i}.cr" value="${b.cr}" min="0" max="${CR_MAX}" step="any" aria-label="Up to CR"></td><td>${dcInput(`band.${i}.dc`, b.dc, `Up to CR ${crText(b.cr)}: DC`)}</td>
    <td class="wc-end"><button type="button" class="wc-btn wc-btn-sm wc-btn-ghost" data-action="gRowRemove" data-list="crBands" data-index="${i}">Remove</button></td></tr>`).join("");
  const profSel = (/** @type {string} */ name, /** @type {string} */ v) => `<select name="${name}">${m.professions.map(p => opt(p.key, p.label, p.key === v)).join("")}${m.professions.some(p => p.key === v) || !v ? "" : opt(v, `${v} (missing)`, true)}</select>`;
  const refCell = (/** @type {string} */ name, /** @type {any} */ ref) => `<td class="wg-refbox" data-wg-drop="${name}"><input type="text" name="${name}.uuid" value="${esc(ref?.uuid ?? "")}" placeholder="Drop an item" aria-label="Item UUID"><input type="hidden" name="${name}.name" value="${esc(ref?.name ?? "")}"><input type="hidden" name="${name}.img" value="${esc(ref?.img ?? "")}"><small class="wc-hint">${esc(ref?.name ?? "")}</small></td>`;
  const creatureRows = r.creatures.map((c, i) => `<tr><td><select name="cre.${i}.type">${m.types.map(t => opt(t.key, t.label, t.key === c.type)).join("")}${m.types.some(t => t.key === c.type) ? "" : opt(c.type, c.type, true)}</select></td>
    <td>${profSel(`cre.${i}.profession`, c.profession)}</td>${refCell(`cre.${i}.item`, c.item)}${refCell(`cre.${i}.rare`, c.rare)}
    <td><input type="number" class="wg-num" name="cre.${i}.minBonus" value="${nv(c.minBonus)}" min="0" max="20" step="1" aria-label="Needs bonus"></td>
    <td class="wc-end"><button type="button" class="wc-btn wc-btn-sm wc-btn-ghost" data-action="gRowRemove" data-list="creatures" data-index="${i}">Remove</button></td></tr>`).join("");
  const areaRows = r.areas.map((a, i) => `<tr><td>${profSel(`area.${i}.profession`, a.profession)}</td>
    <td><select name="area.${i}.tier">${opt("", "Any tier", !a.tier)}${r.tiers.map(t => opt(t.id, t.name, t.id === a.tier)).join("")}</select></td>${refCell(`area.${i}.item`, a.item)}${refCell(`area.${i}.rare`, a.rare)}
    <td class="wc-end"><button type="button" class="wc-btn wc-btn-sm wc-btn-ghost" data-action="gRowRemove" data-list="areas" data-index="${i}">Remove</button></td></tr>`).join("");
  const add = (/** @type {string} */ list, /** @type {string} */ label, /** @type {boolean} */ full) => `<button type="button" class="wc-btn wc-btn-sm" data-action="gRowAdd" data-list="${list}"${full ? " disabled" : ""}><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(label)}</button>`;
  const table = (/** @type {string} */ cols, /** @type {string} */ body, /** @type {string} */ empty) => (body ? `<div class="wc-table-box"><table class="wc-table"><thead><tr>${cols}</tr></thead><tbody>${body}</tbody></table></div>` : `<p class="wc-hint">${esc(empty)}</p>`);
  return head + status + `<form class="wc-panel" data-form="gather" autocomplete="off"><div class="wc-panel-body wg-form">${DC_LIST}
      <h3 class="wg-h">Tiers (DC by scene tier)</h3>
      ${table("<th>Tier</th><th>DC</th><th><span class=\"wc-sr\">Remove</span></th>", tierRows, "No tiers: only nodes with their own DC have one.")}
      <p class="wc-row">${add("tiers", "Add tier", r.tiers.length >= TIERS_MAX)}</p>
      <h3 class="wg-h">Results</h3>
      <label class="wg-field"><span>Per success</span><span><input type="number" class="wg-num" name="qty" value="${r.qty}" min="1" max="${QTY_MAX}" step="1"> <span class="wc-hint">resources a success gives (a node can set its own)</span></span></label>
      <label class="wg-field"><span>Count</span><span><select name="qtyMode">${opt("perDay", "per day of the journey stage", r.qtyMode !== "flat")}${opt("flat", "flat (once per check)", r.qtyMode === "flat")}</select> <span class="wc-hint">per day: one check per stage gives Per success for each day of it (the Gather window's Days in this stage); harvesting a creature counts once</span></span></label>
      <label class="wg-field"><span>Rare margin</span><span><input type="number" class="wg-num" name="rareMargin" value="${nv(r.rareMargin)}" min="1" max="30" step="1"> <span class="wc-hint">beat the DC by this much and one resource is the rare one; empty: off</span></span></label>
      <label class="wg-field"><span>Reach</span><span><input type="number" class="wg-num" name="reach" value="${r.reach}" min="0" max="${REACH_MAX}" step="1"> <span class="wc-hint">grid spaces from the character's token to the node or creature; 0: any distance</span></span></label>
      <h3 class="wg-h">Gathering without a node</h3>
      <p class="wc-hint">What a profession finds in a scene's area (by the scene's tier, or any tier). No row: the check is made and the GM hands out what was found.</p>
      ${table("<th>Profession</th><th>Tier</th><th>Resource</th><th>Rare</th><th><span class=\"wc-sr\">Remove</span></th>", areaRows, "No area resources yet.")}
      <p class="wc-row">${add("areas", "Add area resource", r.areas.length >= AREAS_MAX)}</p>
      <h3 class="wg-h">Harvesting creatures</h3>
      <p class="wc-hint">A gathering profession can harvest a defeated NPC once: the resource by creature type, the DC by challenge rating.</p>
      ${table("<th>Up to CR</th><th>DC</th><th><span class=\"wc-sr\">Remove</span></th>", bandRows, "No CR bands: harvesting has no DC (it succeeds).")}
      <p class="wc-row">${add("crBands", "Add CR band", r.crBands.length >= BANDS_MAX)}</p>
      ${table("<th>Creature type</th><th>Profession</th><th>Resource</th><th>Rare</th><th>Needs bonus</th><th><span class=\"wc-sr\">Remove</span></th>", creatureRows, "No harvesting rows yet.")}
      <p class="wc-row">${add("creatures", "Add harvesting row", r.creatures.length >= CREATURES_MAX)}</p>
    </div><footer class="wc-row wc-end wg-pad"><button type="submit" class="wc-btn wc-btn-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save gathering rules</button></footer></form>
    <details class="wc-panel wg-io"><summary class="wg-pad">Import / export</summary><div class="wc-panel-body wg-form">
      <p class="wc-hint">Paste gathering rules as JSON and press Import to replace them. Download saves them.</p>
      <textarea data-wg-io="gather" rows="6">${esc(m.json)}</textarea>
      <p class="wc-row"><button type="button" class="wc-btn" data-action="ioImport" data-kind="gather">Import</button><button type="button" class="wc-btn" data-action="ioDownload" data-kind="gather">Download</button></p></div></details>`;
}

/**
 * Reads the Gathering page's form into raw rules (normalizeGatherRules checks them). Empty fields are null.
 * @param {Iterable<[string, unknown]>} entries
 */
export function readGatherForm(entries) {
  /** @type {Record<string, Record<number, Record<string, any>>>} */
  const lists = { tier: {}, band: {}, cre: {}, area: {} };
  /** @type {Record<string, any>} */
  const o = { v: GATHER_VERSION };
  const n = (/** @type {string} */ s) => (s === "" ? null : Number(s));
  for (const [k, v] of entries) {
    const s = String(v ?? "").trim();
    const m = /^(tier|band|cre|area)\.(\d{1,3})\.([a-zA-Z]+)(?:\.(uuid|name|img))?$/.exec(k);
    if (m) {
      const row = (lists[m[1]][Number(m[2])] ??= {});
      if (m[4]) (row[m[3]] ??= {})[m[4]] = s;
      else row[m[3]] = ["dc", "cr", "minBonus"].includes(m[3]) ? n(s) : s;
      continue;
    }
    if (["qty", "rareMargin", "reach"].includes(k)) o[k] = n(s);
    else if (k === "qtyMode") o.qtyMode = s;
  }
  const arr = (/** @type {string} */ key) => Object.keys(lists[key]).map(Number).sort((a, b) => a - b).map(i => {
    const row = lists[key][i];
    for (const f of ["item", "rare"]) if (row[f] && !row[f].uuid) row[f] = null;
    return row;
  });
  o.tiers = arr("tier"); o.crBands = arr("band"); o.creatures = arr("cre"); o.areas = arr("area");
  return o;
}
