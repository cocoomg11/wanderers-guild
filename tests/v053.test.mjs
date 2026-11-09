// 0.5.3: live test 10 fix B1 — the coin cost is paid before the craft writes anything; a refused payment makes and uses nothing,
// and a write failing after the payment gives the coin back (or the card says the GM must).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../scripts/craft-model.mjs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** A fake actor's log of writes, in order. */
const world = ({ pay = async () => true, write = async () => {}, refund = async () => true } = {}) => {
  const log = [];
  return {
    log,
    run: (charge = 500) => C.payThenWrite({
      charge,
      pay: async () => { log.push("pay"); return pay(); },
      refund: async () => { log.push("refund"); return refund(); },
      write: async step => { log.push("item"); step("Blade added"); await write(); log.push("materials"); step("item quantities changed"); return "made"; }
    })
  };
};

test("pay refused (false): no item, no materials used", async () => {
  const w = world({ pay: async () => false });
  const r = await w.run();
  assert.equal(r.ok, false); assert.equal(r.stage, "pay"); assert.equal(r.paid, false);
  assert.deepEqual(w.log, ["pay"], "nothing written after the refusal");
  assert.match(C.writeFailText(r, "5 gp"), /^Nothing was made or used up: the coin cost couldn't be paid/);
});

test("pay throws: no item, no materials used", async () => {
  const w = world({ pay: async () => { throw new Error("not enough coin"); } });
  const r = await w.run();
  assert.equal(r.ok, false); assert.equal(r.stage, "pay"); assert.equal(r.error, "not enough coin");
  assert.deepEqual(w.log, ["pay"]);
});

test("pay ok (true, or nothing from an older toolkit): item and materials, payment first", async () => {
  for (const v of [true, undefined]) {
    const w = world({ pay: async () => v });
    const r = await w.run();
    assert.equal(r.ok, true); assert.equal(r.value, "made"); assert.equal(r.paid, true);
    assert.deepEqual(w.log, ["pay", "item", "materials"]);
  }
});

test("no coin cost: no payment, writes run", async () => {
  const w = world({ pay: async () => false });
  const r = await w.run(0);
  assert.equal(r.ok, true); assert.equal(r.paid, false);
  assert.deepEqual(w.log, ["item", "materials"]);
});

test("write fails after payment: refunded, card says so and lists what was done", async () => {
  const w = world({ write: async () => { throw new Error("item creation failed"); } });
  const r = await w.run();
  assert.equal(r.ok, false); assert.equal(r.stage, "write"); assert.equal(r.paid, true); assert.equal(r.refunded, true);
  assert.deepEqual(w.log, ["pay", "item", "refund"]);
  assert.deepEqual(r.done, ["Blade added"]);
  const t = C.writeFailText(r, "5 gp");
  assert.match(t, /after the coin cost was paid: item creation failed/); assert.match(t, /The coin \(5 gp\) was given back/);
  assert.match(t, /Already done: Blade added; check the character's items/);
});

test("write fails after payment and the refund fails or is refused: the card tells the GM to return the coin", async () => {
  for (const refund of [async () => { throw new Error("toolkit gone"); }, async () => false]) {
    const w = world({ write: async () => { throw new Error("boom"); }, refund });
    const r = await w.run();
    assert.equal(r.refunded, false); assert.ok(r.refundError);
    assert.match(C.writeFailText(r, "5 gp"), /could NOT be given back .*GM, return it by hand/);
  }
  const none = await C.payThenWrite({ charge: 5, pay: async () => true, write: async () => { throw new Error("x"); } });
  assert.equal(none.refunded, false); assert.equal(none.refundError, "no way to give coin back");
});

test("write fails with no coin cost: no refund, plain failure text", async () => {
  const w = world({ write: async () => { throw new Error("boom"); } });
  const r = await w.run(0);
  assert.equal(r.paid, false); assert.deepEqual(w.log, ["item"], "no refund without a payment");
  assert.match(C.writeFailText(r, ""), /^The craft failed: boom\./);
});

test("addPlan: refund coins go on top in the largest coins, no electrum", () => {
  const v = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
  assert.deepEqual(C.addPlan({ gp: 1, cp: 3 }, 1234, v), { pp: 1, gp: 3, ep: 0, sp: 3, cp: 7 });
  assert.deepEqual(C.addPlan({}, 0, { gp: 100, sp: 10, cp: 1 }), { gp: 0, sp: 0, cp: 0 });
});

test("craft-leader: one write path, payment before every item write, refund wired", () => {
  const s = read("scripts/craft-leader.mjs");
  const body = s.slice(s.indexOf("async function apply("), s.indexOf("/**\n * The card's view"));
  assert.match(body, /CM\.payThenWrite\(/);
  assert.match(body, /pay: \(\) => Eco\.pay\(actor, charge/);
  assert.match(body, /refund: \(\) => Eco\.refund\(actor, charge/);
  const outside = body.slice(0, body.indexOf("CM.payThenWrite("));
  assert.ok(!/(create|update|delete)EmbeddedDocuments|Eco\.pay\(/.test(outside), "no write before the payment");
  assert.equal((s.match(/Eco\.pay\(/g) ?? []).length, 1, "one payment call");
  assert.equal((s.match(/await apply\(/g) ?? []).length, 1, "every craft (roll, Approve, batch, better) goes through finish → apply");
  assert.match(s, /if \(r\.fail\) \{[\s\S]*?st\.state = "error"/);
  const e = read("scripts/economy.mjs");
  assert.match(e, /export async function refund\(/); assert.match(e, /tk\.addMoney\(actor, amount, \{ reason \}\)/);
});

test("README: Recipe items and honesty is its own section, not inside Troubleshooting", () => {
  const r = read("README.md");
  const ts = r.indexOf("## Troubleshooting"), hon = r.indexOf("### Recipe items and honesty"), dev = r.indexOf("## Development");
  assert.ok(hon > 0 && !(hon > ts && hon < dev), "outside Troubleshooting");
  const trouble = r.slice(ts, dev);
  assert.match(trouble, /\*\*Something else\.\*\*/);
  assert.match(r, /\(#recipe-items-and-honesty\)/);
});

test("version 0.5.3", () => {
  const m = JSON.parse(read("module.json")); const pkg = JSON.parse(read("package.json")); const lock = JSON.parse(read("package-lock.json"));
  assert.equal(m.version, "0.5.3"); assert.equal(pkg.version, "0.5.3");
  assert.equal(lock.version, "0.5.3"); assert.equal(lock.packages[""].version, "0.5.3");
  assert.ok(m.download.endsWith("/v0.5.3/module.zip"));
  assert.match(read("CHANGELOG.md"), /^## 0\.5\.3/m);
});
