/**
 * Gathering for players and GMs (feature "gathering"): the Gather window (one character and gathering profession: the nearest node
 * in reach, the scene's area, the targeted or selected defeated creature), the roll on this client, the `gather` request; nodes on
 * the canvas (our wrap of the Note class: visibility, double-click, look); the scene's tier field in core's Table Tools tab; redraw
 * hooks. Nothing here writes a document: the leader's handlers do (gather-leader.mjs), GM node edits are in nodes.mjs. Untested in
 * Node: the decision is gather-model.mjs, the HTML gather-view.mjs.
 */
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
import { RememberedWindow, sceneTab } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { S, leader, changed, log } from "./core.mjs";
import * as GM from "./gather-model.mjs";
import * as Data from "./data.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Nodes from "./nodes.mjs";
import { ICONS } from "./professions-model.mjs";
import { gatherFacts, nodesOn, nodeOf, rollLabel, sceneTier, distanceTo } from "./gather-read.mjs";
import { gatherWindowHTML, givesText, sceneSectionHTML } from "./gather-view.mjs";

/** Open windows by actor id. @type {Map<string, GatherApp>} */
const OPEN = new Map();
/** Marks our Note class (health check). */
export const MARK = Symbol.for(`${ID}.nodeNote`);

const canUse = (/** @type {any} */ actor) => !!game.user?.isGM || !!actor?.isOwner;
/** The character's gathering professions (learned, with the Gather action). @param {any} actor */
function gatherers(actor) {
  const f = D5.facts(actor);
  return Data.professions().list.filter(p => p.actions.includes("gather") && (p.tools.length === 0 || p.tools.some(t => (f.tools[t] ?? 0) >= 1)));
}

/** The creature to harvest: your first target, else a selected token that isn't the gatherer's. @param {any} actor */
function creatureToken(actor) {
  const t = [...(game.user?.targets ?? [])][0]?.document;
  if (t && t.actorId !== actor.id) return t;
  return canvas?.tokens?.controlled?.map((/** @type {any} */ c) => c.document).find((/** @type {any} */ d) => d.actorId !== actor.id && d.actor?.type === "npc") ?? null;
}

const Base = RememberedWindow(foundry.applications.api.ApplicationV2, { moduleId: ID, key: "gather" });

export class GatherApp extends Base {
  /** @param {any} actor @param {string} professionId @param {Record<string, any>} [options] */
  constructor(actor, professionId, options = {}) {
    super({ id: `${ID}-gather-${actor.id}`, ...options });
    this.actor = actor; this.professionId = professionId;
    /** @type {string | null} a node's Note UUID to list first (opened from the node) */ this.focus = options.focus ?? null;
    this.busy = false;
    /** @type {number | null} days typed into *Days in this stage* (null: the last journey's, else 1) */ this.daysTyped = null;
    OPEN.set(actor.id, this);
  }

  static DEFAULT_OPTIONS = {
    classes: ["wg-window", "wg-prof-window", "wg-gather-window", ...UI_CLASSES],
    window: { title: "Gather", icon: "fa-solid fa-leaf", resizable: true },
    position: { width: 520, height: 460 }
  };

  get title() { return `Gather: ${this.actor?.name ?? ""}`; }

  /**
   * Days in this journey stage: what the user typed, else the last journey's (from the reset record), else 1. For a player, at most
   * the last journey's length (1 without one), as the leader allows (`allowedDays`).
   */
  get days() { return GM.allowedDays(this.daysTyped ?? Data.journeyDays() ?? 1, { isGM: !!game.user?.isGM, journeyDays: Data.journeyDays() }); }

  /** The options shown: [{ option, target }]. */
  targets() {
    const scene = canvas?.scene; const isGM = !!game.user?.isGM;
    /** @type {Array<{ key: string, target: any }>} */ const list = [];
    if (scene) {
      const rules = Data.gatherRules();
      const nodes = nodesOn(scene, { all: isGM }).filter(n => n.node.profession === this.professionId);
      const near = nodes.map(n => ({ n, d: distanceTo(this.actor, scene, { x: n.note.x, y: n.note.y }) }))
        .filter(x => x.n.note.uuid === this.focus || isGM || !rules.reach || (x.d !== null && x.d <= rules.reach + 0.5))
        .sort((a, b) => (a.n.note.uuid === this.focus ? -1 : b.n.note.uuid === this.focus ? 1 : (a.d ?? 1e9) - (b.d ?? 1e9)));
      for (const x of near.slice(0, 5)) list.push({ key: `node:${x.n.note.uuid}`, target: { note: x.n.note } });
      // Area gathering when no node is really within reach (a GM sees every node, so reach is measured for GMs too).
      const inReach = near.some(x => !rules.reach || (x.d !== null && x.d <= rules.reach + 0.5));
      if (!inReach && S.get("gatherArea")) list.push({ key: `area:${scene.id}`, target: { scene } });
    }
    const tok = creatureToken(this.actor);
    if (tok) list.push({ key: `creature:${tok.uuid}`, target: { token: tok } });
    return list;
  }

  view() {
    const profs = gatherers(this.actor);
    const p = Data.professions().list.find(x => x.id === this.professionId);
    const isGM = !!game.user?.isGM;
    const days = this.days;
    const perDay = Data.gatherRules().qtyMode !== "flat";
    const options = this.targets().map(({ key, target }) => {
      const f = gatherFacts(this.actor, this.professionId, target, { isGM, days });
      const a = GM.assessGather(f);
      return { key, kind: f.kind, title: a.where, dcText: a.dcText, rollText: rollLabel(a.roll), gives: givesText(a, a.rareMargin), problems: a.problems, ok: a.ok };
    });
    const journey = Data.journeyDays();
    const daysField = perDay && options.some(o => o.kind !== "creature")
      ? { value: days, max: isGM ? GM.DAYS_MAX : GM.clampDays(journey ?? 1), hint: isGM ? (this.daysTyped === null && journey ? "from the last journey" : "") : journey ? `at most ${journey} (the last journey)` : "1 (no journey yet)" } : null;
    return {
      actorName: this.actor.name, profession: { id: this.professionId, name: p?.name ?? this.professionId, icon: ICONS[p?.icon ?? "pick"]?.d ?? ICONS.pick.d },
      professions: profs.map(x => ({ id: x.id, name: x.name })), options, days: daysField, noGM: !leader.activeGM(), locked: this.busy || !canUse(this.actor),
      note: canvas?.scene ? "Target (or select) a defeated creature to harvest it. Gathering at a node or in the area needs the character's token on this scene. The check is rolled here; the GM's client gives the items. Results go to chat." : "Open a scene with the character's token to gather."
    };
  }

  async _renderHTML() {
    const div = document.createElement("div");
    try { div.innerHTML = gatherWindowHTML(/** @type {any} */ (this.view())); } catch (e) {
      console.error(`${ID} | Gather window`, e);
      div.innerHTML = `<div class="wg-prof"><p class="wg-pad">This window couldn't be drawn: ${String(/** @type {any} */ (e)?.message ?? e).replace(/[<>&]/g, "")}</p></div>`;
    }
    return /** @type {HTMLElement} */ (div.firstElementChild ?? div);
  }

  /** @param {HTMLElement} result @param {HTMLElement} content */
  _replaceHTML(result, content) {
    content.replaceChildren(result);
    const sel = /** @type {HTMLSelectElement | null} */ (content.querySelector("[data-wg-gprof]"));
    sel?.addEventListener("change", () => { this.professionId = sel.value; this.render(); });
    const days = /** @type {HTMLInputElement | null} */ (content.querySelector("[data-wg-days]"));
    days?.addEventListener("change", () => { this.daysTyped = GM.clampDays(days.value); this.render(); });
    days?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); days.blur(); } });
  }

  /** @param {PointerEvent} _event @param {HTMLElement} target */
  async _onClickAction(_event, target) {
    if (target.dataset.action === "wgGatherNow") return this.#gather(String(target.dataset.key ?? ""));
  }

  /** Rolls the check here, then asks the active GM's client to give the items. @param {string} key */
  async #gather(key) {
    if (this.busy) return;
    const opt = this.targets().find(o => o.key === key); if (!opt) return;
    const f = gatherFacts(this.actor, this.professionId, opt.target, { isGM: !!game.user?.isGM, days: this.days });
    const a = GM.assessGather(f);
    if (!a.ok || !a.roll) { ui.notifications.warn(`${TITLE}: ${a.problems[0] ?? "can't gather here now."}`); return; }
    if (!leader.activeGM()) { ui.notifications.warn(`${TITLE}: a GM must be connected to gather.`); return; }
    const req = /** @type {Record<string, any>} */ ({ actor: this.actor.uuid, profession: this.professionId, days: this.days });
    if (opt.target.note) req.node = opt.target.note.uuid; else if (opt.target.token) req.token = opt.target.token.uuid; else req.scene = opt.target.scene.id;
    const targetKey = req.node ?? req.token ?? `scene:${req.scene}`;
    this.busy = true; this.render();
    try {
      const flags = { [ID]: { gatherRoll: { actor: this.actor.uuid, profession: this.professionId, target: targetKey } } };
      const config = a.roll.kind === "tool" ? { tool: a.roll.key } : { skill: a.roll.key };
      if (a.dc !== null) /** @type {any} */ (config).target = a.dc;
      const rolls = a.roll.kind === "tool" ? await this.actor.rollToolCheck(config, {}, { data: { flags } }) : await this.actor.rollSkill(config, {}, { data: { flags } });
      const msg = Array.isArray(rolls) ? rolls[0]?.parent : /** @type {any} */ (rolls)?.parent;
      if (!msg?.id) { log("gather: no roll message (cancelled?)"); return; }
      if (!leader.request("gather", { ...req, roll: msg.id })) ui.notifications.warn(`${TITLE}: no GM is connected; the roll wasn't used.`);
    } catch (e) {
      console.error(`${ID} | gather`, e);
      ui.notifications.error(`${TITLE}: the check failed (${String(/** @type {any} */ (e)?.message ?? e)}).`);
    } finally { this.busy = false; this.render(); }
  }

  /** @param {any} options */
  _onClose(options) { super._onClose?.(options); if (OPEN.get(this.actor?.id) === this) OPEN.delete(this.actor.id); }
}

/**
 * Opens the Gather window for an actor and gathering profession (the first one it has when none is given).
 * @param {any} actor an Actor, or its id or UUID @param {string} [professionId] @param {{ focus?: string }} [o] a node's Note UUID to list first
 */
export function open(actor, professionId, o = {}) {
  const a = typeof actor === "string" ? (game.actors?.get(actor) ?? fromUuidSync(actor)) : actor;
  if (!a || !(a instanceof Actor)) { ui.notifications.warn(`${TITLE}: pick a character.`); return undefined; }
  if (!canUse(a)) { ui.notifications.warn(`${TITLE}: only ${a.name}'s owner (or a GM) can gather for them.`); return undefined; }
  const profs = gatherers(a);
  const pid = professionId && profs.some(p => p.id === professionId) ? professionId : profs[0]?.id;
  if (!pid) { ui.notifications.warn(`${TITLE}: ${a.name} has no gathering profession.`); return undefined; }
  const app = OPEN.get(a.id) ?? new GatherApp(a, pid, { focus: o.focus ?? null });
  app.professionId = pid; app.focus = o.focus ?? app.focus;
  app.render({ force: true });
  return app;
}

/** Redraws open windows (all, or one actor's). @param {string} [actorId] */
export function refresh(actorId) {
  for (const [id, app] of OPEN) if (!actorId || id === actorId) { try { app.render(); } catch { /* closing */ } }
}

/** @type {((...args: any[]) => void) | null} */
let redrawAll = null;
/**
 * Redraws every open Gather window, at most once per 100 ms (`foundry.utils.debounce`): HP changes, token control and targeting
 * come in bursts (a fight, a drag-select). Bails at once when no Gather window is open.
 */
export function refreshSoon() {
  if (!OPEN.size) return;
  redrawAll ??= foundry.utils.debounce(() => { if (OPEN.size) refresh(); }, 100);
  redrawAll?.();
}

/** A node double-clicked: GM → the editor; player → the Gather window for their character. @param {any} note */
function onNodeOpen(note) {
  if (game.user?.isGM) return Nodes.edit(note).catch(e => console.warn(`${ID} | node`, e));
  const node = nodeOf(note); if (!node) return undefined;
  const mine = canvas?.tokens?.controlled?.map((/** @type {any} */ t) => t.actor).find((/** @type {any} */ a) => a?.isOwner) ?? game.user?.character;
  if (!mine) { ui.notifications.warn(`${TITLE}: select your character's token first.`); return undefined; }
  return open(mine, node.profession, { focus: note.uuid });
}

/** Our Note class: nodes have no journal entry, so their own rules decide who sees and opens them. @param {any} Base */
function nodeNoteClass(Base) {
  return class WgNodeNote extends Base {
    static [MARK] = true;
    get isVisible() {
      const node = nodeOf(this.document);
      if (!node) return super.isVisible;
      if (node.hidden && !game.user?.isGM) return false;
      // v14 hides entry-less notes from players by its own rule; ours: shown, plus the scene-level check core does.
      const lv = this.document.levels; const cur = canvas?.level?.id ?? null;
      const named = lv ? (lv.size ?? lv.length ?? 0) > 0 : false;
      return !cur || !named || (typeof lv.has === "function" ? lv.has(cur) : lv.includes(cur));
    }
    /** @param {any} user */
    _canView(user) { return nodeOf(this.document) ? true : super._canView(user); }
    /** @param {any} event */
    _onClickLeft2(event) {
      if (nodeOf(this.document)) { onNodeOpen(this.document); return; }
      return super._onClickLeft2(event);
    }
    _getTargetAlpha() {
      const a = super._getTargetAlpha(); const node = nodeOf(this.document);
      if (!node) return a;
      return a * (node.uses === 0 ? 0.45 : node.hidden ? 0.6 : 1);
    }
    _drawControlIcon() {
      const icon = super._drawControlIcon();
      if (!nodeOf(this.document)) return icon;
      try {
        if (icon.bg) icon.bg.visible = false;
        const P = /** @type {any} */ (globalThis).PIXI;
        if (P?.Graphics) {
          const s = this.document.iconSize; const g = new P.Graphics();
          g.lineStyle(3, 0xe8c35a, 0.95).beginFill(0x1b140c, 0.9).drawCircle(s / 2, s / 2, s * 0.62).endFill();
          icon.addChildAt(g, 0);
        }
      } catch (e) { log(`node look: ${/** @type {any} */ (e)?.message}`); }
      return icon;
    }
  };
}

/** Whether our Note class is in place (health check). */
export const classOk = () => !!(/** @type {any} */ (globalThis).CONFIG?.Note?.objectClass?.[MARK]);

/** init (feature on): the Note class, the scene's tier field, the GM's node control, redraw hooks. */
export function init() {
  if (CONFIG.Note?.objectClass && !(/** @type {any} */ (CONFIG.Note.objectClass))[MARK]) CONFIG.Note.objectClass = nodeNoteClass(CONFIG.Note.objectClass);
  sceneTab.addSection(ID, {
    title: TITLE, order: 30,
    render: (_app, scene) => sceneSectionHTML({ tiers: Data.gatherRules().tiers, value: sceneTier(scene), field: `flags.${ID}.tier` })
  });
  Nodes.registerControl();
  changed.add(() => refresh());
  // Hot hooks: bail unless a Gather window is open (and, for tokens and actors, open for that actor or a node changed).
  Hooks.on("updateToken", (/** @type {any} */ t, /** @type {any} */ changes) => {
    if (!OPEN.size || !("x" in (changes ?? {}) || "y" in (changes ?? {}) || foundry.utils.hasProperty(changes ?? {}, `flags.${ID}`))) return;
    if (OPEN.has(t.actorId) || foundry.utils.hasProperty(changes ?? {}, `flags.${ID}`)) refresh();
  });
  for (const h of ["createNote", "updateNote", "deleteNote"]) Hooks.on(h, (/** @type {any} */ n) => { if (OPEN.size && n?.flags?.[ID]?.node) refresh(); });
  Hooks.on("updateActor", (/** @type {any} */ actor, /** @type {any} */ changes) => {
    if (!OPEN.size) return;
    if (OPEN.has(actor?.id) && ["system.tools", "system.attributes.prof", `flags.${ID}`].some(p => foundry.utils.hasProperty(changes ?? {}, p))) refresh(actor.id);
    else if (foundry.utils.hasProperty(changes ?? {}, "system.attributes.hp")) refreshSoon();
  });
  Hooks.on("targetToken", (/** @type {any} */ user) => { if (OPEN.size && user?.id === game.user?.id) refreshSoon(); });
  Hooks.on("controlToken", () => { if (OPEN.size) refreshSoon(); });
  Hooks.on("canvasReady", () => { if (OPEN.size) refresh(); });
}

/** Health facts: nodes in the world (all scenes), scenes with a tier. */
export function status() {
  const nodes = []; const tiers = [];
  for (const s of game.scenes ?? []) {
    for (const n of nodesOn(s, { all: true })) nodes.push({ scene: s.name, node: n.node });
    if (sceneTier(s)) tiers.push(s.name);
  }
  return { nodes, tiers, classOk: classOk() };
}

