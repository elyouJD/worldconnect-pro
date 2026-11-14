# WorldConnect Earn Money API (Cloudflare Worker)

This Worker is a separate trusted API. It does not use Firebase Functions and it does not change the Cloudflare Pages/Worker hosting configuration of the main site.

## Safety and rollout
- Deploy first to a staging Worker and staging Firebase project.
- Keep the existing `main` branch untouched. Changes are delivered on `feature/earn-money-mvp` through PR #1.
- Do not publish affiliate offers until the exact advertiser/program has given written permission for cashback/reward sharing. This applies independently to Admitad, Awin and impact.com; choosing a network does not mean its individual programs approve incentives.
- Only enter a commission after the network has confirmed it as paid/received and eligible for rewards. The Worker allocates 60% to the user and 40% to WorldConnect from the supplied net commission amount.
- Do not put service-account credentials in GitHub, frontend JavaScript, or Wrangler config.

## Required Cloudflare secrets
Run from this directory:
```bash
npx wrangler secret put GOOGLE_CLIENT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY
npx wrangler secret put ADMIN_UIDS
```
Set `FIREBASE_PROJECT_ID` in `wrangler.toml` to the exact Firebase project ID. The Google service account needs the minimum Firestore data access required for this API. Prefer a dedicated service account and rotate its key. `ADMIN_UIDS` is a comma-separated allowlist of Firebase Auth UIDs. The Firebase ID token must also contain the custom claim `admin: true`.

## API
All routes except `/health` require a Firebase ID token in `Authorization: Bearer <idToken>`, the `admin: true` custom claim, and an allowed UID.

- `GET /api/admin/summary`: active/inactive offers and pending withdrawal requests.
- `POST /api/admin/offers`: create an offer. Body: `{ "title":"...", "description":"...", "network":"admitad|awin|impact", "url":"https://...", "active":false, "termsApproved":false }`. Offers default to inactive unless explicitly enabled and marked terms-approved.
- `PATCH /api/admin/offers/:id`: set `{ "active": true|false }`.
- `POST /api/admin/commissions`: manually reconcile a received commission. Body: `{ "uid":"FIREBASE_UID", "externalId":"unique-network-transaction-id", "netCommissionCents":1000 }`. User share is 60%; platform share is 40%. A duplicate external reference is rejected.
- `POST /api/withdrawals`: authenticated user submits `{ "amountCents":1000, "method":"bank|paypal", "payoutDetails":"..." }`. The Worker reserves the amount from available balance and creates a uniquely identified pending request in one Firestore commit.
- `GET /api/withdrawals`: returns the authenticated user's recent withdrawal history.
- `PATCH /api/admin/withdrawals/:requestId`: body `{ "status":"paid" }` or `{ "status":"rejected" }`. The Worker releases the reserved amount from pending withdrawals; on rejection it restores the amount to available balance. Both outcomes write an immutable wallet-ledger entry. A paid status only records a confirmed manual payout; it does not send money.

## Important implementation note
The commission endpoint uses a create-only commission record and a Firestore commit to prevent reusing the same external reference. Before production, add transaction-level concurrency control and test concurrent commission submissions and concurrent withdrawal reviews against a non-production Firebase project. Withdrawal creation and review now use Firestore preconditions to prevent two concurrent requests from spending the same available balance. The current API is an MVP reconciliation tool, not a payment processor. It records administrative decisions; it does not send PayPal or SEPA transfers. Mark a request paid only after the transfer has actually cleared.

## Payout methods
The app supports bank transfer (SEPA/IBAN) and PayPal as request methods. Payout execution is manual by an authorized operator. Store only the minimum payout details, restrict dashboard access, define retention/deletion periods, and complete GDPR, tax, KYC/AML and payment-provider checks before launch.
