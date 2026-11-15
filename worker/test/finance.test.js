import test from "node:test";
import assert from "node:assert/strict";
import { calculateCommissionSplit, isValidWithdrawalAmount } from "../src/finance.js";

test("commission allocation preserves exact cents at 60/40", () => {
  assert.deepEqual(calculateCommissionSplit(1000), { userShareCents: 600, platformShareCents: 400 });
  assert.deepEqual(calculateCommissionSplit(101), { userShareCents: 60, platformShareCents: 41 });
  assert.deepEqual(calculateCommissionSplit(1), { userShareCents: 0, platformShareCents: 1 });
});

test("commission allocation rejects invalid amounts", () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => calculateCommissionSplit(amount), RangeError);
  }
});

test("withdrawal amount enforces minimum and maximum in cents", () => {
  assert.equal(isValidWithdrawalAmount(1000), true);
  assert.equal(isValidWithdrawalAmount(100000000), true);
  for (const amount of [0, 999, 100000001, -1000, 1000.5, NaN, Infinity]) {
    assert.equal(isValidWithdrawalAmount(amount), false);
  }
});
