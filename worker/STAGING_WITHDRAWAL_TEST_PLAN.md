# WorldConnect Staging — withdrawal simulation test plan

## Scope
This plan is for the isolated `worldconnect-staging` Firebase project and the `worldconnect-earn-api-staging` Worker. It does not authorize production deployment or real transfers.

## Preconditions
- Configure the staging web app's Firebase Web SDK values in `js/firebase-config.js` (Firebase Console → Project settings → Your apps → SDK setup and configuration). Do not reuse production apiKey/appId values.
- Deploy the Worker from this branch after setting staging-only secrets: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `ADMIN_UIDS`. The service account must have access only to the staging Firestore project.
- Confirm the Cloudflare Pages staging origin is a `*.pages.dev` URL or add its exact origin to the Worker allowlist.
- Publish the Firestore rules from this branch to the staging Firebase project only.
- Keep advertiser offers inactive during tests. Never record a simulated commission as a real affiliate payout.

## Test accounts and sample data
Create two ordinary Firebase Auth users and one admin account in the staging project. Use only synthetic test data. Never enter a real IBAN or PayPal account.

To test the 60/40 split, use the admin commission form with:
- user UID: one of the two staging test users
- external transaction reference: a unique value such as `STAGING-TEST-001`
- net commission: `10.00 EUR`

Expected result: user wallet receives 600 cents and the platform wallet receives 400 cents. The commission record, user ledger, platform wallet, and platform ledger should be written in one Firestore commit. Reusing the same external reference must be rejected.

## User withdrawal scenarios
1. Confirm the test user's available balance is at least 10 EUR.
2. Submit a 10 EUR bank withdrawal using a clearly fake test IBAN such as `ES00 0000 0000 0000 0000 0000`.
3. Confirm the request appears as pending, available balance decreases by 10 EUR, and pending withdrawal balance increases by 10 EUR.
4. As admin, reject the request. Confirm the 10 EUR returns to available balance, pending balance decreases, and a refund ledger entry is created.
5. Submit another test request and mark it paid in simulation. Confirm the reserved amount is cleared and a paid ledger entry is created. No bank transfer is sent.
6. Attempt to submit more than the available balance and confirm the Worker rejects it.
7. Attempt two simultaneous withdrawals against the same available balance; only a request whose Firestore precondition succeeds should reserve funds.

## Platform withdrawal scenarios
1. Confirm the platform wallet has a positive available balance after the test commission.
2. Request a platform withdrawal for an amount within the available balance, using the same fake IBAN above.
3. Confirm the platform balance is reserved and the request appears in the admin list.
4. Reject it and confirm the amount is refunded to the platform available balance.
5. Repeat and mark it paid in simulation. Confirm pending balance is cleared and a platform ledger entry is created.
6. Confirm non-admin users cannot call any `/api/admin/*` endpoint.

## Acceptance criteria
- 60/40 allocation remains unchanged.
- Commission external references cannot be credited twice.
- User and platform balances cannot be overdrawn by concurrent withdrawal requests.
- Pending → rejected refunds exactly once; pending → paid clears the reservation exactly once.
- Client Firestore rules deny direct access to withdrawal requests and platform financial documents.
- All tests use staging-only Firebase, Worker secrets, and fake payout details.

## Important
The Worker only records simulated administrative payout outcomes. It does not initiate SEPA transfers or PayPal payouts. Do not mark a real request as paid until an actual transfer has cleared. Do not deploy this branch to production.
