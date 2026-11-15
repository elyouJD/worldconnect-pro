import test from "node:test";
import assert from "node:assert/strict";
import { splitCommission } from "../src/index.js";

test("splits commission 60/40 without losing cents", () => {
  assert.deepEqual(splitCommission(10000), {
    userShareCents: 6000,
    platformShareCents: 4000
  });
  assert.deepEqual(splitCommission(101), {
    userShareCents: 60,
    platformShareCents: 41
  });
});

test("rejects invalid commission amounts", () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => splitCommission(amount), TypeError);
  }
});
