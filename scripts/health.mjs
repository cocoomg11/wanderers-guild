/**
 * Health check (read-only, never throws, never changes anything). Returns sections of { title, lines: [{ level, text, fix? }] }
 * with level ok / warn / bad / off / info: the report shape the Wanderer's Satchel hub reads (`api.health({ timeoutMs })`). Core's
 * collector wraps each check, so one that throws becomes a warning line instead of breaking the report. A line's `fix` runs only
 * when a GM clicks it (after its confirm). GM only: players get [].
 */
import { healthCollector, plural } from "../vendor/wanderers-core/index.mjs";
import { ID, TITLE, SYSTEM_ID, TOOLKIT_ID } from "./const.mjs";
import { F, S, leader } from "./core.mjs";
import * as PM from "./professions-model.mjs";
import * as RM from "./ranks-model.mjs";
import * as D5 from "./dnd5e.mjs";
import * as Data from "./data.mjs";
import * as RC from "./recipes-model.mjs";
import * as CM from "./craft-model.mjs";
import * as SheetPage from "./sheet-page.mjs";
import { pageStatus } from "./sheet-page-model.mjs";

/** Clamp for the caller's per-check budget (the Satchel passes its own). @param {unknown} ms */
export const timeoutOf = ms => Math.min(300000, Math.max(1000, Number(ms) || 20000));

/** @param {{ timeoutMs?: number }} [opts] */
export function run(opts = {}) {
  if (!game.user?.isGM) return [];
  const h = healthCollector({ timeoutMs: timeoutOf(opts.timeoutMs) });
  h.section(TITLE);
  h.check(add => add("info", `Version ${game.modules.get(ID)?.version ?? "?"}, Foundry ${game.version}.`));
  h.check(add => {
    if (game.system?.id !== SYSTEM_ID) add("bad", `This world runs ${game.system?.id ?? "an unknown system"}; ${TITLE} needs dnd5e.`);
    else add("ok", `dnd5e ${game.system.version}.`);
  });
  h.section("Features");
  for (const f of F.list()) h.check(add => add(f.on ? "ok" : "off", `${f.label}: ${f.on ? "on" : "off"}`));
  if (F.on("professions")) {
    h.section("Professions");
    h.check(add => {
      const list = Data.professions().list;
      const known = D5.toolChoices().map(t => t.key);
      if (!list.length) add("warn", "No professions are defined yet, so every Professions window is empty.", { label: "Add starter set", confirm: "Add one plain profession per artisan's tool and the herbalism kit? You can rename or remove them afterwards.", run: () => Data.addStarterSet() });
      else add("ok", `${plural(list.length, "profession")} defined (at most ${PM.PROFESSIONS_MAX}).`);
      for (const w of PM.professionWarnings({ v: PM.PROFESSIONS_VERSION, list }, known)) add(w.startsWith("Tool ") ? "info" : "warn", w);
      const stored = S.get("professionList");
      if (Array.isArray(/** @type {any} */ (stored)?.list) && /** @type {any} */ (stored).list.length > list.length) add("warn", `${plural(/** @type {any} */ (stored).list.length - list.length, "stored profession")} couldn't be read and will be dropped on the next save.`);
    });
    h.check(add => {
      const table = Data.ranks();
      add("ok", `Ranks: ${table.rows.map(r => `${r.name} ${RM.signed(r.bonus)}`).join(", ")}.`);
      for (const w of RM.rankWarnings(table)) add("warn", w);
    });
    h.check(add => {
      const pcs = (game.actors?.filter?.((/** @type {any} */ a) => a.type === "character" && a.hasPlayerOwner) ?? []);
      if (!pcs.length) { add("info", "No player characters in this world yet."); return; }
      const defs = Data.professions().list;
      const none = pcs.filter((/** @type {any} */ a) => {
        const f = D5.facts(a);
        return !defs.some(p => p.tools.length === 0 || p.tools.some(t => (f.tools[t] ?? 0) >= 1));
      });
      if (none.length && defs.length) add("info", `${plural(none.length, "player character")} without a profession: ${none.slice(0, 8).map((/** @type {any} */ a) => a.name).join(", ")}${none.length > 8 ? ", …" : ""}.`);
      else if (defs.length) add("ok", `Every player character (${pcs.length}) has at least one profession.`);
    });
  }
  if (F.on("crafting")) {
    h.section("Crafting");
    h.check(add => {
      const book = Data.recipes();
      if (!book.list.length) add("info", "No recipes yet (setup › Recipes): the Crafting window is empty.");
      else add("ok", `${plural(book.list.length, "recipe")} (at most ${RC.RECIPES_MAX}).`);
      for (const w of RC.recipeWarnings(book, Data.professions().list.map(p => p.id))) add("warn", w);
      const stored = S.get("recipeBook");
      if (Array.isArray(/** @type {any} */ (stored)?.list) && /** @type {any} */ (stored).list.length > book.list.length) add("warn", `${plural(/** @type {any} */ (stored).list.length - book.list.length, "stored recipe")} couldn't be read and will be dropped on the next save.`);
    });
    h.check(add => {
      // Result items that can't be found (world items, or a compendium's index; no document loads).
      const found = (/** @type {string} */ u) => { try { return !!fromUuidSync(u); } catch { return true; } };
      const gone = Data.recipes().list.filter(r => r.result.uuid && !found(r.result.uuid)).map(r => r.name);
      if (gone.length) add("warn", `Result item not found for: ${gone.slice(0, 6).join(", ")}${gone.length > 6 ? ", …" : ""} (deleted, or its compendium is gone).`);
    });
    h.check(add => {
      const st = CM.rulesStatus(Data.rules());
      if (st.set.length) add("ok", `Crafting rules set: ${st.set.join(", ")}.`);
      if (st.unset.length) add("info", `Crafting rules not set (fill in from your rules, setup › Crafting rules): ${st.unset.join(", ")}.`);
      if (!st.set.includes("a DC")) add("info", "No DC is set anywhere, so every craft succeeds on the roll (unless a recipe sets its own DC).");
      add("info", S.get("craftApproval") ? "GM approves each craft: on (crafts wait for a GM's Approve)." : "GM approves each craft: off (results follow the roll; nothing waits).");
      add("info", Data.rules().failMaterials === "keep" ? "On a failed check the materials are kept." : "On a failed check the materials are used up (default).");
      add("info", "Crafting time is shown for reference only; the calendar is never advanced.");
    });
    h.check(add => {
      const tk = game.modules.get(TOOLKIT_ID);
      if (S.get("worldCoins") && !tk?.active) add("warn", "Prices in the world's coins is on, but Wanderer's Toolkit isn't active: prices show book values.");
      else add("info", S.get("worldCoins") ? "Prices: the world's coins (Wanderer's Toolkit)." : "Prices: book values.");
    });
  }
  h.section("Optional modules");
  h.check(add => {
    const tk = game.modules.get(TOOLKIT_ID);
    add("info", tk?.active ? `Wanderer's Toolkit ${tk.version} is active (crafting prices can use its coins: setup › Settings).` : "Wanderer's Toolkit is not active (not needed).");
    const st = SheetPage.status();
    const line = pageStatus({ feature: F.on("toolkitPage"), toolkit: st.toolkit, toolkitVersion: st.toolkitVersion, sheet: st.sheet, result: st.result });
    add(line.level, line.text);
    const ip = game.modules.get("item-piles");
    add("info", ip?.active ? `Item Piles ${ip.version} is active.` : "Item Piles is not active (not needed).");
  });
  h.section("Writing client");
  h.check(add => {
    const i = leader.info();
    add(i.started ? "ok" : "warn", i.started ? `${plural(i.sessions, "GM session")} heard; this client ${i.leader ? "writes" : "does not write"}.` : "The one-writer election has not started.");
  });
  return h.report();
}
