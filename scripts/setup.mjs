/**
 * The GM setup window (feature "professions"): Professions (definitions), Ranks (the rank table), Recipes and Crafting rules
 * (feature "crafting"), Settings (instant switches), Health (the read-only report) and Data (Remove Wanderer's Guild data). Core's
 * shell; pages are pure strings from setup-view.mjs and craft-setup-view.mjs; this file keeps the page state, routes `data-action`
 * clicks and item drops, and saves forms through data.mjs (GM clicks only). Untested in Node.
 */
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { RememberedWindow, resetPlacement } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { F, S, changed } from "./core.mjs";
import * as V from "./setup-view.mjs";
import * as CV from "./craft-setup-view.mjs";
import * as PM from "./professions-model.mjs";
import * as RM from "./ranks-model.mjs";
import * as RC from "./recipes-model.mjs";
import * as CM from "./craft-model.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Data from "./data.mjs";
import * as Health from "./health.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as GM from "./gather-model.mjs";
import * as GV from "./gather-view.mjs";

/** @type {SetupApp | null} */
let app = null;

/** Pages of features that are off. */
const hiddenPages = () => V.NAV.filter(n => n.feature && !F.on(n.feature)).map(n => n.id);

const Base = RememberedWindow(foundry.applications.api.ApplicationV2, { moduleId: ID, key: "setup" });

export class SetupApp extends Base {
  static DEFAULT_OPTIONS = {
    id: `${ID}-setup`,
    classes: ["wg-window", "wg-setup-window", ...UI_CLASSES],
    window: { title: `${TITLE}: setup`, icon: "fa-solid fa-hammer", resizable: true },
    position: { width: 900, height: 700 }
  };

  /** @param {Record<string, any>} [options] */
  constructor(options = {}) {
    super(options);
    this.page = V.pickPage(options.page, hiddenPages());
    /** @type {string | null} id being edited, "new", or null */
    this.editing = null;
    /** @type {import("./ranks-model.mjs").RankRow[] | null} unsaved rank rows */
    this.rankDraft = null;
    /** @type {string | null} recipe id being edited, "new", or null */
    this.recipeEditing = null;
    /** @type {any} unsaved recipe fields */
    this.recipeDraft = null;
    /** Item snapshots read for dropped UUIDs. @type {Map<string, ReturnType<typeof D5.itemSnapshot>>} */
    this.snaps = new Map();
    this.recipeFilter = "";
    /** @type {any[] | null} */
    this.report = null;
    /** @type {GM.GatherRules | null} unsaved gathering rules (rows added or removed, items dropped) */
    this.gatherDraft = null;
  }

  async _renderHTML() {
    const div = document.createElement("div");
    if (!game.user?.isGM) { div.textContent = "GM only."; return div; }
    div.innerHTML = V.shellHTML(this.page, this.#body(), { version: game.modules.get(ID)?.version, hidden: hiddenPages() });
    return /** @type {HTMLElement} */ (div.firstElementChild);
  }

  #rarities() {
    const rl = D5.rarityLabels();
    return RM.RARITY_KEYS.map(k => ({ key: k, label: RM.rarityLabel(k, rl) }));
  }

  #body() {
    const tools = D5.toolChoices();
    if (this.page === "professions") {
      const list = Data.professions();
      return V.professionsPage({ list: list.list, tools, skills: D5.skillChoices(), editing: this.editing, warnings: PM.professionWarnings(list, tools.map(t => t.key)) });
    }
    if (this.page === "ranks") {
      const rows = this.rankDraft ?? Data.ranks().rows;
      return V.ranksPage({ rows, rarities: this.#rarities(), warnings: RM.rankWarnings({ v: RM.RANKS_VERSION, rows }), dirty: !!this.rankDraft });
    }
    if (this.page === "recipes") {
      const book = Data.recipes(); const profs = Data.professions().list;
      const professions = [...profs].sort((a, b) => Number(b.kind === "crafting") - Number(a.kind === "crafting")).map(p => ({ key: p.id, label: p.name }));
      return CV.recipesPage({ list: book.list, professions, rarities: this.#rarities(), editing: this.recipeEditing, draft: this.recipeDraft, warnings: RC.recipeWarnings(book, profs.map(p => p.id)), json: RC.exportRecipes(book), filter: this.recipeFilter });
    }
    if (this.page === "crafting") {
      const rules = Data.rules();
      return CV.rulesPage({ rules, rarities: this.#rarities(), ranks: Data.ranks().rows, status: CM.rulesStatus(rules), json: CM.exportRules(rules) });
    }
    if (this.page === "gathering") {
      const rules = this.gatherDraft ?? Data.gatherRules();
      const professions = Data.professions().list.filter(p => p.actions.includes("gather")).map(p => ({ key: p.id, label: p.name }));
      /** @type {Map<string, number>} */ const counts = new Map();
      for (const sc of game.scenes ?? []) for (const n of sc.notes ?? []) if (Data.nodeOf(n)) counts.set(sc.name, (counts.get(sc.name) ?? 0) + 1);
      const at = Data.gatherEpoch();
      return GV.gatherPage({ rules, professions, types: D5.creatureTypeChoices(), status: GM.gatherStatus(rules), json: GM.exportGatherRules(rules), nodes: [...counts].map(([scene, count]) => ({ scene, count })), epoch: at ? new Date(at).toLocaleString(game.i18n?.lang) : "" });
    }
    if (this.page === "settings") {
      const rows = S.ROWS.filter(r => r.tab === "settings" && r.type === "bool" && (!r.feature || F.on(r.feature))).map(r => ({ key: r.key, label: r.label ?? r.key, hint: r.hint ?? "", value: !!S.get(r.key) }));
      return V.settingsPage({ rows });
    }
    if (this.page === "health") {
      if (!this.report) { try { this.report = Health.run(); } catch (e) { this.report = [{ title: TITLE, lines: [{ level: "warn", text: String(/** @type {any} */ (e)?.message ?? e) }] }]; } }
      return V.healthPage({ report: this.report });
    }
    return V.dataPage({ rows: Cleanup.dryRunRows() });
  }

  /** @param {HTMLElement} result @param {HTMLElement} content */
  _replaceHTML(result, content) {
    const scroll = content.querySelector(".wc-main")?.scrollTop ?? 0;
    const ioOpen = !!content.querySelector("details.wg-io[open]");
    content.replaceChildren(result);
    const main = content.querySelector(".wc-main"); if (main && scroll) main.scrollTop = scroll;
    if (ioOpen) content.querySelector("details.wg-io")?.setAttribute("open", "");
    for (const form of content.querySelectorAll("form[data-form]")) form.addEventListener("submit", ev => { ev.preventDefault(); this.#submit(/** @type {HTMLFormElement} */ (form)); });
    for (const box of content.querySelectorAll("input[data-setting]")) box.addEventListener("change", () => this.#setting(/** @type {HTMLInputElement} */ (box)));
    // Rank and recipe edits are kept as drafts so Add / Remove (and drops) don't lose typed values.
    content.querySelector("form[data-form=ranks]")?.addEventListener("input", ev => { this.rankDraft = this.#rankRows(/** @type {HTMLFormElement} */ (/** @type {HTMLElement} */ (ev.target).closest("form"))); });
    content.querySelector("form[data-form=gather]")?.addEventListener("input", ev => { this.gatherDraft = this.#gatherRules(/** @type {HTMLFormElement} */ (/** @type {HTMLElement} */ (ev.target).closest("form"))); });
    const recipeForm = /** @type {HTMLFormElement | null} */ (content.querySelector("form[data-form=recipe]"));
    recipeForm?.addEventListener("input", () => { this.recipeDraft = this.#recipeDraft(recipeForm); });
    const filter = /** @type {HTMLSelectElement | null} */ (content.querySelector("[data-wg-recfilter]"));
    filter?.addEventListener("change", () => { this.recipeFilter = filter.value; this.render(); });
    for (const zone of /** @type {NodeListOf<HTMLElement>} */ (content.querySelectorAll("[data-wg-drop]"))) {
      zone.addEventListener("dragover", ev => { ev.preventDefault(); zone.classList.add("wg-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("wg-over"));
      zone.addEventListener("drop", ev => { ev.preventDefault(); ev.stopPropagation(); zone.classList.remove("wg-over"); this.#drop(ev, String(zone.dataset.wgDrop)); });
    }
    // Sidebar: one tab stop; arrows, Home, End move; Enter/Space must not reach Foundry's key bindings (Space pauses the game).
    const nav = /** @type {HTMLElement[]} */ ([...content.querySelectorAll(".wc-side .wc-nav")]);
    nav.forEach((b, i) => b.addEventListener("keydown", ev => {
      if (ev.key === " " || ev.key === "Enter") { ev.stopPropagation(); return; }
      const j = V.nextNavIndex(ev.key, i, nav.length); if (j < 0) return;
      ev.preventDefault(); ev.stopPropagation(); nav[j].focus();
    }));
  }

  /** @param {PointerEvent} event @param {HTMLElement} target */
  async _onClickAction(event, target) {
    const a = target.dataset.action; const id = target.dataset.id ?? "";
    if (a === "nav") { this.page = V.pickPage(target.dataset.page, hiddenPages()); if (this.page === "health") this.report = null; return this.render(); }
    if (a === "profNew") { this.editing = "new"; return this.render(); }
    if (a === "profEdit") { this.editing = id; return this.render(); }
    if (a === "profCancel") { this.editing = null; return this.render(); }
    if (a === "profUp" || a === "profDown") { await Data.saveProfessions(PM.move(Data.professions(), id, a === "profUp" ? -1 : 1)); return this.render(); }
    if (a === "profDelete") {
      const p = Data.professions().list.find(x => x.id === id); if (!p) return;
      if (!await confirm(`Delete ${p.name}?`, "Characters keep their tool proficiencies; only the profession goes.")) return;
      await Data.saveProfessions(PM.remove(Data.professions(), id));
      if (this.editing === id) this.editing = null;
      return this.render();
    }
    if (a === "profStarter") { await Data.addStarterSet(); return this.render(); }
    if (a === "rankAdd") {
      const rows = this.#currentRanks();
      const top = rows.length ? rows[rows.length - 1].bonus : 1;
      rows.push({ bonus: Math.min(RM.BONUS_MAX, top + 1), name: "", rarity: "" });
      this.rankDraft = rows; return this.render();
    }
    if (a === "rankRemove") { const rows = this.#currentRanks(); rows.splice(Number(target.dataset.index), 1); this.rankDraft = rows; return this.render(); }
    if (a === "rankDefaults") {
      if (!await confirm("Reset the rank table?", "The names and rarities go back to the defaults.")) return;
      this.rankDraft = null; await Data.saveRanks(RM.defaultRanks()); return this.render();
    }
    if (a === "recNew") { this.recipeEditing = "new"; this.recipeDraft = this.recipeFilter ? { profession: this.recipeFilter } : null; return this.render(); }
    if (a === "recEdit") { this.recipeEditing = id; this.recipeDraft = null; return this.render(); }
    if (a === "recCancel") { this.recipeEditing = null; this.recipeDraft = null; return this.render(); }
    if (a === "recDelete") {
      const r = Data.recipes().list.find(x => x.id === id); if (!r) return;
      if (!await confirm(`Delete ${r.name}?`, "Characters who learned it keep the id in their list, but it no longer shows anywhere.")) return;
      await Data.saveRecipes(RC.removeRecipe(Data.recipes(), id));
      if (this.recipeEditing === id) { this.recipeEditing = null; this.recipeDraft = null; }
      return this.render();
    }
    if (a === "recRefresh") return this.#refreshAll();
    if (a === "matAdd" || a === "matRemove") {
      const form = /** @type {HTMLFormElement | null} */ (this.element?.querySelector("form[data-form=recipe]")); if (!form) return;
      const d = this.#recipeDraft(form);
      if (a === "matAdd") d.materials.push({ uuid: "", name: "", qty: 1 }); else d.materials.splice(Number(target.dataset.index), 1);
      this.recipeDraft = d; return this.render();
    }
    if (a === "rulesClear") {
      if (!await confirm("Clear the crafting rules?", "Every field goes back to not set.")) return;
      await Data.saveRules(CM.defaultRules()); return this.render();
    }
    if (a === "gRowAdd" || a === "gRowRemove") return this.#gatherRow(a, String(target.dataset.list ?? ""), Number(target.dataset.index));
    if (a === "gatherReset") {
      if (!await confirm("Reset gathering limits?", "Every character may gather again at every node and in every scene (node uses are not refilled).")) return;
      await Data.resetGatherLimits(); ui.notifications.info(`${TITLE}: gathering limits reset.`); return this.render();
    }
    if (a === "ioDownload") return this.#download(/** @type {any} */ (["rules", "gather"].includes(String(target.dataset.kind)) ? target.dataset.kind : "recipes"));
    if (a === "ioImport") return this.#import(/** @type {any} */ (["rules", "gather"].includes(String(target.dataset.kind)) ? target.dataset.kind : "recipes"));
    if (a === "healthRun") { this.report = null; return this.render(); }
    if (a === "resetWindows") { await resetPlacement(ID); ui.notifications.info(`${TITLE}: window positions reset (open windows move when reopened).`); }
  }

  /** The Gathering page's rules as on screen (normalized; rows without a profession or type are dropped). @param {HTMLFormElement | null} form */
  #gatherRules(form) {
    return form ? GM.normalizeGatherRules(GV.readGatherForm(new FormData(form).entries())) : (this.gatherDraft ?? Data.gatherRules());
  }

  /** Adds or removes a row on the Gathering page (kept as a draft until Save). @param {string} a @param {string} list @param {number} index */
  #gatherRow(a, list, index) {
    const form = /** @type {HTMLFormElement | null} */ (this.element?.querySelector("form[data-form=gather]"));
    const r = /** @type {any} */ (this.#gatherRules(form));
    if (!["tiers", "crBands", "creatures", "areas"].includes(list)) return;
    if (a === "gRowRemove") r[list].splice(index, 1);
    else if (list === "tiers") { const ids = new Set(r.tiers.map((/** @type {any} */ t) => t.id)); let n = r.tiers.length + 1; while (ids.has(`t${n}`)) n++; r.tiers.push({ id: `t${n}`, name: `Tier ${n}`, dc: null }); }
    else if (list === "crBands") { const top = Math.max(0, ...r.crBands.map((/** @type {any} */ b) => b.cr)); r.crBands.push({ cr: Math.min(GM.CR_MAX, top + 1), dc: null }); }
    else {
      const prof = Data.professions().list.find(p => p.actions.includes("gather"))?.id;
      if (!prof) { ui.notifications.warn(`${TITLE}: add a profession with the Gather action first.`); return; }
      if (list === "creatures") {
        const types = D5.creatureTypeChoices().map(t => t.key);
        const type = types.find(t => !r.creatures.some((/** @type {any} */ c) => c.type === t && c.profession === prof)) ?? types[0] ?? "beast";
        r.creatures.push({ type, profession: prof, item: null, rare: null, minBonus: null });
      } else {
        const tier = [{ id: "" }, ...r.tiers].map((/** @type {any} */ t) => t.id).find((/** @type {string} */ t) => !r.areas.some((/** @type {any} */ x) => x.profession === prof && x.tier === t)) ?? "";
        r.areas.push({ profession: prof, tier, item: null, rare: null });
      }
    }
    this.gatherDraft = GM.normalizeGatherRules(r);
    this.render();
  }

  /** The rank rows as on screen (the draft, else the stored table). */
  #currentRanks() {
    const form = /** @type {HTMLFormElement | null} */ (this.element?.querySelector("form[data-form=ranks]"));
    return form ? this.#rankRows(form) : [...(this.rankDraft ?? Data.ranks().rows)].map(r => ({ ...r }));
  }

  /** @param {HTMLFormElement | null} form */
  #rankRows(form) {
    if (!form) return [];
    return /** @type {import("./ranks-model.mjs").RankRow[]} */ (V.readRanksForm(new FormData(form).entries()));
  }

  /**
   * The recipe editor's fields, with the result's snapshot (from a drop, or the stored recipe when its UUID is unchanged).
   * @param {HTMLFormElement} form
   */
  #recipeDraft(form) {
    const d = CV.readRecipeForm(new FormData(form).entries());
    const stored = Data.recipes().list.find(r => r.id === d.id);
    const snap = this.snaps.get(d.result.uuid) ?? (stored?.result.uuid === d.result.uuid ? stored?.result : null);
    if (snap) d.result = /** @type {any} */ ({ ...snap, uuid: d.result.uuid, qty: d.result.qty });
    return d;
  }

  /** An item dropped on the recipe editor or a Gathering page row. @param {DragEvent} ev @param {string} where */
  async #drop(ev, where) {
    let data; try { data = JSON.parse(ev.dataTransfer?.getData("text/plain") ?? ""); } catch { return; }
    if (data?.type !== "Item" || typeof data.uuid !== "string") { ui.notifications.warn(`${TITLE}: drop an item.`); return; }
    const gm = /^(cre|area)\.(\d{1,3})\.(item|rare)$/.exec(where);
    if (gm) {
      const form = /** @type {HTMLFormElement | null} */ (this.element?.querySelector("form[data-form=gather]")); if (!form) return;
      const doc = await fromUuid(data.uuid).catch(() => null);
      if (!doc || doc.documentName !== "Item") { ui.notifications.warn(`${TITLE}: that item can't be read.`); return; }
      const r = this.#gatherRules(form);
      const row = /** @type {any} */ ((gm[1] === "cre" ? r.creatures : r.areas)[Number(gm[2])]);
      if (row) row[gm[3]] = { uuid: doc.uuid, name: doc.name, img: doc.img };
      this.gatherDraft = r; this.render(); return;
    }
    const form = /** @type {HTMLFormElement | null} */ (this.element?.querySelector("form[data-form=recipe]")); if (!form) return;
    const doc = await fromUuid(data.uuid).catch(() => null);
    if (!doc || doc.documentName !== "Item") { ui.notifications.warn(`${TITLE}: that item can't be read.`); return; }
    const snap = D5.itemSnapshot(doc); this.snaps.set(snap.uuid, snap);
    const d = this.#recipeDraft(form);
    if (where === "result") { d.result = /** @type {any} */ ({ ...snap, qty: d.result.qty }); if (!d.name) d.name = snap.name; }
    else if (where === "mat.new") { if (d.materials.length < RC.MATERIALS_MAX) d.materials.push(/** @type {any} */ ({ uuid: snap.uuid, name: snap.name, img: snap.img, qty: 1 })); }
    else { const i = Number(where.split(".")[1]); if (d.materials[i]) Object.assign(d.materials[i], { uuid: snap.uuid, name: d.materials[i].name || snap.name, img: snap.img }); }
    this.recipeDraft = d; this.render();
  }

  /**
   * Fills a raw recipe's item snapshots: the result read in full (one document), materials' names and pictures from the index.
   * @param {any} raw
   */
  async #resolve(raw) {
    if (raw.result?.uuid) {
      const doc = this.snaps.has(raw.result.uuid) ? null : await fromUuid(raw.result.uuid).catch(() => null);
      const snap = this.snaps.get(raw.result.uuid) ?? (doc?.documentName === "Item" ? D5.itemSnapshot(doc) : null);
      if (snap) raw.result = { ...snap, qty: raw.result.qty };
      else if (!raw.result.name) ui.notifications.warn(`${TITLE}: the result item ${raw.result.uuid} can't be read; saved without its details.`);
    }
    for (const m of raw.materials ?? []) {
      if (!m.uuid) continue;
      const idx = this.snaps.get(m.uuid) ?? fromUuidSync(m.uuid);
      if (idx) { m.name ||= idx.name ?? ""; m.img ||= idx.img ?? ""; }
    }
    return raw;
  }

  /** Re-reads every recipe's result item (sequentially: one document each). */
  async #refreshAll() {
    if (!await confirm("Refresh every recipe from its item?", "Each result item is read again for its name, picture, type, rarity and price. Compendium items load one by one, so a long list takes a moment.")) return;
    let book = Data.recipes(); let n = 0; this.snaps.clear();
    for (const r of book.list) {
      if (!r.result.uuid) continue;
      const doc = await fromUuid(r.result.uuid).catch(() => null);
      if (doc?.documentName !== "Item") continue;
      const up = RC.upsertRecipe(book, { ...r, result: { ...D5.itemSnapshot(doc), qty: r.result.qty } });
      if (up.list) { book = up.list; n += 1; }
    }
    await Data.saveRecipes(book);
    ui.notifications.info(`${TITLE}: ${n} recipe(s) refreshed.`);
    this.render();
  }

  /** @param {"recipes" | "rules" | "gather"} kind */
  #download(kind) {
    const text = kind === "rules" ? CM.exportRules(Data.rules()) : kind === "gather" ? GM.exportGatherRules(Data.gatherRules()) : RC.exportRecipes(Data.recipes());
    const world = String(game.world?.id ?? "world").replace(/[^A-Za-z0-9_-]/g, "");
    foundry.utils.saveDataToFile(text, "application/json", `${ID}-${kind === "rules" ? "crafting-rules" : kind === "gather" ? "gathering-rules" : "recipes"}-${world}.json`);
  }

  /** @param {"recipes" | "rules" | "gather"} kind */
  async #import(kind) {
    const box = /** @type {HTMLTextAreaElement | null} */ (this.element?.querySelector(`[data-wg-io="${kind}"]`)); if (!box) return;
    if (kind === "gather") {
      const r = GM.readGatherImport(box.value);
      if (!r.ok) { ui.notifications.warn(`${TITLE}: ${r.error}`); return; }
      if (!await confirm("Replace the gathering rules?", "The pasted rules replace every field on this page.")) return;
      await Data.saveGatherRules(r.rules); this.gatherDraft = null; ui.notifications.info(`${TITLE}: gathering rules imported.`); return this.render();
    }
    if (kind === "rules") {
      const r = CM.readRulesImport(box.value);
      if (!r.ok || !r.rules) { ui.notifications.warn(`${TITLE}: ${r.error}`); return; }
      if (!await confirm("Replace the crafting rules?", "The pasted rules replace every field on this page.")) return;
      await Data.saveRules(r.rules); ui.notifications.info(`${TITLE}: crafting rules imported.`); return this.render();
    }
    const r = RC.readRecipesImport(box.value);
    if (!r.ok || !r.list) { ui.notifications.warn(`${TITLE}: ${r.error}`); return; }
    const m = RC.mergeRecipes(Data.recipes(), r.list);
    if (!await confirm("Import these recipes?", `${m.added} new, ${m.replaced} replacing a recipe with the same id${m.skipped || r.dropped ? `, ${m.skipped + (r.dropped ?? 0)} skipped` : ""}.`)) return;
    await Data.saveRecipes(m.list);
    ui.notifications.info(`${TITLE}: recipes imported.`);
    this.render();
  }

  /** @param {HTMLFormElement} form */
  async #submit(form) {
    const kind = form.dataset.form;
    if (kind === "profession") {
      const raw = V.readProfessionForm(new FormData(form).entries());
      const r = PM.upsert(Data.professions(), raw);
      if (r.error) { ui.notifications.warn(`${TITLE}: ${r.error}`); return; }
      await Data.saveProfessions(r.list);
      this.editing = null; this.render();
    } else if (kind === "ranks") {
      const rows = this.#rankRows(form);
      const table = RM.normalizeRanks({ v: RM.RANKS_VERSION, rows });
      if (table.rows.length < rows.length) ui.notifications.warn(`${TITLE}: ${rows.length - table.rows.length} row(s) dropped (a bonus outside ${RM.BONUS_MIN}–${RM.BONUS_MAX}, or one used twice).`);
      await Data.saveRanks(table);
      this.rankDraft = null; this.render();
    } else if (kind === "recipe") {
      const raw = await this.#resolve(this.#recipeDraft(form));
      const r = RC.upsertRecipe(Data.recipes(), raw);
      if (r.error) { ui.notifications.warn(`${TITLE}: ${r.error}`); return; }
      await Data.saveRecipes(r.list);
      this.recipeEditing = null; this.recipeDraft = null; this.render();
    } else if (kind === "rules") {
      await Data.saveRules(CV.readRulesForm(new FormData(form).entries()));
      ui.notifications.info(`${TITLE}: crafting rules saved.`);
      this.render();
    } else if (kind === "gather") {
      const before = this.#gatherRules(form);
      await Data.saveGatherRules(before);
      this.gatherDraft = null;
      ui.notifications.info(`${TITLE}: gathering rules saved.`);
      this.render();
    } else if (kind === "cleanup") {
      const fd = new FormData(form);
      const pick = Object.fromEntries(fd.getAll("pick").map(k => [String(k), true]));
      const done = await Cleanup.remove(pick, String(fd.get("word") ?? ""));
      if (done) { ui.notifications.info(`${TITLE}: removed ${Cleanup.describe(done)}.`); this.editing = null; this.rankDraft = null; this.recipeEditing = null; this.recipeDraft = null; this.gatherDraft = null; this.render(); }
    }
  }

  /** @param {HTMLInputElement} box */
  async #setting(box) {
    const key = box.dataset.setting ?? "";
    if (!S.ROWS.some(r => r.key === key && r.tab === "settings")) return;
    await S.set(key, box.checked);
  }

  /** @param {any} options */
  _onClose(options) { super._onClose?.(options); if (app === this) app = null; }
}

/** A yes/no question (DialogV2 with core's look). @param {string} title @param {string} text */
async function confirm(title, text) {
  try {
    return !!await foundry.applications.api.DialogV2.confirm({ window: { title }, content: `<p>${text.replace(/[<>&]/g, "")}</p>`, classes: ["wg-dialog", ...UI_CLASSES] });
  } catch { return false; }
}

/** Opens the setup window (GM), on a page when given. @param {string} [page] */
export function open(page) {
  if (!game.user?.isGM) { ui.notifications.warn(`${TITLE}: GM only.`); return undefined; }
  if (!app) app = new SetupApp({ page });
  else if (page) app.page = V.pickPage(page, hiddenPages());
  app.render({ force: true });
  return app;
}

/** Redraw on data changes from any GM (another tab, the Satchel's Fix button). */
export function registerHooks() {
  changed.add(() => { if (app?.rendered) { app.report = null; app.render(); } });
}

/** The Configure Settings menu entry that opens this window. */
export function registerMenu() {
  class Opener extends foundry.applications.api.ApplicationV2 {
    async render() { open(); return this; }
  }
  game.settings.registerMenu(ID, "setup", { name: "Professions setup", label: "Open setup", hint: "Profession definitions, the rank table, recipes and crafting rules, switches, health check and Remove data.", icon: "fa-solid fa-hammer", type: Opener, restricted: true });
}
