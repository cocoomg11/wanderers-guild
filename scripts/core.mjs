/**
 * The one place that binds wanderers-core to this module: the feature registry, the settings table, debug logging and the
 * one-writer leader. Everything else imports F, S, log and leader from here. Core is vendored in vendor/wanderers-core/ and is never
 * edited by hand (`node vendor/wanderers-core/vendor.mjs update X.Y.Z`).
 */
import { createFeatures, createSettings, createLogger, createLeader } from "../vendor/wanderers-core/foundry/index.mjs";
import { defineRequests, records } from "../vendor/wanderers-core/index.mjs";
import { ID, TITLE, HOOKS } from "./const.mjs";
import { PROFESSIONS_VERSION } from "./professions-model.mjs";
import { defaultRanks } from "./ranks-model.mjs";

/**
 * Features: one world setting per tool (`feature-<id>`, reload). A turned-off tool registers nothing (no hooks, buttons, key
 * bindings or socket handlers) and its API entry is undefined. Setting keys are stable: never rename one.
 */
export const F = createFeatures(ID, [
  { id: "professions", label: "Professions", hint: "A Professions window per character: professions from the character's tool proficiencies, rank from the proficiency bonus. The GM setup window and api.open(actor)." },
  { id: "sheetButton", label: "Sheet button", hint: "A Professions button in the header of dnd5e character sheets (owners and observers).", needs: ["professions"] }
], { title: TITLE, where: "Game Settings" });

/** Called after the definitions or the rank table change on this client (any GM's edit reaches every client). */
export const changed = new Set(/** @type {Array<() => void>} */ ([]));
const fire = () => { for (const fn of changed) { try { fn(); } catch (e) { console.warn(`${ID} |`, e); } } };

/**
 * Every other setting is one row. Records (`hidden`) are written by the setup window (GM clicks) and read by everyone: the
 * profession definitions and the rank table are not GM-only (players' Professions windows need them). Switches show on the setup
 * window's Settings page (tab "settings").
 */
export const S = createSettings(ID, [
  { key: "professionList", type: "object", default: { v: PROFESSIONS_VERSION, list: [] }, hidden: true, onChange: fire },
  { key: "rankTable", type: "object", default: defaultRanks(), hidden: true, onChange: fire },
  { key: "showUnlearned", type: "bool", default: true, label: "Show professions not learned yet", hint: "The Professions window also lists the world's other professions, with the tool each one needs.", tab: "settings", onChange: fire },
  { key: "debugLog", type: "bool", default: false, label: "Debug logging", hint: "Write the module's decisions to the browser console.", tab: "settings" }
], { reserved: F.FEATURES.map(f => f.key) });

/** Hidden record keys (never on a settings page; skipped by the Satchel's settings export). */
export const RECORDS = Object.freeze([...records(S.ROWS), "windowPlacement"]);

export const { log, warn } = createLogger(ID);

/**
 * Socket requests the leader accepts: a schema per kind; anything else is refused. None yet: version 0.1 writes nothing
 * automatically (the setup window's saves are GM clicks). Crafting and gathering results will come through here.
 */
export const REQUESTS = defineRequests({});

/** `module.json` has `"socket": true`. Automatic writes run only when `leader.isLeader()`. */
export const leader = createLeader({ id: ID, log, requests: REQUESTS, hooks: [HOOKS.ready] });
