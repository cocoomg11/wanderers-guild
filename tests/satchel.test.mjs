import { test } from "node:test";
import assert from "node:assert/strict";
import { registration, registerWith, SATCHEL_READY } from "../scripts/satchel-model.mjs";

const reg = registration({ id: "wanderers-guild", title: "Wanderer's Guild", open: () => "open", openLabel: "Professions setup", openPanel: () => "panel", health: o => ({ o }), records: ["a", "a", "b"], debugKey: "debugLog" });

test("registration has only the Satchel's fields", () => {
  assert.deepEqual(Object.keys(reg).sort(), ["debugSetting", "health", "id", "open", "openLabel", "openPanel", "skipSettings", "title"]);
  assert.equal(reg.open(), "open"); assert.equal(reg.openPanel(), "panel");
  assert.deepEqual(reg.health({ timeoutMs: 5 }), { o: { timeoutMs: 5 } });
  assert.deepEqual(reg.skipSettings, ["a", "b"]);
  assert.deepEqual(reg.debugSetting, { namespace: "wanderers-guild", key: "debugLog" });
});

test("registerWith: inactive, now and on the ready hook, refusals warn", () => {
  const warns = []; const hooks = [];
  const env = (api, active = true) => ({ active: () => active, api: () => api, once: (h, fn) => hooks.push([h, fn]), warn: m => warns.push(m) });
  assert.equal(registerWith(reg, env(null, false)), null);
  const calls = [];
  const api = { register: r => { calls.push(r.id); return { ok: true }; } };
  assert.deepEqual(registerWith(reg, env(api)), { ok: true });
  assert.equal(hooks.at(-1)[0], SATCHEL_READY);
  hooks.at(-1)[1](api); assert.equal(calls.length, 2);
  registerWith(reg, env({ register: () => ({ ok: false, error: "nope" }) }));
  registerWith(reg, env({ register: () => { throw new Error("boom"); } }));
  assert.equal(warns.length, 2);
  assert.equal(registerWith(reg, env({})), null);
});
