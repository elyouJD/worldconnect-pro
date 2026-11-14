# Withdrawal lifecycle test plan

Run these checks only against a dedicated non-production Firebase project and a staging Worker. Never use real payout details or real user balances.

## Setup
- Create two test Firebase users: one ordinary user and one administrator.
- Assign the administrator the `admin: true` custom claim and include its UID in `ADMIN_UIDS`.
- Create a wallet for the ordinary user with `availableCents: 5000`, `pendingWithdrawCents: 0`, and `totalEarnedCents: 5000`.
- Deploy the Worker to a staging service configured for the test Firebase project.
- Apply the updated Firestore rules in the test project.

## User withdrawal checks
- [ ] No Authorization header returns 401.
- [ ] Invalid Firebase token returns 401.
- [ ] Amount below 1000 cents, non-integer amount, unsupported method, or invalid payout details returns 400.
- [ ] Requesting more than the available balance returns 409 and does not create a request.
- [ ] A 2000-cent request returns 201, creates a unique pending request, changes available balance to 3000, and changes pending withdrawals to 2000.
- [ ] A second 4000-cent request returns 409 and leaves balances unchanged.
- [ ] Two simultaneous requests whose total exceeds the available balance result in at most one successful reservation.
- [ ] GET history returns only the authenticated user's requests, not another user's requests.
- [ ] Direct client create/read/update/delete attempts on withdrawal request documents are denied by Firestore rules.

## Administrator review checks
- [ ] A non-admin token receives 403 on admin routes.
- [ ] An admin can reject a pending request; its status changes to rejected, pending withdrawals decrease, available balance is restored, and exactly one refund ledger entry is written.
- [ ] An admin can mark a pending request paid only after a real test transfer has been completed; pending withdrawals decrease and exactly one payout ledger entry is written.
- [ ] Re-reviewing a paid or rejected request returns 409 and does not change balances or create another ledger entry.
- [ ] Two simultaneous reviews of the same request result in one successful review and one conflict; balances and ledger remain consistent.

## Release gate
- [ ] Review logs and balances after every test.
- [ ] Confirm no payout was marked paid before a cleared transfer.
- [ ] Confirm written advertiser approval before enabling any incentive offer.
- [ ] Complete security, privacy, GDPR, tax, KYC/AML and payment-provider reviews before production.
- [ ] Only then consider merging the withdrawal changes into the Earn Money branch and deploying the Worker, Firestore rules, and frontend in a coordinated release.
