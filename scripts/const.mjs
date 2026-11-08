/**
 * Shared constants and tiny helpers. The module id lives only here and in module.json. No Foundry calls at import time, so every
 * pure file can import this in Node. The text helpers come from the vendored wanderers-core.
 */
export { esc, plural } from "../vendor/wanderers-core/index.mjs";

export const ID = "wanderers-guild";
export const TITLE = "Wanderer's Guild";
/** Hooks we fire (see README, Public API and hooks). */
export const HOOKS = { ready: `${ID}.ready`, crafted: `${ID}.crafted`, gathered: `${ID}.gathered`, learned: `${ID}.learned` };
/** Optional modules we read through their public API (never required). */
export const TOOLKIT_ID = "wayfarers-toolkit";
export const SYSTEM_ID = "dnd5e";
