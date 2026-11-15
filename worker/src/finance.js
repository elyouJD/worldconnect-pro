// Shared financial validation and allocation rules used by the Worker and unit tests.
export function calculateCommissionSplit(netCommissionCents) {
  if (!Number.isSafeInteger(netCommissionCents) || netCommissionCents < 1 || netCommissionCents > 100000000) {
    throw new RangeError("net commission must be a positive safe integer in cents");
  }
  const userShareCents = Math.floor(netCommissionCents * 0.60);
  return { userShareCents, platformShareCents: netCommissionCents - userShareCents };
}

export function isValidWithdrawalAmount(amountCents) {
  return Number.isSafeInteger(amountCents) && amountCents >= 1000 && amountCents <= 100000000;
}
