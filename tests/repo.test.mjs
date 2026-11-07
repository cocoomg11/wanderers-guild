import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const scripts = readdirSync(new URL("../scripts/", import.meta.url)).filter(f => f.endsWith(".mjs"));

test("stylesheet: every selector is ours, no theme selectors, no blur", () => {
  const css = read("styles/wanderers-guild.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/(^|})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(s => s && !/^(from|to|\d+%)$/.test(s));
  for (const sel of selectors) for (const part of sel.split(",")) assert.match(part.trim(), /^\.wg-/, part);
  assert.ok(!/theme-(dark|light)/.test(css));
  assert.ok(!/backdrop-filter:\s*blur/.test(css));
});

test("windows carry core's UI_CLASSES, never a literal revision", () => {
  for (const f of scripts) {
    const s = read(`scripts/${f}`);
    assert.ok(!/["'`]wc-r\d+["'`]/.test(s), f);
    if (/extends (Base|foundry\.applications\.api\.ApplicationV2)\b/.test(s) && /DEFAULT_OPTIONS/.test(s)) assert.ok(s.includes("...UI_CLASSES"), f);
  }
});

/** Files allowed to write actors and items: the leader's handlers, and the coin payment they call. */
const WRITERS = ["craft-leader.mjs", "gather-leader.mjs", "economy.mjs"];
/** GM clicks that write map Notes only (placing / editing / deleting gathering nodes, Remove data). */
const NOTE_WRITERS = ["nodes.mjs", "cleanup.mjs"];

test("no direct socket use, no writes to other modules' flags, actor writes only in the leader's files", () => {
  for (const f of scripts) {
    const s = read(`scripts/${f}`);
    assert.ok(!s.includes("game.socket"), `${f}: sockets go through core's leader`);
    assert.ok(!/setFlag\(\s*["'](?!wanderers-guild)/.test(s), f);
    assert.ok(!/(?<!un)setFlag\(\s*ID\b/.test(s) || WRITERS.includes(f), `${f}: our flags are written by the leader`);
    if (!WRITERS.includes(f)) assert.ok(!/actor\.update\(/.test(s), `${f}: only the leader writes actors`);
    const embedded = [...s.matchAll(/\.(create|update|delete)EmbeddedDocuments\(\s*("[A-Za-z]+")?/g)];
    if (NOTE_WRITERS.includes(f)) assert.ok(embedded.every(m => m[2] === '"Note"'), `${f}: only Notes`);
    else if (!WRITERS.includes(f)) assert.equal(embedded.length, 0, `${f}: only the leader writes actors`);
  }
  // The coin payment runs only from the leader's handlers.
  for (const f of scripts.filter(n => !WRITERS.includes(n))) assert.ok(!/Eco\.pay\(/.test(read(`scripts/${f}`)), f);
  const leader = read("scripts/craft-leader.mjs");
  assert.ok(/leader\.handle\("craft", onCraft\)/.test(leader));
  assert.ok(!/data\.(user|userId)\b/.test(leader), "handlers never read a user from the payload");
  const gl = read("scripts/gather-leader.mjs");
  assert.ok(/leader\.handle\("gather", onGather\)/.test(gl));
  assert.ok(!/data\.(user|userId)\b/.test(gl), "gather handlers never read a user from the payload");
  assert.ok(!/game\.socket/.test(gl));
});

test("crafting never advances the world's time", () => {
  for (const f of scripts) assert.ok(!/game\.time\.advance|worldTime/.test(read(`scripts/${f}`)), f);
});

test("pure models import nothing from Foundry", () => {
  for (const f of scripts.filter(n => n.endsWith("-model.mjs") || n.endsWith("-view.mjs"))) {
    const s = read(`scripts/${f}`);
    assert.ok(!s.includes("/foundry/"), f);
    assert.ok(!/\b(game|ui|canvas|Hooks|CONFIG)\./.test(s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), f);
  }
});

test("lang file stays empty (strings are plain English in code)", () => {
  assert.deepEqual(JSON.parse(read("lang/en.json")), {});
});

test("public text names no publisher, setting or rulebook", () => {
  const files = [...scripts.map(f => `scripts/${f}`), "README.md", "CHANGELOG.md", "docs/professions.md", "docs/crafting.md", "docs/gathering.md", "styles/wanderers-guild.css"];
  const banned = /warcraft|blizzard|azeroth|player'?s handbook|dungeon master'?s guide|\bPHB\b|\bDMG\b|5etools/i;
  for (const f of files) assert.ok(!banned.test(read(f)), f);
});

test("window classes never shadow ApplicationV2 instance properties with methods", () => {
  const RESERVED = ["options", "position", "element", "state", "window", "id", "title", "tabGroups", "rendered", "minimized", "hasFrame", "classList"];
  for (const f of scripts) {
    const src = read(`scripts/${f}`);
    for (const name of RESERVED) {
      assert.ok(!new RegExp(`^\\s{2}(?:async\\s+)?${name}\\s*\\(`, "m").test(src), `${f} defines ${name}() on a class`);
    }
  }
});

test("tooltips never render document text as HTML", () => {
  // Foundry's TooltipManager renders `data-tooltip` (and `data-tooltip-html`) as HTML after the browser decodes the attribute, so an
  // escaped name there could still run script. Document text goes in `title` or `data-tooltip-text` (plain text) only.
  for (const f of scripts) {
    const s = read(`scripts/${f}`);
    for (const m of s.matchAll(/data-tooltip(-html)?=("[^"]*"|'[^']*'|`[^`]*`)/g)) assert.ok(!m[2].includes("${"), `${f}: ${m[0]}`);
    for (const m of s.matchAll(/dataset\.tooltip(Html)?\s*=\s*([^;\n]+)/g)) assert.ok(/^"[^"$`]*"$|^'[^'$`]*'$/.test(m[2].trim()), `${f}: ${m[0]}`);
    assert.ok(!/setAttribute\(\s*["']data-tooltip(-html)?["']\s*,\s*(?!["'][^"']*["']\s*\))/.test(s), `${f}: setAttribute data-tooltip with a value that isn't a literal`);
  }
});

test("leaders check rolls (used-roll list, d20 + own bonus) and cap a player's gather days", () => {
  for (const f of ["scripts/craft-leader.mjs", "scripts/gather-leader.mjs"]) {
    const s = read(f);
    assert.ok(/usedRolls\(/.test(s) && /USED\.has\(msg\.id\)/.test(s) && /USED\.add\(msg\.id\)/.test(s), `${f}: used-roll list`);
    assert.ok(/verifyRoll\(/.test(s), `${f}: verifyRoll`);
  }
  const gl = read("scripts/gather-leader.mjs");
  assert.ok(/GM\.allowedDays\(data\.days/.test(gl), "gather days go through allowedDays");
  assert.ok(!/days: GM\.clampDays\(data\.days\)/.test(gl), "no bare clamp of the requested days");
});
