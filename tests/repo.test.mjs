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
const WRITERS = ["craft-leader.mjs", "economy.mjs"];

test("no direct socket use, no writes to other modules' flags, actor writes only in the leader's files", () => {
  for (const f of scripts) {
    const s = read(`scripts/${f}`);
    assert.ok(!s.includes("game.socket"), `${f}: sockets go through core's leader`);
    assert.ok(!/setFlag\(\s*["'](?!wanderers-guild)/.test(s), f);
    assert.ok(!/setFlag\(\s*ID\b/.test(s) || WRITERS.includes(f), `${f}: our flags are written by the leader`);
    if (!WRITERS.includes(f)) assert.ok(!/actor\.update\(|\.(create|update|delete)EmbeddedDocuments\(/.test(s), `${f}: only the leader writes actors`);
  }
  // The coin payment runs only from the leader's handlers.
  for (const f of scripts.filter(n => !WRITERS.includes(n))) assert.ok(!/Eco\.pay\(/.test(read(`scripts/${f}`)), f);
  const leader = read("scripts/craft-leader.mjs");
  assert.ok(/leader\.handle\("craft", onCraft\)/.test(leader));
  assert.ok(!/data\.(user|userId)\b/.test(leader), "handlers never read a user from the payload");
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
  const files = [...scripts.map(f => `scripts/${f}`), "README.md", "CHANGELOG.md", "docs/professions.md", "docs/crafting.md", "styles/wanderers-guild.css"];
  const banned = /warcraft|blizzard|azeroth|player'?s handbook|dungeon master'?s guide|\bPHB\b|\bDMG\b|5etools/i;
  for (const f of files) assert.ok(!banned.test(read(f)), f);
});
