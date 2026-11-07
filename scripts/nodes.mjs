/**
 * Gathering nodes, the GM's side (feature "gathering"): the Journal Notes control *Gathering node* (one click on the map places a
 * node), the node editor (a dialog: name, profession, resource and rare items by drop or UUID, tier, DC, quantity, uses, needed
 * bonus, hidden, reset), and the Note writes those GM clicks make. A node is a core Note with `flags.wanderers-guild.node` and no
 * journal entry; gathering.mjs gives such Notes their own visibility, double-click and look. Untested in Node: the shapes are in
 * gather-model.mjs, the form in gather-view.mjs.
 */
import { UI_CLASSES, esc } from "../vendor/wanderers-core/index.mjs";
import { ID, TITLE } from "./const.mjs";
import { log } from "./core.mjs";
import * as GM from "./gather-model.mjs";
import * as Data from "./data.mjs";
import { nodeFormHTML, readNodeForm } from "./gather-view.mjs";
import { sceneTier, nodeOf } from "./gather-read.mjs";

/** Gathering professions (those with the Gather action). */
const gatherProfessions = () => Data.professions().list.filter(p => p.actions.includes("gather"));
/** The icon key a node shows: its profession's. @param {GM.Node} n */
const iconFor = n => Data.professions().list.find(p => p.id === n.profession)?.icon ?? "pick";

/**
 * The node editor. Resolves to `{ node, reset }`, `{ delete: true }` or null (closed).
 * @param {Partial<GM.Node> | null} node @param {any} scene @param {{ canDelete?: boolean }} [o]
 */
async function editor(node, scene, o = {}) {
  const profs = gatherProfessions();
  if (!profs.length) { ui.notifications.warn(`${TITLE}: add a profession with the Gather action first (setup › Professions).`); return null; }
  const rules = Data.gatherRules();
  const tierName = GM.tierOf(rules, sceneTier(scene))?.name ?? "";
  const content = nodeFormHTML({ node, professions: profs.map(p => ({ id: p.id, name: p.name })), tiers: rules.tiers, sceneTierName: tierName });
  const read = (/** @type {any} */ button) => readNodeForm(new FormData(button.form).entries());
  const buttons = [
    { action: "save", label: "Save node", icon: "fa-solid fa-floppy-disk", default: true, callback: (/** @type {any} */ _e, /** @type {any} */ button) => ({ raw: read(button) }) },
    ...(o.canDelete ? [{ action: "delete", label: "Delete", icon: "fa-solid fa-trash", callback: () => ({ delete: true }) }] : []),
    { action: "cancel", label: "Cancel", callback: () => null }
  ];
  const r = await foundry.applications.api.DialogV2.wait({
    window: { title: node?.name ? `Gathering node: ${node.name}` : "New gathering node", icon: "fa-solid fa-leaf" },
    classes: ["wg-window", "wg-dialog", "wg-node-dialog", ...UI_CLASSES], content, buttons, rejectClose: false,
    render: (/** @type {any} */ _ev, /** @type {any} */ dialog) => wireDrops(dialog?.element ?? dialog)
  }).catch(() => null);
  if (!r || typeof r !== "object") return null;
  if (r.delete) return { delete: true };
  const raw = r.raw;
  const clean = GM.normalizeNode({ ...raw, resetAt: raw.reset ? Date.now() : (node?.resetAt ?? 0) });
  if (!clean) { ui.notifications.warn(`${TITLE}: a node needs a profession.`); return null; }
  return { node: clean };
}

/** Item drops (and pasted UUIDs) on the editor's resource fields. @param {any} root */
function wireDrops(root) {
  const el = root instanceof HTMLElement ? root : root?.[0];
  for (const box of /** @type {NodeListOf<HTMLElement>} */ (el?.querySelectorAll?.("[data-wg-ref]") ?? [])) {
    const key = box.dataset.wgRef;
    const field = (/** @type {string} */ f) => /** @type {HTMLInputElement | null} */ (box.querySelector(`[name="${key}.${f}"]`));
    const set = (/** @type {any} */ doc) => {
      const [u, n, i] = [field("uuid"), field("name"), field("img")];
      if (u) u.value = doc.uuid; if (n) n.value = doc.name ?? ""; if (i) i.value = doc.img ?? "";
      const label = box.querySelector("[data-wg-refname]"); if (label) label.textContent = doc.name ?? "";
    };
    box.addEventListener("dragover", ev => { ev.preventDefault(); box.classList.add("wg-over"); });
    box.addEventListener("dragleave", () => box.classList.remove("wg-over"));
    box.addEventListener("drop", async ev => {
      ev.preventDefault(); ev.stopPropagation(); box.classList.remove("wg-over");
      let data; try { data = JSON.parse(ev.dataTransfer?.getData("text/plain") ?? ""); } catch { return; }
      if (data?.type !== "Item" || typeof data.uuid !== "string") { ui.notifications.warn(`${TITLE}: drop an item.`); return; }
      const doc = await fromUuid(data.uuid).catch(() => null);
      if (doc?.documentName === "Item") set(doc); else ui.notifications.warn(`${TITLE}: that item can't be read.`);
    });
    const input = /** @type {HTMLInputElement | null} */ (box.querySelector(`[name="${key}.uuid"]`));
    input?.addEventListener("change", () => {
      const idx = input.value ? fromUuidSync(input.value.trim()) : null;
      if (idx) set({ uuid: input.value.trim(), name: idx.name, img: idx.img });
    });
  }
}

/** GM: a new node at a canvas point. @param {any} scene @param {{ x: number, y: number }} at */
export async function createAt(scene, at) {
  if (!game.user?.isGM) return null;
  const r = await editor(null, scene);
  if (!r?.node) return null;
  const level = canvas?.scene?.id === scene.id ? canvas?.level?.id ?? null : null;
  const data = GM.nodeNoteData(r.node, { ...at, icon: iconFor(r.node), level: scene.levels?.has?.(level) ? level : null });
  const [made] = await scene.createEmbeddedDocuments("Note", [data]);
  log("node placed", r.node.name);
  return made;
}

/** GM: edit (or delete) a node's Note. @param {any} note */
export async function edit(note) {
  if (!game.user?.isGM) return null;
  const node = nodeOf(note); if (!node) return null;
  const r = await editor(node, note.parent, { canDelete: true });
  if (!r) return null;
  if (r.delete) {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Delete gathering node" }, content: `<p>Delete the node <strong>${esc(node.name)}</strong>?</p>`, classes: ["wg-window", "wg-dialog", ...UI_CLASSES], rejectClose: false }).catch(() => false);
    return ok ? note.delete() : null;
  }
  if (!r.node) return null;
  return note.update(GM.nodeNoteUpdate(r.node, iconFor(r.node)));
}

/** @type {null | (() => void)} */
let ARMED = null;
function disarm() { if (ARMED) { const f = ARMED; ARMED = null; f(); } }

/** Arms one left click on the map: a new node goes there. Esc cancels. GM only. */
export function arm() {
  if (!game.user?.isGM) return;
  if (!canvas?.ready || !canvas.scene) { ui.notifications.warn(`${TITLE}: open a scene first.`); return; }
  disarm();
  const view = canvas.app?.view ?? document.getElementById("board"); if (!view) return;
  /** @type {{ x: number, y: number } | null} */ let down = null;
  const onDown = (/** @type {PointerEvent} */ ev) => { if (ev.button === 0) down = { x: ev.clientX, y: ev.clientY }; };
  const onUp = (/** @type {PointerEvent} */ ev) => {
    if (ev.button !== 0 || !down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y); down = null;
    if (moved > 6) return;
    const at = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
    disarm();
    createAt(canvas.scene, at).catch(e => console.warn(`${ID} | gathering node`, e));
  };
  const onKey = (/** @type {KeyboardEvent} */ ev) => { if (ev.key === "Escape") { disarm(); ui.notifications.info(`${TITLE}: cancelled.`); } };
  view.addEventListener("pointerdown", onDown, true); view.addEventListener("pointerup", onUp, true); document.addEventListener("keydown", onKey);
  ARMED = () => { view.removeEventListener("pointerdown", onDown, true); view.removeEventListener("pointerup", onUp, true); document.removeEventListener("keydown", onKey); };
  ui.notifications.info(`${TITLE}: click the map where the gathering node goes (Esc cancels).`);
}

/** The Journal Notes control. */
export function registerControl() {
  Hooks.on("getSceneControlButtons", (/** @type {any} */ controls) => {
    if (!game.user?.isGM) return;
    const notes = controls.notes ?? controls.note; if (!notes?.tools) return;
    notes.tools.wgNode = { name: "wgNode", title: "Gathering node", icon: "fa-solid fa-leaf", order: 90, button: true, visible: true, onChange: () => arm() };
  });
  Hooks.on("canvasReady", () => disarm());
}
