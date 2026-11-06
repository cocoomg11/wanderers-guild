/**
 * The GM setup window (feature "professions"): Professions (definitions), Ranks (the rank table), Settings (instant switches),
 * Health (the read-only report) and Data (Remove Wanderer's Guild data). Core's shell; pages are pure strings from setup-view.mjs;
 * this file keeps the page state, routes `data-action` clicks and saves forms through data.mjs (GM clicks only). Untested in Node.
 */
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { RememberedWindow, resetPlacement } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { S, changed } from "./core.mjs";
import * as V from "./setup-view.mjs";
import * as PM from "./professions-model.mjs";
import * as RM from "./ranks-model.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Data from "./data.mjs";
import * as Health from "./health.mjs";
import * as Cleanup from "./cleanup.mjs";

/** @type {SetupApp | null} */
let app = null;

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
    this.page = V.pickPage(options.page);
    /** @type {string | null} id being edited, "new", or null */
    this.editing = null;
    /** @type {import("./ranks-model.mjs").RankRow[] | null} unsaved rank rows */
    this.rankDraft = null;
    /** @type {any[] | null} */
    this.report = null;
  }

  async _renderHTML() {
    const div = document.createElement("div");
    if (!game.user?.isGM) { div.textContent = "GM only."; return div; }
    div.innerHTML = V.shellHTML(this.page, this.#body(), { version: game.modules.get(ID)?.version });
    return /** @type {HTMLElement} */ (div.firstElementChild);
  }

  #body() {
    const tools = D5.toolChoices();
    if (this.page === "professions") {
      const list = Data.professions();
      return V.professionsPage({ list: list.list, tools, skills: D5.skillChoices(), editing: this.editing, warnings: PM.professionWarnings(list, tools.map(t => t.key)) });
    }
    if (this.page === "ranks") {
      const rows = this.rankDraft ?? Data.ranks().rows;
      const rl = D5.rarityLabels();
      const rarities = RM.RARITY_KEYS.map(k => ({ key: k, label: RM.rarityLabel(k, rl) }));
      return V.ranksPage({ rows, rarities, warnings: RM.rankWarnings({ v: RM.RANKS_VERSION, rows }), dirty: !!this.rankDraft });
    }
    if (this.page === "settings") {
      const rows = S.ROWS.filter(r => r.tab === "settings" && r.type === "bool").map(r => ({ key: r.key, label: r.label ?? r.key, hint: r.hint ?? "", value: !!S.get(r.key) }));
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
    content.replaceChildren(result);
    const main = content.querySelector(".wc-main"); if (main && scroll) main.scrollTop = scroll;
    for (const form of content.querySelectorAll("form[data-form]")) form.addEventListener("submit", ev => { ev.preventDefault(); this.#submit(/** @type {HTMLFormElement} */ (form)); });
    for (const box of content.querySelectorAll("input[data-setting]")) box.addEventListener("change", () => this.#setting(/** @type {HTMLInputElement} */ (box)));
    // Rank edits are kept as a draft so Add / Remove don't lose typed values.
    content.querySelector("form[data-form=ranks]")?.addEventListener("input", ev => { this.rankDraft = this.#rankRows(/** @type {HTMLFormElement} */ (/** @type {HTMLElement} */ (ev.target).closest("form"))); });
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
    if (a === "nav") { this.page = V.pickPage(target.dataset.page); if (this.page === "health") this.report = null; return this.render(); }
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
    if (a === "healthRun") { this.report = null; return this.render(); }
    if (a === "resetWindows") { await resetPlacement(ID); ui.notifications.info(`${TITLE}: window positions reset (open windows move when reopened).`); }
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
    } else if (kind === "cleanup") {
      const fd = new FormData(form);
      const pick = Object.fromEntries(fd.getAll("pick").map(k => [String(k), true]));
      const done = await Cleanup.remove(pick, String(fd.get("word") ?? ""));
      if (done) { ui.notifications.info(`${TITLE}: removed ${Cleanup.describe(done)}.`); this.editing = null; this.rankDraft = null; this.render(); }
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
  else if (page) app.page = V.pickPage(page);
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
  game.settings.registerMenu(ID, "setup", { name: "Professions setup", label: "Open setup", hint: "Profession definitions, the rank table, switches, health check and Remove data.", icon: "fa-solid fa-hammer", type: Opener, restricted: true });
}
