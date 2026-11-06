/**
 * Profession definitions, pure (tested in Node: tests/professions.test.mjs). A profession is world data the GM writes in the setup
 * window: a name, a kind, the dnd5e tool keys that qualify for it (any one of them), an icon, the check a gathering profession
 * uses and a short player-visible note. Stored in the world setting `professionList` (`{ v, list }`) and always read through
 * `normalizeProfessions`. Players read it too (their Professions window needs it), so nothing GM-only belongs here.
 *
 * Nothing is shipped as campaign content: a new world has no professions until the GM adds them or presses *Add starter set*,
 * which makes one plain profession per dnd5e tool the world knows (names from the tool, no rules text).
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";

export const PROFESSIONS_VERSION = 1;
/** A world holds at most this many professions. */
export const PROFESSIONS_MAX = 100;
/** Tools linked to one profession. */
export const TOOLS_MAX = 8;
export const NAME_MAX = 60;
export const NOTES_MAX = 500;
/** Ids: letters, digits, `-` and `_`, starting with a letter, at most 40. */
export const ID_RE = /^[a-z][a-z0-9_-]{0,39}$/;
/** dnd5e keys (tools, skills): letters and digits. */
export const KEY_RE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;

/** Kinds: where the profession is shown and which actions it offers by default. */
export const KINDS = Object.freeze({
  crafting: { label: "Crafting", hint: "Makes items. Shown as a card; Craft and Recipes buttons." },
  gathering: { label: "Gathering", hint: "Collects materials with a check. Shown as a card; Gather button." },
  secondary: { label: "Secondary", hint: "Shown in the Other professions list; pick its actions." }
});
export const KIND_KEYS = Object.freeze(/** @type {Array<keyof typeof KINDS>} */ (Object.keys(KINDS)));

/** Actions a profession offers (later versions build them; 0.1 shows placeholders). */
export const ACTIONS = Object.freeze({
  craft: { label: "Craft", icon: "craft" },
  recipes: { label: "Recipes", icon: "recipes" },
  gather: { label: "Gather", icon: "gather" }
});
export const ACTION_KEYS = Object.freeze(/** @type {Array<keyof typeof ACTIONS>} */ (Object.keys(ACTIONS)));
/** The actions a kind gets when none are given. */
export const KIND_ACTIONS = Object.freeze({ crafting: ["craft", "recipes"], gathering: ["gather"], secondary: [] });

/** The skill a gathering check uses when none is set (dnd5e key for Survival). */
export const DEFAULT_CHECK = "sur";

/**
 * Icons: small original stroke drawings on a 24 × 24 grid (one path each), drawn for this module.
 * @type {Readonly<Record<string, { label: string, d: string }>>}
 */
export const ICONS = Object.freeze({
  hammer: { label: "Hammer", d: "M3 7h13a4 4 0 0 1-4 4h-1v3l3 4H6l3-4v-3H3z" },
  pick: { label: "Pick", d: "M4 20l9-9M8 5c4-2 9-1 12 3c-4-1-7 0-9 2z" },
  leaf: { label: "Leaf", d: "M5 19C5 9 11 5 20 4c-1 9-5 15-15 15zM5 19l8-8" },
  pot: { label: "Pot", d: "M5 10h14v4a7 7 0 0 1-14 0zM8 10V7M12 10V5M16 10V7" },
  fish: { label: "Fish", d: "M3 12c4-6 11-6 15 0c-4 6-11 6-15 0zM18 12l3-3v6zM8 11v.01" },
  hide: { label: "Hide", d: "M5 4h14l-2 16H7z" },
  flask: { label: "Flask", d: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10" },
  needle: { label: "Needle", d: "M19 5L6 18M17 3l4 4M6 18l-2 3M14 8c-3-3-8-2-9 2" },
  gem: { label: "Gem", d: "M6 4h12l3 5l-9 11L3 9zM3 9h18M9 4l3 5l3-5M12 9v11" },
  gear: { label: "Gear", d: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" },
  quill: { label: "Quill", d: "M20 4C10 4 6 10 5 20M5 20l4-1M9 12h6" },
  saw: { label: "Saw", d: "M3 15l13-9l5 5l-13 9zM6 17l1-2M9 15l1-2M12 13l1-2" },
  brush: { label: "Brush", d: "M14 4l6 6l-7 7l-6-6zM7 11l-3 7l3 2l7-3" },
  book: { label: "Book", d: "M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM9 8h6M9 12h6" },
  star: { label: "Star", d: "M12 3l2.6 5.6l6 .7l-4.5 4.1l1.2 6L12 16.4L6.7 19.4l1.2-6L3.4 9.3l6-.7z" }
});
export const ICON_KEYS = Object.freeze(Object.keys(ICONS));
/** Action button icons (same drawing style). */
export const ACTION_ICONS = Object.freeze({ craft: ICONS.hammer.d, recipes: ICONS.book.d, gather: ICONS.pick.d });

/**
 * @typedef {"crafting" | "gathering" | "secondary"} Kind
 * @typedef {"craft" | "recipes" | "gather"} Action
 * @typedef {{ id: string, name: string, kind: Kind, tools: string[], icon: string, check: string, actions: Action[], notes: string }} Profession
 * @typedef {{ v: number, list: Profession[] }} ProfessionList
 */

/** A one-line text: whitespace folded, trimmed, cut. @param {unknown} s @param {number} max */
const line = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** An id from a name: lower case, dashes, starts with a letter. @param {unknown} name */
export function idFrom(name) {
  const s = String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || "profession";
}

/** An id not in `taken` (adds -2, -3 …). @param {string} base @param {Set<string> | string[]} taken */
export function uniqueId(base, taken) {
  const t = taken instanceof Set ? taken : new Set(taken);
  const b = ID_RE.test(base) ? base : idFrom(base);
  if (!t.has(b)) return b;
  for (let i = 2; ; i++) { const id = `${b.slice(0, 36)}-${i}`; if (!t.has(id)) return id; }
}

/**
 * One definition cleaned, or null (no name). Unknown kind → crafting; bad or repeated tool keys dropped (at most `TOOLS_MAX`);
 * unknown icon → the kind's default; actions limited to known ones (missing → the kind's defaults); notes plain text, cut.
 * @param {unknown} raw
 * @returns {Profession | null}
 */
export function cleanProfession(raw) {
  const o = /** @type {any} */ (raw);
  if (!o || typeof o !== "object") return null;
  const name = line(o.name, NAME_MAX);
  if (!name) return null;
  const kind = /** @type {Kind} */ (KIND_KEYS.includes(o.kind) ? o.kind : "crafting");
  const tools = [...new Set((Array.isArray(o.tools) ? o.tools : []).map(String).filter(k => KEY_RE.test(k)))].slice(0, TOOLS_MAX);
  const icon = ICON_KEYS.includes(o.icon) ? o.icon : kind === "gathering" ? "pick" : "hammer";
  const check = KEY_RE.test(String(o.check ?? "")) ? String(o.check) : DEFAULT_CHECK;
  const actions = /** @type {Action[]} */ (Array.isArray(o.actions)
    ? ACTION_KEYS.filter(a => o.actions.includes(a))
    : [...KIND_ACTIONS[kind]]);
  const notes = String(o.notes ?? "").replace(/\r\n?/g, "\n").trim().slice(0, NOTES_MAX);
  const id = ID_RE.test(String(o.id ?? "")) ? String(o.id) : idFrom(name);
  return { id, name, kind, tools, icon, check, actions, notes };
}

/**
 * Reads whatever is stored into the current shape: cleaned definitions in the stored order, ids made unique, at most
 * `PROFESSIONS_MAX`. Missing or unreadable values give an empty list. Never throws.
 * @type {(raw: unknown) => ProfessionList}
 */
export const normalizeProfessions = versioned({
  version: PROFESSIONS_VERSION,
  empty: () => ({ v: PROFESSIONS_VERSION, list: [] }),
  clean: s => {
    const taken = new Set();
    /** @type {Profession[]} */
    const list = [];
    for (const raw of Array.isArray(s?.list) ? s.list : []) {
      if (list.length >= PROFESSIONS_MAX) break;
      const p = cleanProfession(raw);
      if (!p) continue;
      p.id = uniqueId(p.id, taken);
      taken.add(p.id);
      list.push(p);
    }
    return { v: PROFESSIONS_VERSION, list };
  }
});

/**
 * The list with `p` put in (replacing the one with the same id, else added at the end). A new profession without an id gets one
 * from its name. Returns `{ list, id }`, or `{ error }` (no name; the list is full).
 * @param {unknown} stored
 * @param {unknown} p
 * @returns {{ list: ProfessionList, id: string, error?: undefined } | { error: string, list?: undefined, id?: undefined }}
 */
export function upsert(stored, p) {
  const s = normalizeProfessions(stored);
  const clean = cleanProfession(p);
  if (!clean) return { error: "A profession needs a name." };
  const givenId = ID_RE.test(String(/** @type {any} */ (p)?.id ?? "")) ? String(/** @type {any} */ (p).id) : "";
  const i = givenId ? s.list.findIndex(x => x.id === givenId) : -1;
  if (i >= 0) { s.list[i] = { ...clean, id: givenId }; return { list: s, id: givenId }; }
  if (s.list.length >= PROFESSIONS_MAX) return { error: `A world holds at most ${PROFESSIONS_MAX} professions.` };
  const id = uniqueId(givenId || idFrom(clean.name), s.list.map(x => x.id));
  s.list.push({ ...clean, id });
  return { list: s, id };
}

/** The list without the profession `id`. @param {unknown} stored @param {string} id */
export function remove(stored, id) {
  const s = normalizeProfessions(stored);
  return { v: s.v, list: s.list.filter(x => x.id !== id) };
}

/** The list with profession `id` moved one place up (-1) or down (+1). @param {unknown} stored @param {string} id @param {number} by */
export function move(stored, id, by) {
  const s = normalizeProfessions(stored);
  const i = s.list.findIndex(x => x.id === id);
  const j = i + Math.sign(by);
  if (i < 0 || j < 0 || j >= s.list.length) return s;
  [s.list[i], s.list[j]] = [s.list[j], s.list[i]];
  return s;
}

/**
 * Starter professions: generic names for the dnd5e tool keys of the SRD's artisan's tools and the herbalism kit, with a kind and
 * icon. Only keys the world knows are used (`known`, CONFIG.DND5E.tools). Names are plain English craft words, GM-editable.
 */
export const STARTER = Object.freeze([
  ["alchemist", "Alchemy", "crafting", "flask"], ["brewer", "Brewing", "secondary", "pot"], ["calligrapher", "Calligraphy", "secondary", "quill"],
  ["carpenter", "Carpentry", "crafting", "saw"], ["cartographer", "Cartography", "secondary", "book"], ["cobbler", "Cobbling", "secondary", "hide"],
  ["cook", "Cooking", "secondary", "pot"], ["glassblower", "Glassblowing", "crafting", "flask"], ["herb", "Herbalism", "gathering", "leaf"],
  ["jeweler", "Jewelcraft", "crafting", "gem"], ["leatherworker", "Leatherworking", "crafting", "hide"], ["mason", "Masonry", "crafting", "pick"],
  ["painter", "Painting", "secondary", "brush"], ["potter", "Pottery", "secondary", "pot"], ["smith", "Smithing", "crafting", "hammer"],
  ["tinker", "Tinkering", "crafting", "gear"], ["weaver", "Weaving", "crafting", "needle"], ["woodcarver", "Woodcarving", "crafting", "saw"]
].map(([tool, name, kind, icon]) => Object.freeze({ tool, name, kind, icon })));

/**
 * The list with the starter professions added: one per starter tool the world knows that no profession links yet. Returns
 * `{ list, added }` (names added).
 * @param {unknown} stored
 * @param {Iterable<string>} known tool keys in this world
 */
export function addStarter(stored, known) {
  const k = new Set(known);
  let s = normalizeProfessions(stored);
  const linked = new Set(s.list.flatMap(p => p.tools));
  /** @type {string[]} */
  const added = [];
  for (const st of STARTER) {
    if (!k.has(st.tool) || linked.has(st.tool)) continue;
    const r = upsert(s, { name: st.name, kind: st.kind, icon: st.icon, tools: [st.tool], check: DEFAULT_CHECK, notes: "" });
    if (!r.list) break;
    s = r.list; added.push(st.name);
  }
  return { list: s, added };
}

/**
 * Problems a GM should see (setup window, health check): tools that are no longer in the world's tool list, and tools shared by
 * several professions (fine, but worth knowing). Plain sentences.
 * @param {ProfessionList} s normalized
 * @param {Iterable<string>} known tool keys in this world
 */
export function professionWarnings(s, known) {
  const k = new Set(known);
  const out = [];
  for (const p of s.list) {
    const missing = p.tools.filter(t => !k.has(t));
    if (missing.length) out.push(`${p.name} links tool keys this world doesn't have: ${missing.join(", ")}.`);
  }
  /** @type {Map<string, string[]>} */
  const by = new Map();
  for (const p of s.list) for (const t of p.tools) by.set(t, [...(by.get(t) ?? []), p.name]);
  for (const [t, names] of by) if (names.length > 1) out.push(`Tool ${t} counts for ${names.join(" and ")}.`);
  return out;
}
