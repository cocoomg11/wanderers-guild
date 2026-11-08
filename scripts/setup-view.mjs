/**
 * The GM setup window's pages as HTML, and the form readers, pure (tested in Node: tests/views.test.mjs). Core's shell
 * (`wc-shell` › `nav.wc-side` › `wc-nav`, `wc-main`) and components; setup.mjs routes the `data-action` clicks and reads the forms
 * with `readProfessionForm` / `readRanksForm`. Every value is escaped.
 */
import { navItem, statusLine, badge, readFix } from "../vendor/wanderers-core/index.mjs";
import { esc, TITLE } from "./const.mjs";
import { KINDS, KIND_KEYS, ICONS, ICON_KEYS, ACTIONS, ACTION_KEYS, KIND_ACTIONS, DEFAULT_CHECK, NAME_MAX, NOTES_MAX, PROFESSIONS_MAX } from "./professions-model.mjs";
import { RANKS_MAX, BONUS_MIN, BONUS_MAX, RANK_NAME_MAX, signed } from "./ranks-model.mjs";

/** @type {ReadonlyArray<{ id: string, label: string, icon: string, feature?: string }>} */
export const NAV = Object.freeze([
  { id: "professions", label: "Professions", icon: "fa-solid fa-hammer" },
  { id: "ranks", label: "Ranks", icon: "fa-solid fa-stairs" },
  { id: "recipes", label: "Recipes", icon: "fa-solid fa-scroll", feature: "crafting" },
  { id: "crafting", label: "Crafting rules", icon: "fa-solid fa-scale-balanced", feature: "crafting" },
  { id: "gathering", label: "Gathering", icon: "fa-solid fa-leaf", feature: "gathering" },
  { id: "settings", label: "Settings", icon: "fa-solid fa-sliders" },
  { id: "health", label: "Health", icon: "fa-solid fa-heart-pulse" },
  { id: "data", label: "Data", icon: "fa-solid fa-database" }
]);
export const PAGE_IDS = Object.freeze(NAV.map(n => n.id));
/** A known page (and shown: `hidden` lists pages of features that are off) or the first. @param {unknown} p @param {string[]} [hidden] */
export const pickPage = (p, hidden = []) => (PAGE_IDS.includes(String(p)) && !hidden.includes(String(p)) ? String(p) : PAGE_IDS[0]);

/** Sidebar keys: the next index for ArrowUp/ArrowDown/Home/End, or -1. @param {string} key @param {number} i @param {number} n */
export function nextNavIndex(key, i, n) {
  if (key === "ArrowDown" || key === "ArrowRight") return (i + 1) % n;
  if (key === "ArrowUp" || key === "ArrowLeft") return (i - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return -1;
}

const svg = (/** @type {string} */ d) => `<svg class="wg-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${esc(d)}"></path></svg>`;

/**
 * The shell around a page.
 * @param {string} page @param {string} body @param {{ version?: string, dots?: Record<string, string>, hidden?: string[] }} [o]
 */
export function shellHTML(page, body, o = {}) {
  const nav = NAV.filter(n => !(o.hidden ?? []).includes(n.id)).map(n => navItem({ label: n.label, page: n.id, icon: n.icon, active: n.id === page, tabindex: n.id === page ? 0 : -1, ...(o.dots?.[n.id] ? { dot: o.dots[n.id] } : {}) })).join("");
  return `<div class="wc-shell wg-shell"><nav class="wc-side" aria-label="${esc(TITLE)} setup sections">${nav}<span class="wc-side-foot">${esc(TITLE)} <code>${esc(o.version ?? "")}</code></span></nav>
    <main class="wc-main wg-main">${body}</main></div>`;
}

/** @param {string} title @param {string} meta @param {string} [buttons] */
const pagehead = (title, meta, buttons = "") => `<header class="wc-pagehead"><div class="wc-pagehead-title"><h2>${esc(title)}</h2><div class="wc-pagehead-meta">${meta}</div></div>${buttons}</header>`;

/** @param {string[]} warnings */
const warnBox = warnings => (warnings.length ? `<div class="wc-alert wc-warn" role="status"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><p class="wc-alert-title">Worth a look</p>${warnings.map(w => `<p>${esc(w)}</p>`).join("")}</div></div>` : "");

/**
 * @typedef {import("./professions-model.mjs").Profession} Profession
 * @typedef {{ key: string, label: string }} Choice
 */

/**
 * The Professions page: the list, and the editor when `editing` is an id or "new".
 * @param {{ list: Profession[], tools: Choice[], skills: Choice[], editing?: string | null, warnings?: string[] }} m
 */
export function professionsPage(m) {
  const toolLabel = (/** @type {string} */ k) => m.tools.find(t => t.key === k)?.label ?? k;
  const rows = m.list.map((p, i) => `<tr data-id="${esc(p.id)}"${m.editing === p.id ? ` class="active"` : ""}>
      <td><span class="wg-ico sm" aria-hidden="true">${svg(ICONS[p.icon]?.d ?? "")}</span></td>
      <td><b>${esc(p.name)}</b></td><td>${esc(KINDS[p.kind].label)}</td>
      <td>${p.tools.length ? esc(p.tools.map(toolLabel).join(", ")) : `<span class="wc-hint">No tool needed</span>`}</td>
      <td class="wc-end wg-nowrap">
        <button type="button" class="wc-btn wc-btn-sm wc-btn-icon wc-btn-ghost" data-action="profUp" data-id="${esc(p.id)}" aria-label="Move ${esc(p.name)} up"${i === 0 ? " disabled" : ""}><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
        <button type="button" class="wc-btn wc-btn-sm wc-btn-icon wc-btn-ghost" data-action="profDown" data-id="${esc(p.id)}" aria-label="Move ${esc(p.name)} down"${i === m.list.length - 1 ? " disabled" : ""}><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
        <button type="button" class="wc-btn wc-btn-sm" data-action="profEdit" data-id="${esc(p.id)}">Edit</button>
        <button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-action="profDelete" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button>
      </td></tr>`).join("");
  const table = m.list.length
    ? `<div class="wc-table-box"><table class="wc-table"><thead><tr><th><span class="wc-sr">Icon</span></th><th>Name</th><th>Kind</th><th>Tools (any one)</th><th><span class="wc-sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<section class="wc-panel"><div class="wc-panel-body"><p>No professions yet. Add one, or press <b>Add starter set</b> for one plain profession per artisan's tool and the herbalism kit (rename, remove or relink them as you like).</p></div></section>`;
  const editing = m.editing === "new" ? null : m.list.find(p => p.id === m.editing) ?? null;
  const editor = m.editing ? editorHTML(editing, m) : "";
  const full = m.list.length >= PROFESSIONS_MAX;
  const buttons = `<div class="wc-row"><button type="button" class="wc-btn" data-action="profStarter">Add starter set</button>
    <button type="button" class="wc-btn wc-btn-primary" data-action="profNew"${full ? " disabled" : ""}><i class="fa-solid fa-plus" aria-hidden="true"></i> Add profession</button></div>`;
  return pagehead("Professions", `${badge("info", `${m.list.length} of ${PROFESSIONS_MAX}`, { small: true })}<span class="wc-hint">A character has every profession whose tool they are proficient with. Players can read this list.</span>`, buttons)
    + warnBox(m.warnings ?? []) + editor + table;
}

/**
 * The editor form (a new profession when `p` is null).
 * @param {Profession | null} p @param {{ tools: Choice[], skills: Choice[] }} m
 */
export function editorHTML(p, m) {
  const kind = p?.kind ?? "crafting";
  const actions = p?.actions ?? KIND_ACTIONS[kind];
  const icon = p?.icon ?? "hammer";
  const opt = (/** @type {string} */ v, /** @type {string} */ label, /** @type {boolean} */ sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;
  const toolBoxes = m.tools.map(t => `<label class="wg-check"><input type="checkbox" name="tools" value="${esc(t.key)}"${p?.tools.includes(t.key) ? " checked" : ""}> ${esc(t.label)}</label>`).join("");
  const missing = (p?.tools ?? []).filter(k => !m.tools.some(t => t.key === k))
    .map(k => `<label class="wg-check"><input type="checkbox" name="tools" value="${esc(k)}" checked> ${esc(k)} <span class="wc-badge wc-badge-sm wc-warn">not in this world</span></label>`).join("");
  const icons = ICON_KEYS.map(k => `<label class="wg-iconpick" title="${esc(ICONS[k].label)}"><input type="radio" name="icon" value="${esc(k)}"${k === icon ? " checked" : ""}><span class="wg-ico">${svg(ICONS[k].d)}</span><span class="wc-sr">${esc(ICONS[k].label)}</span></label>`).join("");
  const check = p?.check ?? DEFAULT_CHECK;
  return `<form class="wc-panel wg-editor" data-form="profession" autocomplete="off">
    <header class="wc-panel-head"><h3>${p ? `Edit ${esc(p.name)}` : "New profession"}</h3></header>
    <div class="wc-panel-body wg-form">
      <input type="hidden" name="id" value="${esc(p?.id ?? "")}">
      <label class="wg-field"><span>Name</span><input type="text" name="name" required maxlength="${NAME_MAX}" value="${esc(p?.name ?? "")}"></label>
      <label class="wg-field"><span>Kind</span><select name="kind">${KIND_KEYS.map(k => opt(k, KINDS[k].label, k === kind)).join("")}</select></label>
      <p class="wc-hint">${KIND_KEYS.map(k => `<b>${esc(KINDS[k].label)}</b>: ${esc(KINDS[k].hint)}`).join(" ")}</p>
      <fieldset class="wg-fieldset"><legend>Actions</legend>${ACTION_KEYS.map(a => `<label class="wg-check"><input type="checkbox" name="actions" value="${a}"${actions.includes(a) ? " checked" : ""}> ${esc(ACTIONS[a].label)}</label>`).join("")}
        <p class="wc-hint">Craft and Recipes open the Crafting window (feature Crafting); Gather is a placeholder in this version.</p></fieldset>
      <fieldset class="wg-fieldset"><legend>Linked tools (proficiency with any one of them)</legend><div class="wg-checks">${toolBoxes}${missing}</div>
        <p class="wc-hint">None ticked: everyone has this profession, no tool needed.</p></fieldset>
      <label class="wg-field"><span>Gathering check</span><select name="check">${m.skills.map(s => opt(s.key, s.label, s.key === check)).join("")}${m.skills.some(s => s.key === check) ? "" : opt(check, check, true)}</select></label>
      <label class="wg-field"><span>Gathering rolls</span><select name="roll">${opt("skill", "The gathering check (skill)", p?.roll !== "tool")}${opt("tool", "The linked tool (best proficiency)", p?.roll === "tool")}</select></label>
      <fieldset class="wg-fieldset"><legend>Icon</legend><div class="wg-icons">${icons}</div></fieldset>
      <label class="wg-field wg-wide"><span>Note for players</span><textarea name="notes" rows="2" maxlength="${NOTES_MAX}">${esc(p?.notes ?? "")}</textarea></label>
    </div>
    <footer class="wc-row wc-end wg-pad"><button type="button" class="wc-btn wc-btn-ghost" data-action="profCancel">Cancel</button>
      <button type="submit" class="wc-btn wc-btn-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save profession</button></footer>
  </form>`;
}

/**
 * The Ranks page: one editable row per proficiency bonus.
 * @param {{ rows: import("./ranks-model.mjs").RankRow[], rarities: Choice[], warnings?: string[], dirty?: boolean }} m
 */
export function ranksPage(m) {
  const opt = (/** @type {string} */ v, /** @type {string} */ label, /** @type {boolean} */ sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;
  const rows = m.rows.map((r, i) => `<tr>
    <td><input type="number" name="bonus.${i}" min="${BONUS_MIN}" max="${BONUS_MAX}" step="1" value="${r.bonus}" aria-label="Proficiency bonus, row ${i + 1}" class="wg-num"></td>
    <td><input type="text" name="name.${i}" maxlength="${RANK_NAME_MAX}" value="${esc(r.name)}" aria-label="Rank name, row ${i + 1}"></td>
    <td><select name="rarity.${i}" aria-label="Highest rarity, row ${i + 1}">${opt("", "(none)", !r.rarity)}${m.rarities.map(x => opt(x.key, x.label, x.key === r.rarity)).join("")}</select></td>
    <td class="wc-end"><button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-action="rankRemove" data-index="${i}" aria-label="Remove rank ${esc(r.name)}"${m.rows.length <= 1 ? " disabled" : ""}>Remove</button></td></tr>`).join("");
  const buttons = `<div class="wc-row"><button type="button" class="wc-btn" data-action="rankDefaults">Reset to defaults</button></div>`;
  return pagehead("Ranks", `<span class="wc-hint">A profession's rank is the character's proficiency bonus (${signed(2)} at level 1, up to ${signed(6)} by the SRD table).</span>`, buttons)
    + warnBox(m.warnings ?? [])
    + `<form class="wc-panel" data-form="ranks" autocomplete="off"><div class="wc-table-box"><table class="wc-table">
      <thead><tr><th>Bonus</th><th>Rank name</th><th>Crafts up to</th><th><span class="wc-sr">Remove</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <footer class="wc-row wg-pad"><button type="button" class="wc-btn" data-action="rankAdd"${m.rows.length >= RANKS_MAX ? " disabled" : ""}><i class="fa-solid fa-plus" aria-hidden="true"></i> Add rank</button>
        <span class="wc-grow wc-hint">${m.dirty ? "Unsaved changes." : "Rows are sorted by bonus when saved; one row per bonus."}</span>
        <button type="submit" class="wc-btn wc-btn-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save ranks</button></footer></form>`;
}

/**
 * The Settings page: one switch per row, or a select for a choice row (instant). Feature switches are in Configure Settings (they reload).
 * @param {{ rows: Array<{ key: string, label: string, hint: string, value: boolean | string, choices?: Record<string, string> }> }} m
 */
export function settingsPage(m) {
  const rows = m.rows.map(r => (r.choices
    ? `<label class="wg-switch wg-choice"><span><b>${esc(r.label)}</b><span class="wc-hint">${esc(r.hint)}</span></span><select data-setting-choice="${esc(r.key)}">${Object.entries(r.choices).map(([k, l]) => `<option value="${esc(k)}"${k === r.value ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`
    : `<label class="wg-switch"><input type="checkbox" data-setting="${esc(r.key)}"${r.value ? " checked" : ""}><span><b>${esc(r.label)}</b><span class="wc-hint">${esc(r.hint)}</span></span></label>`)).join("");
  return pagehead("Settings", `<span class="wc-hint">Changes apply at once. The tool switches (Feature: …) are in Game Settings › ${esc(TITLE)} and reload Foundry.</span>`)
    + `<section class="wc-panel"><div class="wc-panel-body wg-form">${rows}</div></section>`
    + `<p class="wc-row"><button type="button" class="wc-btn wc-btn-ghost" data-action="resetWindows">Reset window positions</button></p>`;
}

/** A health fix key: "section:line". */
export const FIX_KEY_RE = /^\d{1,3}:\d{1,4}$/;

/**
 * The fix of the report line at `key` ("s:l"), or null (bad key, no line, no fix, or a fix without `run`: an action id only the
 * Satchel resolves). @param {unknown} report @param {unknown} key @returns {{ label: string, run: () => unknown, confirm?: string } | null}
 */
export function fixAt(report, key) {
  if (typeof key !== "string" || !FIX_KEY_RE.test(key) || !Array.isArray(report)) return null;
  const [s, l] = key.split(":").map(Number);
  const f = readFix(report[s]?.lines?.[l]?.fix);
  return f && typeof f.run === "function" ? /** @type {any} */ (f) : null;
}

/** The notice after a fix ran: its own text when it returned one, else a generic line. @param {string} label @param {unknown} result */
export function fixNotice(label, result) {
  if (result === false) return { level: "warn", text: `${label}: nothing was changed.` };
  if (typeof result === "string" && result.trim()) return { level: "info", text: result.trim().slice(0, 300) };
  return { level: "info", text: `${label}: done.` };
}

/**
 * The Health page. A line with a fix (one with `run`) gets a Fix button (`data-action="healthFix"`, `data-fix` "s:l"); `busy` is
 * the key of the fix that is running (its button disabled, "Working…"); `fixed` the notice of the last fix.
 * @param {{ report: Array<{ title: string, lines: Array<{ level: string, text: string, fix?: unknown }> }> | null, busy?: string | null, fixed?: { level: string, text: string } | null }} m
 */
export function healthPage(m) {
  const busy = m.busy ?? null;
  const notice = m.fixed ? `<ul class="wc-lines">${statusLine(String(m.fixed.level), String(m.fixed.text))}</ul>` : "";
  const body = m.report === null ? `<p class="wc-hint">Checking…</p>`
    : m.report.map((sec, s) => {
      const lines = (Array.isArray(sec?.lines) ? sec.lines : []).map((line, l) => {
        const key = `${s}:${l}`; const f = fixAt(m.report, key);
        const btn = f ? ` <button type="button" class="wc-btn wc-btn-sm wg-fix" data-action="healthFix" data-fix="${key}"${busy ? " disabled" : ""}>${esc(busy === key ? "Working…" : f.label)}</button>` : "";
        return statusLine(String(line?.level ?? "info"), String(line?.text ?? ""), { html: btn });
      }).join("");
      return `<section class="wc-panel"><header class="wc-panel-head"><h3>${esc(sec.title || TITLE)}</h3></header><div class="wc-panel-body"><ul class="wc-lines">${lines}</ul></div></section>`;
    }).join("");
  return pagehead("Health", `<span class="wc-hint">The check changes nothing; a Fix button asks first.</span>`, `<button type="button" class="wc-btn" data-action="healthRun"${busy ? " disabled" : ""}>Run again</button>`) + notice + body;
}

/**
 * The Data page: Remove Wanderer's Guild data (a dry run with ticks, then the word REMOVE).
 * @param {{ rows: Array<{ key: string, label: string, count: number, ticked: boolean, text: string }> }} m
 */
export function dataPage(m) {
  const rows = m.rows.map(r => `<label class="wg-check wg-block"><input type="checkbox" name="pick" value="${esc(r.key)}"${r.ticked && r.count ? " checked" : ""}${r.count ? "" : " disabled"}> ${esc(r.label)} <span class="wc-hint">(${esc(r.text)})</span></label>`).join("");
  return pagehead(`Remove ${TITLE} data`, `<span class="wc-hint">Counted first; nothing is removed until you type REMOVE.</span>`)
    + `<form class="wc-panel" data-form="cleanup" autocomplete="off"><div class="wc-panel-body wg-form">${rows}
      <label class="wg-field"><span>Type REMOVE to confirm</span><input type="text" name="word" autocomplete="off" spellcheck="false"></label></div>
      <footer class="wc-row wc-end wg-pad"><button type="submit" class="wc-btn wc-btn-danger"><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove picked data</button></footer></form>`;
}

/**
 * Reads the profession editor's fields (FormData entries) into a raw profession for `upsert`.
 * @param {Iterable<[string, unknown]>} entries
 */
export function readProfessionForm(entries) {
  /** @type {Record<string, any>} */
  const o = { tools: [], actions: [] };
  for (const [k, v] of entries) {
    const s = String(v ?? "");
    if (k === "tools" || k === "actions") o[k].push(s);
    else if (["id", "name", "kind", "icon", "check", "roll", "notes"].includes(k)) o[k] = s;
  }
  if (!o.id) delete o.id;
  return o;
}

/**
 * Reads the ranks form (`bonus.N`, `name.N`, `rarity.N`) into rows in form order (normalizeRanks sorts and checks them).
 * @param {Iterable<[string, unknown]>} entries
 */
export function readRanksForm(entries) {
  /** @type {Record<number, Record<string, unknown>>} */
  const by = {};
  for (const [k, v] of entries) {
    const m = /^(bonus|name|rarity)\.(\d{1,3})$/.exec(k);
    if (!m) continue;
    (by[Number(m[2])] ??= {})[m[1]] = m[1] === "bonus" ? Number(v) : String(v ?? "");
  }
  return Object.keys(by).map(Number).sort((a, b) => a - b).map(i => by[i]);
}
