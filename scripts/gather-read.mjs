/**
 * Reads the facts `assessGather()` needs (read only), so the Gather window and the active GM's client decide from the same data:
 * nodes on a scene (Notes with our flag), where the gatherer's token stands, a creature's prepared data and harvested mark, the
 * scene's tier, the actor's limits and the world's reset. Untested in Node (reads documents); the decision is in gather-model.mjs.
 */
import { ID } from "./const.mjs";
import { S } from "./core.mjs";
import * as GM from "./gather-model.mjs";
import * as Data from "./data.mjs";
import * as D5 from "./dnd5e.mjs";

/** A scene's grid size in pixels. @param {any} scene */
export const gridOf = scene => Number(scene?.grid?.size ?? scene?.dimensions?.size ?? 100) || 100;

/** Our nodes on a scene: [{ note, node }] (players: hidden ones left out unless `all`). @param {any} scene @param {{ all?: boolean }} [o] */
export function nodesOn(scene, o = {}) {
  const out = [];
  for (const note of scene?.notes ?? []) {
    const node = GM.normalizeNode(note.flags?.[ID]?.node);
    if (node && (o.all || !node.hidden)) out.push({ note, node });
  }
  return out;
}

/** The node on a Note document, or null. @param {any} note */
export const nodeOf = note => GM.normalizeNode(note?.flags?.[ID]?.node);

/** The actor's token on a scene (its own synthetic token first, else a token of that actor), or null. @param {any} actor @param {any} scene */
export function tokenOf(actor, scene) {
  if (!actor || !scene) return null;
  if (actor.token && actor.token.parent?.id === scene.id) return actor.token;
  return scene.tokens?.find?.((/** @type {any} */ t) => t.actorId === actor.id) ?? null;
}

/** A token document's centre on the canvas. @param {any} t @param {number} grid */
export const centerOf = (t, grid) => ({ x: Number(t.x) + (Number(t.width) || 1) * grid / 2, y: Number(t.y) + (Number(t.height) || 1) * grid / 2 });

/** Grid spaces from the actor's token to a point on a scene (null: no token there). @param {any} actor @param {any} scene @param {{ x: number, y: number }} at */
export function distanceTo(actor, scene, at) {
  const t = tokenOf(actor, scene); if (!t) return null;
  const g = gridOf(scene);
  return GM.cellsBetween(centerOf(t, g), at, g);
}

/** The scene's tier id ("" = none). @param {any} scene */
export const sceneTier = scene => String(scene?.flags?.[ID]?.tier ?? "");

/**
 * The facts for one gather.
 * @param {any} actor the gatherer
 * @param {string} professionId
 * @param {{ note?: any, scene?: any, token?: any }} target a node's Note, a scene (its area), or a creature's token document
 * @param {{ isGM: boolean, days?: number }} who the user acting (the window's user, or the request's sender on the leader), and the
 *   days in this journey stage (the window's field, or the request's `days`; default 1)
 * @returns {import("./gather-model.mjs").GatherFacts & { key: string, scene: any }}
 */
export function gatherFacts(actor, professionId, target, who) {
  const rules = Data.gatherRules();
  const profession = Data.professions().list.find(p => p.id === professionId) ?? null;
  const base = { profession, facts: D5.facts(actor), rules, isGM: who.isGM, days: GM.clampDays(who.days ?? 1), once: !!S.get("gatherOnce"), areaOn: !!S.get("gatherArea"), epoch: Data.gatherEpoch() };
  const marks = Data.gathered(actor);
  if (target.note) {
    const scene = target.note.parent;
    const key = GM.markKey(scene?.id ?? "", target.note.id);
    const node = nodeOf(target.note) ?? undefined;
    return { ...base, kind: "node", node, sceneTier: sceneTier(scene), sceneName: scene?.name ?? "", distance: distanceTo(actor, scene, { x: Number(target.note.x), y: Number(target.note.y) }), lastAt: GM.markAt(marks, key), key, scene };
  }
  if (target.token) {
    const tok = target.token; const scene = tok.parent;
    const c = D5.creatureFacts(tok.actor);
    const harvested = GM.harvestedFor(tok.flags?.[ID]?.harvested);
    const g = gridOf(scene);
    return { ...base, kind: "creature", creature: { ...c, harvested }, distance: distanceTo(actor, scene, centerOf(tok, g)), key: "", scene };
  }
  const scene = target.scene;
  const key = GM.markKey(scene?.id ?? "");
  return { ...base, kind: "area", sceneTier: sceneTier(scene), sceneName: scene?.name ?? "", distance: tokenOf(actor, scene) ? 0 : null, lastAt: GM.markAt(marks, key), key, scene };
}

/** The roll's label ("Wisdom (Survival)", "Mason's tools"). @param {{ kind: "skill" | "tool", key: string } | null} roll */
export const rollLabel = roll => (!roll ? "No roll" : roll.kind === "tool" ? D5.toolLabel(roll.key) : D5.skillCheckText(roll.key));
