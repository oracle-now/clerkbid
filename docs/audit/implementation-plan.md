# Implementation Plan — Live Sale Clerk Founder Class v0

**Audit date:** 2026-07-25  
**Decision:** B — Vertical Fork  
**Target:** Private pilot ready by Day 15

---

## PR Sequence

### PR-01 — Forensic Audit Documents
**Branch:** `audit/clerkbid-forensic-2026-07`  
**Day:** 1 (today)  
**Files:** `docs/audit/*.md` (all 13 documents)  
**Gate:** No code changes. Merge after stakeholder review of `open-questions.md`.

---

### PR-02 — Independent Deploy Scaffold
**Branch:** `feat/deploy-scaffold`  
**Day:** 2–3  
**Owner:** Infra agent

**Changes:**
- Add `.env.example` diff: annotate which vars are required vs. optional for Live Sale Clerk v0
- Add `docs/deploy/quickstart.md`: step-by-step deploy guide (Neon setup, SQL migrations, env vars, Vercel deploy)
- Add `.github/workflows/ci.yml`: `npm ci && npm test && npm run build` on push/PR
- Remove `app/api/admin/` routes (super-admin not needed for v0) — or gate behind `SUPER_ADMIN_EMAILS` env guard already in `middleware.ts`
- Remove `app/api/ably/` if `NEXT_PUBLIC_ABLY_SYNC` is not set (or conditionally compile)
- Remove `app/api/announcements/` (not needed for v0)
- Verify `app/api/sync/push/route.ts`: confirm `vendor_id` from session, not body. Document result.
- Run `npm ci && npm run build` on Node 20. Record result. If build fails, fix minimal reproducibility issues only.

**Gate:** CI green. Deploy scaffold verified on a test Neon instance.

---

### PR-03 — UI Terminology Rename
**Branch:** `feat/terminology-rename`  
**Day:** 4–5  
**Owner:** UI agent

**Changes:**
- `lib/saleFormOrder.ts`: update `LABELS` — `lot` → `"Item number"`, `paddle` → `"Buyer name"`, `price` → `"Claimed price"`, `consignor` → hide (set required: false in DEFAULT_SALE_FIELD_REQUIRED)
- `app/(protected)/lots/`: rename “Lot” → “Item” in all page titles, headings, column headers, button labels
- `app/(protected)/bidders/`: rename “Bidder” → “Buyer”, “Paddle” → “Name / Handle”
- `app/(protected)/events/`: rename “Event” → “Sale”; hide `buyersPremiumRate` field (or collapse to Advanced)
- `app/(protected)/invoices/`: rename “Invoice” → “Bundle”; hide buyers-premium line when rate = 0
- `app/(protected)/clerking/`: rename form field labels per above; remove consignor column from default form order
- `app/(protected)/dashboard/`: update summary card labels
- `app/layout.tsx`: update `<title>` and any `APP_NAME` constant
- `public/manifest.json`: update `name` and `short_name`
- `public/` icons: replace with Live Sale Clerk brand assets
- `terms/`: replace all files with Live Sale Clerk legal copy
- `hs-fields/`: delete directory
- `AUCTION_MANAGER_PWA_SPEC.md`: move to `docs/archive/` (internal reference only)

**Gate:** All 15 existing unit tests still pass. Manual smoke: create an event (sale), add a buyer, add items, enter a claim.

---

### PR-04 — Claim Workflow
**Branch:** `feat/claim-workflow`  
**Day:** 6–7  
**Owner:** Claim workflow agent

**Changes:**
- `lib/db.ts`: bump to v11
  - Add `saleOrder: number`, `costBasis?: number`, `channel?: string` to `lots` interface and store
  - Add `isPrimary: boolean`, `isBackup: boolean`, `promotedAt?: Date` to `sales` interface and store
  - Add v11 upgrade hook (defaults per `migration-options.md`)
- `lib/services/dataPorter.ts`: bump `EXPORT_VERSION` to 7; add new fields to payload types; add v6-import compat defaults
- `app/(protected)/clerking/`: add primary/backup toggle to claim entry form
- Add domain guard: before `db.sales.add()`, if `isPrimary: true`, verify no existing `isPrimary: true` sale exists for this lot in this event — throw if duplicate
- Add `syncKey` dedup check: `db.sales.where('syncKey').equals(key).count() > 0 → return existing`
- Add `promoteBackupToPrimary(db, backupSaleId)` domain op: atomically sets backup → primary, clears old primary (sets `isPrimary: false`)
- Add unit tests:
  - Duplicate primary claim rejected
  - Backup promotion succeeds
  - Duplicate `syncKey` submission is idempotent

**Gate:** All new unit tests pass. All 15 existing unit tests still pass.

---

### PR-05 — Sale Order + Bundle Grouping Screen
**Branch:** `feat/sale-order-bundle`  
**Day:** 8–9  
**Owner:** UI agent

**Changes:**
- `app/(protected)/lots/`: add `saleOrder` drag-or-number input; sort lot list by `saleOrder` ascending
- `app/(protected)/clerking/`: show items in `saleOrder` sequence; “Next item” advances by `saleOrder`
- `app/(protected)/invoices/` (bundle view): group unclaimed / claimed / paid bundles; show item count per buyer
- Add `saleOrder` to CSV lot import template

**Gate:** Existing tests pass. Manual smoke: reorder 10 items, enter claims in order, verify bundle grouping.

---

### PR-06 — Payment Status + Pack/Find Screen
**Branch:** `feat/payment-pack`  
**Day:** 10–11  
**Owner:** UI agent

**Changes:**
- `lib/db.ts` (v12 or additive to v11): add `fulfilledAt?: Date` and `packedAt?: Date` to `invoices` interface
- `app/(protected)/invoices/[id]/`: add “Mark packed” and “Mark fulfilled” buttons; separate from “Mark paid”
- Add pack/find view: list all bundles with payment and fulfillment status; filter by unpacked / unpaid
- Add note to UI: “Refund does not automatically return inventory” (tooltip or help text)

**Gate:** Existing tests pass. Manual smoke: mark a bundle paid, mark it packed, verify states are independent.

---

### PR-07 — Export: Sale Summary + Estimated Profit CSV
**Branch:** `feat/export-csv`  
**Day:** 12  
**Owner:** Finance/export agent

**Changes:**
- `lib/services/accountingCsv.ts`: add `estimatedProfit` column (`claimedPrice - costBasis`); show `"cost not set"` when `costBasis` is undefined
- `lib/services/reportCalculator.ts`: add profit aggregation; expose total claimed, total cost basis, estimated profit
- `app/(protected)/reports/`: add “Sale Summary” export button → downloads CSV with item, buyer, claimed price, cost basis, estimated profit
- Add unit test for profit calculation with missing `costBasis`

**Gate:** `accountingCsv.test.ts` updated and passing. Manual export verified.

---

### PR-08 — Whatnot Channel Label
**Branch:** `feat/whatnot-label`  
**Day:** 13  
**Owner:** UI agent

**Changes:**
- `app/(protected)/lots/` add/edit form: add optional `Channel` dropdown with options `["", "Whatnot", "Facebook", "Other"]`
- Display channel label as a badge on item list and clerking item card
- No API integration; label is stored in `lots.channel` field (added in PR-04)

**Gate:** Unit test for channel field persistence. Manual smoke: set channel label, verify it shows on clerking screen.

---

### PR-09 — Founder Class v0 Smoke Tests
**Branch:** `feat/founder-smoke-tests`  
**Day:** 14–15  
**Owner:** QA agent

**Smoke test script (manual checklist):**
1. Register new account on pilot instance
2. Create a sale (event) — verify zero buyer-premium
3. Add 10 items with `saleOrder` and `costBasis`
4. Add 3 buyers
5. Enter 10 primary claims; verify duplicate primary blocked
6. Enter 1 backup claim; promote to primary; verify old primary cleared
7. Generate bundles for all buyers
8. Mark one bundle paid; mark it packed; verify states independent
9. Export sale summary CSV; verify `estimatedProfit` column
10. Cloud backup; clear IndexedDB; restore from cloud; verify data intact
11. Full database export (JSON); re-import; verify all records present
12. Open two tabs; modify same item in both; verify no crash
13. Go offline (DevTools → Offline); enter a claim; go online; verify sync
14. Mobile viewport (375px): enter a claim; verify usable

**Automated additions:**
- Extend `dataPorter.test.ts`: v7 export round-trip with `isPrimary`, `isBackup`, `saleOrder`, `costBasis`
- Extend `invoiceLogic.test.ts`: bundle with `fulfilledAt` / `packedAt` states

**Gate:** All automated tests pass. All 14 smoke-test steps checked off by a human reviewer.

---

## File Ownership Boundaries

| Directory / File | Owner Agent | Rule |
|---|---|---|
| `lib/db.ts` | Persistence agent | Every change requires a schema version bump and upgrade hook |
| `lib/services/cloudSync.ts` | Sync agent | No change without `snapshotMerge.test.ts` regression |
| `lib/services/snapshotMerge.ts` | Sync agent | No change without full merge unit test suite passing |
| `lib/services/dataPorter.ts` | Finance/export agent | Every change requires export version bump and backward-compat import path |
| `lib/services/invoiceLogic.ts` | Finance/export agent | No change without `invoiceLogic.test.ts` passing |
| `lib/clerking/` | Claim workflow agent | Domain guards must have unit tests before merge |
| `app/api/sync/` | Security agent | Vendor scoping must be verified on every change |
| `db/*.sql` | Migration agent | Append-only; never modify already-applied migrations |
| `app/(protected)/` UI screens | UI agent | Label changes are safe; logic changes require domain agent review |
| `docs/audit/` | Audit agent | This directory is append-only after PR-01 merges |

---

## Risks Accepted for Private Alpha

- Stress tests are static inferences only (no live build executed in audit).
- Two-tab conflict is possible but low-probability for solo seller.
- `@vercel/analytics` telemetry active (disclose in onboarding).
- No CI pipeline until PR-02 (first PR adds it).

## Risks That Must Be Fixed Before Inviting Users

1. Vendor scoping on `/api/sync/push` verified (PR-02)
2. Duplicate primary claim guard implemented (PR-04)
3. `terms/` replaced with Live Sale Clerk legal copy (PR-03)
4. `hs-fields/` removed (PR-03)
5. `migrate_admin_impersonation.sql` not applied on pilot DB (PR-02 checklist)
6. Rate limiting or invite-only registration enforced (PR-02)
