import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { F, S, REQUESTS, RECORDS } from "../scripts/core.mjs";
import { ID, HOOKS } from "../scripts/const.mjs";
import { normalizeProfessions } from "../scripts/professions-model.mjs";
import { normalizeRanks } from "../scripts/ranks-model.mjs";

// core.mjs binds core to this module. These definitions throw on a typo (duplicate key, bad type, a need that isn't a feature), so
// importing them here catches the mistake in CI instead of in a live world.
test("features, settings and requests are well formed", () => {
  assert.deepEqual(F.FEATURES.map(f => f.id), ["professions", "sheetButton"]);
  assert.ok(F.FEATURES.every(f => f.key === `feature-${f.id}`));
  assert.deepEqual(F.FEATURES.find(f => f.id === "sheetButton").needs, ["professions"]);
  assert.deepEqual(S.ROWS.map(r => r.key), ["professionList", "rankTable", "showUnlearned", "debugLog"]);
  assert.deepEqual(Object.keys(REQUESTS), []);
  assert.equal(HOOKS.ready, `${ID}.ready`);
  assert.deepEqual([...RECORDS], ["professionList", "rankTable", "windowPlacement"]);
});

test("record defaults are what the normalizers give for nothing stored", () => {
  const row = k => S.ROWS.find(r => r.key === k);
  assert.deepEqual(row("professionList").default, normalizeProfessions(undefined));
  assert.deepEqual(row("rankTable").default, normalizeRanks(undefined));
  assert.ok(S.ROWS.filter(r => !r.hidden).every(r => r.tab === "settings" && r.label && r.hint));
});

test("module.json agrees with const.mjs and the house rules", () => {
  const m = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.equal(m.id, ID);
  assert.equal(m.title, "Wanderer's Guild");
  assert.equal(m.socket, true);
  assert.deepEqual(m.compatibility, { minimum: "13", verified: "14.370" });
  assert.ok(!("maximum" in m.compatibility));
  assert.equal(m.manifest, `https://github.com/cocoomg11/${ID}/releases/latest/download/module.json`);
  assert.equal(m.download, `https://github.com/cocoomg11/${ID}/releases/download/v${m.version}/module.zip`);
  assert.deepEqual(m.relationships.systems.map(s => [s.id, s.compatibility.verified]), [["dnd5e", "6.0.6"]]);
  assert.deepEqual(m.relationships.recommends.map(r => r.id).sort(), ["item-piles", "wayfarers-toolkit"]);
  assert.ok(!m.relationships.requires, "optional modules are never required");
  assert.equal(m.styles[0], "vendor/wanderers-core/styles/wanderers-ui.css");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, m.version);
});

test("the vendored core is the pinned release and CI uses the same tag", () => {
  const lock = JSON.parse(readFileSync(new URL("../wanderers-core.lock.json", import.meta.url), "utf8"));
  assert.equal(lock.source, "release");
  const ci = readFileSync(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  assert.match(ci, new RegExp(`module-checks\\.yml@v${lock.version.replace(/\./g, "\\.")}\\b`));
  const rel = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  for (const dir of ["module.json", "scripts", "styles", "lang", "vendor"]) assert.ok(rel.includes(` ${dir}`), dir);
  assert.ok(rel.includes("'vendor/wanderers-core/testing/*'"));
});
