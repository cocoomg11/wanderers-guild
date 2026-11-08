/**
 * The setup window's Recipes and Crafting rules pages, and their form readers, pure (tested in Node: tests/crafting-views.test.mjs).
 * Core's components (`wc-pagehead`, `wc-panel`, `wc-table`, `wc-btn`, `wc-alert`); setup.mjs routes the `data-action` clicks and
 * the item drops (`data-wg-drop`), resolves the dropped UUIDs and saves through data.mjs. Every value is escaped.
 *
 * The rules page ships empty: every number is the GM's to fill in from the rules their table uses (hints say so), or to paste as
 * JSON in the Import / export box.
 */
import { esc } from "./const.mjs";
import { badge } from "../vendor/wanderers-core/index.mjs";
import { RECIPES_MAX, MATERIALS_MAX, RECIPE_NAME_MAX, GROUP_MAX, RECIPE_NOTES_MAX, QTY_MAX, DC_MIN, DC_MAX, RARITY_OVERRIDES, LEARN_ROUTES } from "./recipes-model.mjs";
import { ROUTE_LABELS } from "./learn-model.mjs";
import { FAIL_RULES, ROUNDING, PCT_MAX, HELPERS_MAX, DAY_HOURS_MAX, RULES_VERSION } from "./craft-model.mjs";
import { signed } from "./ranks-model.mjs";

/** @typedef {{ key: string, label: string }} Choice */

/** @param {string} title @param {string} meta @param {string} [buttons] */
const pagehead = (title, meta, buttons = "") => `<header class="wc-pagehead"><div class="wc-pagehead-title"><h2>${esc(title)}</h2><div class="wc-pagehead-meta">${meta}</div></div>${buttons}</header>`;
/** @param {string[]} w */
const warnBox = w => (w.length ? `<div class="wc-alert wc-warn" role="status"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><p class="wc-alert-title">Worth a look</p>${w.map(x => `<p>${esc(x)}</p>`).join("")}</div></div>` : "");
/** @param {string} v @param {string} label @param {boolean} sel */
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;
/** A number input's value ("" for not set). @param {number | null | undefined} n */
const nv = n => (n === null || n === undefined ? "" : String(n));

/**
 * The Import / export box (a textarea holding the current JSON; paste over it and press Import).
 * @param {"recipes" | "rules"} kind @param {string} json @param {string} hint
 */
export function ioPanel(kind, json, hint) {
  return `<details class="wc-panel wg-io"><summary class="wc-panel-head"><h3>Import / export JSON</h3></summary><div class="wc-panel-body wg-form">
    <p class="wc-hint">${esc(hint)}</p>
    <textarea class="wg-json" rows="8" spellcheck="false" data-wg-io="${kind}" aria-label="${kind === "recipes" ? "Recipes" : "Crafting rules"} as JSON">${esc(json)}</textarea>
    <div class="wc-row"><button type="button" class="wc-btn" data-action="ioDownload" data-kind="${kind}"><i class="fa-solid fa-download" aria-hidden="true"></i> Download</button>
      <span class="wc-grow"></span><button type="button" class="wc-btn wc-btn-primary" data-action="ioImport" data-kind="${kind}"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Import from the box</button></div></div></details>`;
}

/**
 * @typedef {import("./recipes-model.mjs").Recipe} Recipe
 * @typedef {{ id?: string, name?: string, profession?: string, group?: string, result?: Partial<import("./recipes-model.mjs").RecipeResult>, rarity?: string, materials?: Array<Partial<import("./recipes-model.mjs").Material>>, dc?: number | null, hours?: number | null, cost?: number | null, auto?: boolean, learn?: string, notes?: string }} RecipeDraft
 * @typedef {{ uuid: string, name: string, img: string, consume: boolean }} TeachItem a world item that teaches the recipe
 */

/**
 * The Recipes page: the list and, when editing, the editor (`draft` holds unsaved fields).
 * @param {{ list: Recipe[], professions: Choice[], rarities: Choice[], editing?: string | null, draft?: RecipeDraft | null, warnings?: string[], json: string, filter?: string, teachItems?: TeachItem[] }} m
 */
export function recipesPage(m) {
  const profLabel = (/** @type {string} */ id) => m.professions.find(p => p.key === id)?.label ?? (id ? `${id} (missing)` : "(none)");
  const rarLabel = (/** @type {string} */ k) => m.rarities.find(r => r.key === k)?.label ?? k;
  const list = m.filter ? m.list.filter(r => r.profession === m.filter) : m.list;
  const rows = list.map(r => `<tr data-id="${esc(r.id)}"${m.editing === r.id ? ` class="active"` : ""}>
      <td><b>${esc(r.name)}</b>${r.auto ? ` ${badge("info", "everyone", { small: true })}` : ""}${!r.auto && r.learn === "item" ? ` ${badge("info", "recipe item", { small: true })}` : ""}${!r.auto && r.learn === "gm" ? ` ${badge("info", "GM only", { small: true })}` : ""}${r.group ? `<br><span class="wc-hint">${esc(r.group)}</span>` : ""}</td>
      <td>${esc(profLabel(r.profession))}</td>
      <td>${r.result.uuid ? esc(r.result.name || r.result.uuid) : `<span class="wc-hint">no item</span>`}${r.result.qty > 1 ? ` × ${r.result.qty}` : ""}</td>
      <td>${esc(r.rarity === "none" ? "Mundane" : rarLabel(r.rarity || r.result.rarity) || "Mundane")}</td>
      <td>${r.materials.length}</td>
      <td class="wc-end wg-nowrap"><button type="button" class="wc-btn wc-btn-sm" data-action="recTeach" data-id="${esc(r.id)}" aria-label="Teach ${esc(r.name)} to characters"${r.auto ? " disabled" : ""}>Teach to…</button>
        <button type="button" class="wc-btn wc-btn-sm" data-action="recEdit" data-id="${esc(r.id)}">Edit</button>
        <button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-action="recDelete" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">Delete</button></td></tr>`).join("");
  const filter = `<label class="wg-check">Show <select data-wg-recfilter>${opt("", "every profession", !m.filter)}${m.professions.map(p => opt(p.key, p.label, p.key === m.filter)).join("")}</select></label>`;
  const table = m.list.length
    ? `<div class="wc-row wg-pad">${filter}</div><div class="wc-table-box"><table class="wc-table"><thead><tr><th>Recipe</th><th>Profession</th><th>Makes</th><th>Rarity</th><th>Materials</th><th><span class="wc-sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<section class="wc-panel"><div class="wc-panel-body"><p>No recipes yet. A recipe names the item it makes (drag an item onto the editor), the profession that makes it and the materials it uses. Characters learn recipes one by one, or a recipe can be known by everyone with its profession.</p></div></section>`;
  const editor = m.editing ? recipeEditor(m.editing === "new" ? null : m.list.find(r => r.id === m.editing) ?? null, m) : "";
  const full = m.list.length >= RECIPES_MAX;
  const buttons = `<div class="wc-row"><button type="button" class="wc-btn" data-action="recRefresh"${m.list.length ? "" : " disabled"}>Refresh from items</button>
    <button type="button" class="wc-btn wc-btn-primary" data-action="recNew"${full ? " disabled" : ""}><i class="fa-solid fa-plus" aria-hidden="true"></i> Add recipe</button></div>`;
  return pagehead("Recipes", `${badge("info", `${m.list.length} of ${RECIPES_MAX}`, { small: true })}<span class="wc-hint">Players can read every recipe (keep secrets out of the notes).</span>`, buttons)
    + warnBox(m.warnings ?? []) + editor + table
    + ioPanel("recipes", m.json, "Paste recipes as JSON and press Import: a recipe with the same id replaces the old one, new ids are added. Download saves this world's recipes.");
}

/**
 * The recipe editor (a new recipe when `r` is null; the draft's fields win over the stored ones).
 * @param {Recipe | null} r @param {{ professions: Choice[], rarities: Choice[], draft?: RecipeDraft | null, teachItems?: TeachItem[] }} m
 */
export function recipeEditor(r, m) {
  const d = /** @type {RecipeDraft} */ ({ ...(r ?? {}), ...(m.draft ?? {}) });
  const res = { ...(r?.result ?? {}), ...(d.result ?? {}) };
  const mats = d.materials ?? r?.materials ?? [];
  const matRows = mats.map((x, i) => `<tr><td><input type="text" name="mat.name.${i}" maxlength="${RECIPE_NAME_MAX}" value="${esc(x.name ?? "")}" aria-label="Material ${i + 1} name"></td>
      <td><input type="text" name="mat.uuid.${i}" value="${esc(x.uuid ?? "")}" placeholder="drop an item" aria-label="Material ${i + 1} item UUID" data-wg-drop="mat.${i}"></td>
      <td><input type="number" class="wg-num" name="mat.qty.${i}" min="1" max="${QTY_MAX}" step="1" value="${esc(String(x.qty ?? 1))}" aria-label="Material ${i + 1} quantity"></td>
      <td class="wc-end"><button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-action="matRemove" data-index="${i}" aria-label="Remove material ${i + 1}">Remove</button></td></tr>`).join("");
  const preview = res.uuid ? `<p class="wc-hint">${res.img ? `<img class="wg-thumb" src="${esc(res.img)}" alt="">` : ""}${esc(res.name || "(not read yet: saved on Save)")}${res.rarity ? ` · ${esc(m.rarities.find(x => x.key === res.rarity)?.label ?? res.rarity)}` : ""}${res.type ? ` · ${esc(res.type)}` : ""}${res.price ? ` · ${esc(String(res.price.value))} ${esc(res.price.denomination)}` : ""}</p>` : "";
  return `<form class="wc-panel wg-editor" data-form="recipe" autocomplete="off">
    <header class="wc-panel-head"><h3>${r ? `Edit ${esc(r.name)}` : "New recipe"}</h3></header>
    <div class="wc-panel-body wg-form">
      <input type="hidden" name="id" value="${esc(r?.id ?? "")}">
      <div class="wg-drop" data-wg-drop="result"><label class="wg-field"><span>Makes (item UUID)</span><input type="text" name="result.uuid" value="${esc(res.uuid ?? "")}" placeholder="drag an item here"></label>
        ${preview}<label class="wg-field"><span>How many</span><input type="number" class="wg-num" name="result.qty" min="1" max="${QTY_MAX}" step="1" value="${esc(String(res.qty ?? 1))}"></label></div>
      <label class="wg-field"><span>Name</span><input type="text" name="name" maxlength="${RECIPE_NAME_MAX}" value="${esc(d.name ?? "")}" placeholder="the item's name when empty"></label>
      <label class="wg-field"><span>Profession</span><select name="profession">${opt("", "(pick one)", !d.profession)}${m.professions.map(p => opt(p.key, p.label, p.key === d.profession)).join("")}</select></label>
      <label class="wg-field"><span>Section</span><input type="text" name="group" maxlength="${GROUP_MAX}" value="${esc(d.group ?? "")}" placeholder="e.g. Weapons; empty: by item type"></label>
      <label class="wg-field"><span>Rarity</span><select name="rarity">${RARITY_OVERRIDES.map(k => opt(k, k === "" ? "The item's own" : k === "none" ? "Mundane (no rarity)" : m.rarities.find(x => x.key === k)?.label ?? k, k === (d.rarity ?? ""))).join("")}</select></label>
      <p class="wc-hint">The rarity decides which rank can craft it (the Ranks page) and which row of the rarity table it uses.</p>
      <label class="wg-field"><span>DC</span><input type="number" class="wg-num" name="dc" min="${DC_MIN}" max="${DC_MAX}" step="1" value="${nv(d.dc)}" placeholder="rules"></label>
      <label class="wg-field"><span>Time (hours)</span><input type="number" class="wg-num" name="hours" min="0" step="any" value="${nv(d.hours)}" placeholder="rules"></label>
      <label class="wg-field"><span>Coin cost (gp)</span><input type="number" class="wg-num" name="cost" min="0" step="any" value="${nv(d.cost)}" placeholder="rules"></label>
      <p class="wc-hint">Leave DC, time and cost empty to use the Crafting rules page. Time is only shown, never added to the calendar.</p>
      <label class="wg-check"><input type="checkbox" name="auto"${d.auto ? " checked" : ""}> Known by everyone with the profession (no need to learn it)</label>
      <label class="wg-field"><span>Learned by</span><select name="learn">${LEARN_ROUTES.map(k => opt(k, ROUTE_LABELS[k], k === (d.learn ?? "rank"))).join("")}</select></label>
      <p class="wc-hint">Rank: a player learns it on the Recipes page when their rank allows. Recipe item: only by using a recipe item (sold or found like any item), or a GM teaching it. GM only: only a GM teaches it. A GM can always teach a recipe (Teach, Teach to…).</p>
      ${teachBox(r, m.teachItems ?? [])}
      <fieldset class="wg-fieldset"><legend>Materials (used up on a craft)</legend>
        <div class="wg-drop" data-wg-drop="mat.new">${mats.length ? `<table class="wc-table"><thead><tr><th>Name</th><th>Item UUID</th><th>Qty</th><th><span class="wc-sr">Remove</span></th></tr></thead><tbody>${matRows}</tbody></table>` : `<p class="wc-hint">None yet: drop items here, or press Add material.</p>`}</div>
        <p class="wc-row"><button type="button" class="wc-btn wc-btn-sm" data-action="matAdd"${mats.length >= MATERIALS_MAX ? " disabled" : ""}><i class="fa-solid fa-plus" aria-hidden="true"></i> Add material</button>
          <span class="wc-hint">A carried item counts when it came from that item (same UUID source), or by name when no UUID is given.</span></p></fieldset>
      <label class="wg-field wg-wide"><span>Note for players</span><textarea name="notes" rows="2" maxlength="${RECIPE_NOTES_MAX}">${esc(d.notes ?? "")}</textarea></label>
    </div>
    <footer class="wc-row wc-end wg-pad"><button type="button" class="wc-btn wc-btn-ghost" data-action="recCancel">Cancel</button>
      <button type="submit" class="wc-btn wc-btn-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save recipe</button></footer></form>`;
}

/**
 * The *Taught by item* box of the recipe editor: the world items that teach this recipe (keep / use up, Remove), a drop zone and
 * *Make recipe item*. Only for a saved recipe (the flag names its id).
 * @param {Recipe | null} r @param {TeachItem[]} items
 */
export function teachBox(r, items) {
  if (!r) return `<fieldset class="wg-fieldset"><legend>Taught by item</legend><p class="wc-hint">Save the recipe first, then drop an item here or make a recipe item.</p></fieldset>`;
  const rows = items.map((it, i) => `<tr><td>${it.img ? `<img class="wg-thumb" src="${esc(it.img)}" alt="">` : ""}${esc(it.name)}</td>
      <td><label class="wg-check"><input type="checkbox" data-wg-keep="${esc(it.uuid)}"${it.consume ? "" : " checked"} aria-label="Keep ${esc(it.name)} after learning"> Kept after learning</label></td>
      <td class="wc-end"><button type="button" class="wc-btn wc-btn-sm wc-btn-danger" data-action="teachRemove" data-item="${esc(it.uuid)}" data-index="${i}" aria-label="Stop ${esc(it.name)} teaching this recipe">Remove</button></td></tr>`).join("");
  return `<fieldset class="wg-fieldset"><legend>Taught by item</legend>
    <div class="wg-drop" data-wg-drop="teach">${items.length ? `<table class="wc-table"><thead><tr><th>Item</th><th>After learning</th><th><span class="wc-sr">Remove</span></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="wc-hint">No item teaches it yet: drop an item from the Items sidebar here, or make one.</p>`}</div>
    <p class="wc-row"><button type="button" class="wc-btn wc-btn-sm" data-action="teachMake" data-id="${esc(r.id)}"><i class="fa-solid fa-scroll" aria-hidden="true"></i> Make recipe item</button>
      <span class="wc-hint">A character carrying the item learns the recipe from it (their rank still applies); one is used up unless it is kept. Copies of the item (a merchant's stock, loot) teach too.</span></p></fieldset>`;
}

/**
 * The *Teach to…* picker: characters with a tick each (already known ones ticked and disabled).
 * @param {{ recipe: string, actors: Array<{ uuid: string, name: string, known: boolean, note: string }> }} m
 */
export function teachToHTML(m) {
  if (!m.actors.length) return `<p>No characters in this world yet.</p>`;
  return `<p class="wc-hint">Teach ${esc(m.recipe)} to the ticked characters (no rank check; a GM teaching).</p><div class="wg-form">${m.actors.map(a => `<label class="wg-check wg-block"><input type="checkbox" name="teach" value="${esc(a.uuid)}"${a.known ? " checked disabled" : ""}> ${esc(a.name)}${a.known ? ` <span class="wc-hint">(knows it)</span>` : a.note ? ` <span class="wc-hint">(${esc(a.note)})</span>` : ""}</label>`).join("")}</div>`;
}

/**
 * Reads the recipe editor's fields into a raw recipe (cleanRecipe checks them). The result's name, picture, type, rarity and price
 * come from the item when setup.mjs saves.
 * @param {Iterable<[string, unknown]>} entries
 * @returns {RecipeDraft & { result: { uuid: string, qty: number }, materials: Array<{ uuid: string, name: string, qty: number }> }}
 */
export function readRecipeForm(entries) {
  /** @type {Record<string, any>} */
  const o = { result: { uuid: "", qty: 1 }, materials: [], auto: false };
  /** @type {Record<number, Record<string, any>>} */
  const mats = {};
  for (const [k, v] of entries) {
    const s = String(v ?? "");
    const mm = /^mat\.(name|uuid|qty)\.(\d{1,2})$/.exec(k);
    if (mm) { (mats[Number(mm[2])] ??= {})[mm[1]] = mm[1] === "qty" ? Number(s) || 1 : s.trim(); continue; }
    if (k === "result.uuid") o.result.uuid = s.trim();
    else if (k === "result.qty") o.result.qty = Number(s) || 1;
    else if (k === "auto") o.auto = s === "on" || s === "true";
    else if (["dc", "hours", "cost"].includes(k)) o[k] = s.trim() === "" ? null : Number(s);
    else if (["id", "name", "profession", "group", "rarity", "notes", "learn"].includes(k)) o[k] = s;
  }
  o.materials = Object.keys(mats).map(Number).sort((a, b) => a - b).map(i => ({ uuid: mats[i].uuid ?? "", name: mats[i].name ?? "", qty: mats[i].qty ?? 1 }));
  if (!o.id) delete o.id;
  return /** @type {any} */ (o);
}

/**
 * The Crafting rules page. Every number starts empty: fill them in from your rules.
 * @param {{ rules: import("./craft-model.mjs").CraftRules, rarities: Choice[], ranks: import("./ranks-model.mjs").RankRow[], status: { set: string[], unset: string[] }, json: string }} m
 */
export function rulesPage(m) {
  const r = m.rules;
  const num = (/** @type {string} */ name, /** @type {number | null} */ v, /** @type {string} */ label, extra = "") => `<input type="number" class="wg-num" name="${name}" value="${nv(v)}" step="any" min="0" ${extra} aria-label="${esc(label)}">`;
  const rarRows = m.rarities.map(x => `<tr><td>${esc(x.label)}</td>
    <td>${num(`rarity.${x.key}.hours`, r.byRarity[x.key]?.hours ?? null, `${x.label}: hours`)}</td>
    <td>${num(`rarity.${x.key}.cost`, r.byRarity[x.key]?.cost ?? null, `${x.label}: cost in gp`)}</td>
    <td>${num(`rarity.${x.key}.dc`, r.byRarity[x.key]?.dc ?? null, `${x.label}: DC`, `min="${DC_MIN}" max="${DC_MAX}" step="1"`)}</td></tr>`).join("");
  const rankRows = m.ranks.map(x => `<tr><td>${esc(x.name)} ${signed(x.bonus)}</td><td>${num(`rankTime.${x.bonus}`, r.rankTime[String(x.bonus)] ?? null, `${x.name}: time percentage`, `min="1" max="${PCT_MAX}"`)}</td></tr>`).join("");
  const sel = (/** @type {string} */ name, /** @type {Record<string, string>} */ choices, /** @type {string} */ v) => `<select name="${name}">${Object.entries(choices).map(([k, l]) => opt(k, l, k === v)).join("")}</select>`;
  const status = `<p class="wc-hint">${m.status.set.length ? `Set: ${esc(m.status.set.join(", "))}.` : "Nothing is set yet."}${m.status.unset.length ? ` Not set: ${esc(m.status.unset.join(", "))}.` : ""}</p>`;
  return pagehead("Crafting rules", `<span class="wc-hint">Your table's numbers: nothing is filled in for you. Fill in what your rules say, leave the rest empty.</span>`)
    + `<div class="wc-alert wc-info" role="note"><i class="fa-solid fa-book" aria-hidden="true"></i><div><p class="wc-alert-title">Fill these in from your rules</p>
      <p>The module ships no rulebook figures. Empty fields mean "not set": the Crafting window says so, and a craft with no DC anywhere succeeds on the roll. Materials come from the character's inventory and are used up when the roll lands. A recipe's own DC, time and cost win over this page. Time is shown to the player and the GM for reference only; the calendar is never advanced.</p>${status}</div></div>`
    + `<form class="wc-panel" data-form="rules" autocomplete="off"><div class="wc-panel-body wg-form">
      <h3 class="wg-h">Time from the item's price</h3>
      <p class="wg-inline">${num("timeHours", r.timeHours, "Hours of work")} hours of work per ${num("timePerGp", r.timePerGp, "Gold pieces of price")} gp of the item's price. Rounded ${sel("rounding", ROUNDING, r.rounding)}.</p>
      <label class="wg-field"><span>A working day</span><span>${num("hoursPerDay", r.hoursPerDay, "Hours in a working day", `max="${DAY_HOURS_MAX}"`)} hours <span class="wc-hint">(for "days" in the time text and day rounding)</span></span></label>
      <h3 class="wg-h">Coin cost from the item's price</h3>
      <p class="wg-inline">${num("materialPct", r.materialPct, "Coin cost percentage", `max="${PCT_MAX}"`)} % of the item's price. ${`<label class="wg-check"><input type="checkbox" name="chargeCoin"${r.chargeCoin ? " checked" : ""}> Take it from the crafter's coin</label>`}</p>
      <h3 class="wg-h">Magic items by rarity</h3>
      <p class="wc-hint">Used for items with a rarity (instead of the price rules above, for whichever field is set). Cost in gp.</p>
      <div class="wc-table-box"><table class="wc-table"><thead><tr><th>Rarity</th><th>Hours</th><th>Cost (gp)</th><th>DC</th></tr></thead><tbody>${rarRows}</tbody></table></div>
      <p class="wg-inline">Consumables take ${num("consumablePct", r.consumablePct, "Consumable percentage", `max="${PCT_MAX}"`)} % of the rarity table's time and cost.</p>
      <h3 class="wg-h">Check</h3>
      <label class="wg-field"><span>Base DC</span><span>${num("dc", r.dc, "Base DC", `min="${DC_MIN}" max="${DC_MAX}" step="1"`)} <span class="wc-hint">when neither the recipe nor its rarity sets one</span></span></label>
      <label class="wg-field"><span>On a failed check</span><span>${sel("failMaterials", FAIL_RULES, r.failMaterials)} <span class="wc-hint">materials are taken when the roll lands; players see this before they craft</span></span></label>
      <h3 class="wg-h">Helpers</h3>
      <p class="wg-inline">Up to ${num("helpersMax", r.helpersMax, "Most helpers", `max="${HELPERS_MAX}" step="1"`)} helpers. <label class="wg-check"><input type="checkbox" name="helperDivides"${r.helperDivides ? " checked" : ""}> Each helper divides the time</label></p>
      <h3 class="wg-h">Time by rank</h3>
      <p class="wc-hint">A percentage of the time for crafters at that rank (empty = 100 %).</p>
      <div class="wc-table-box"><table class="wc-table"><thead><tr><th>Rank</th><th>Time %</th></tr></thead><tbody>${rankRows}</tbody></table></div>
    </div><footer class="wc-row wc-end wg-pad"><button type="button" class="wc-btn wc-btn-ghost" data-action="rulesClear">Clear all</button>
      <button type="submit" class="wc-btn wc-btn-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save rules</button></footer></form>`
    + ioPanel("rules", m.json, "Paste a rules set as JSON and press Import to replace these rules. Download saves them, to keep or to use in another world.");
}

/**
 * Reads the rules form into a raw rules object (normalizeRules checks it). Empty fields become null.
 * @param {Iterable<[string, unknown]>} entries
 */
export function readRulesForm(entries) {
  /** @type {Record<string, any>} */
  const o = { v: RULES_VERSION, byRarity: {}, rankTime: {}, chargeCoin: false, helperDivides: false };
  const n = (/** @type {string} */ s) => (s.trim() === "" ? null : Number(s));
  for (const [k, v] of entries) {
    const s = String(v ?? "");
    const rm = /^rarity\.([A-Za-z]+)\.(hours|cost|dc)$/.exec(k);
    if (rm) { (o.byRarity[rm[1]] ??= {})[rm[2]] = n(s); continue; }
    const tm = /^rankTime\.(\d{1,2})$/.exec(k);
    if (tm) { const p = n(s); if (p !== null) o.rankTime[tm[1]] = p; continue; }
    if (k === "chargeCoin" || k === "helperDivides") o[k] = s === "on" || s === "true";
    else if (k === "rounding" || k === "failMaterials") o[k] = s;
    else if (["timeHours", "timePerGp", "hoursPerDay", "materialPct", "consumablePct", "dc", "helpersMax"].includes(k)) o[k] = n(s);
  }
  if (o.consumablePct === null) o.consumablePct = 100;
  return o;
}
