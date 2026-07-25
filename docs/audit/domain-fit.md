# Domain Fit — AuctionMethod/clerkbid → Live Sale Clerk

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25

---

## Entity Mapping

| ClerkBid Entity | Live Sale Clerk Entity | Rename Type | Notes |
|---|---|---|---|
| `Event` | `Sale` | UI label only | Schema entity name stays `event`/`AuctionEvent` in v0 |
| `Lot` | `Item` | UI label + field name | `lotNumber` → `itemNumber` in UI; schema `lots` table stays |
| `Bidder` | `Buyer` | UI label only | Schema `bidders` table stays |
| `paddleNumber` | `buyerHandle` / `name` | UI label + column header | Facebook name or handle; uniqueness index still useful |
| `Sale` (record) | `Claim` | UI label only | Schema `sales` table stays |
| `Invoice` | `Bundle` / `Order` | UI label only | Schema `invoices` table stays |
| `Consignor` | — | **REMOVE** | Not in Founder Class v0 |
| `hammerPrice` | `claimedPrice` | UI label only | Field name can stay in schema; only label changes |
| `buyersPremiumRate` | — | Hide (default 0) | Not applicable to claim sales; keep in schema for v1–v6 export compat |
| `Initials` (clerk) | `Your initials` | UI label | Useful for solo seller accountability; keep |

---

## Workflow Mapping

| ClerkBid Step | Live Sale Clerk Step | Fit |
|---|---|---|
| Create event | Create sale (event) | ✅ Direct |
| Add lots | Add items to sale order | ✅ Direct; add `saleOrder` sort field |
| Register bidders | Add buyers | ✅ Direct |
| Enter sale (clerking screen) | Record claim | ✅ Direct; add `isPrimary`/`isBackup` toggle |
| Pass lot / no sale | Skip item / pass | ✅ Exists (`passedOut` flag inferred) |
| Generate invoice | Create bundle | ✅ Direct; hide BP line |
| Edit invoice | Edit bundle | ✅ Direct |
| Mark invoice paid | Mark bundle paid | ✅ Direct |
| Export CSV | Export sale + profit CSV | ✅ Adapt accounting CSV |
| Cloud backup / restore | Cloud backup / restore | ✅ Unchanged |
| **New: backup claim** | Record backup claimer | ⚠ Not in ClerkBid — add `isBackup: boolean` + `promotedAt` to `sales` |
| **New: promote backup** | Promote backup → primary | ⚠ New domain op needed |
| **New: sale order** | Drag/reorder items in sale | ⚠ `saleOrder` integer field needed on `lots` |
| **New: estimated profit** | Cost + claimed price delta | ⚠ `costBasis` field needed on `lots` |
| Whatnot channel | Channel label on item/sale | ✅ Simple string field; no API |

---

## Screen Coupling Assessment

### Clerking Screen (`app/(protected)/clerking/`)

**Coupling level: Medium.**  
The form field IDs (`lot`, `paddle`, `price`, `quantity`, `description`, `notes`, `consignor`, `initials`) are defined in `lib/saleFormOrder.ts`. Renaming for claim sales requires:
1. Updating `LABELS` constant in `saleFormOrder.ts` (`lot` → `item`, `paddle` → `buyer name`).
2. Adding `isPrimary` / `isBackup` radio or toggle to the form.
3. Removing `consignor` field from the default visible set (or hiding via `required: false` + not shown).

No logic rewrite required. The form renders fields dynamically from the `order` array.

### Lots Screen (`app/(protected)/lots/`)

**Coupling level: Low.**  
Adding `saleOrder` (integer) and `costBasis` (number) fields requires:
1. Dexie schema v11 migration adding two columns.
2. Lots list UI: add drag-to-reorder or numeric input for `saleOrder`.
3. Lots add/edit form: add `costBasis` input.

### Bidders Screen (`app/(protected)/bidders/`)

**Coupling level: Low.**  
Label rename only. Paddle uniqueness constraint remains useful (unique buyer handle per sale).

### Invoices / Bundles Screen (`app/(protected)/invoices/`)

**Coupling level: Low.**  
Hide `buyersPremiumAmount` line when rate is 0. Rename “Invoice” → “Bundle”. Otherwise unchanged.

### Reports Screen (`app/(protected)/reports/`)

**Coupling level: Low.**  
Add `estimatedProfit` column derived from `claimedPrice - costBasis`. Rename consignor columns or hide. Column headers are generated from report calculator output — localized change.

### Events Screen (`app/(protected)/events/`)

**Coupling level: Low.**  
Label rename only. Hide `buyersPremiumRate` field or collapse it into an “Advanced” section.

---

## New Fields Required for Founder Class v0

| Entity | New Field | Type | Purpose |
|---|---|---|---|
| `lots` | `saleOrder` | `number` | Position in sale running order |
| `lots` | `costBasis` | `number \| undefined` | Seller’s cost; used for profit estimate |
| `lots` | `channel` | `string \| undefined` | Channel label (e.g. “Whatnot”) — v0 label only |
| `sales` | `isPrimary` | `boolean` | True if this is the active primary claim |
| `sales` | `isBackup` | `boolean` | True if this is a backup claim |
| `sales` | `promotedAt` | `Date \| undefined` | Timestamp when backup was promoted to primary |

All fields are additive. No existing field is deleted. Dexie schema bumps from v10 → v11.

---

## Domain Invariants vs. ClerkBid Current State

| Invariant | ClerkBid State | Gap |
|---|---|---|
| Item cannot have two active primary claims | **Not enforced** at storage or domain layer | PR-04 must add guard |
| Item cannot belong to two completed purchases | Partially: `invoiceId` FK links sale to one invoice | Verify `isPrimary` flag isolates completed claims |
| Backups do not own item until promoted | **Not modeled** — no backup concept exists | PR-04 must add `isBackup` + promotion logic |
| Payment and fulfillment states are separate | `Invoice.paymentStatus` + (inferred) packing status | Add `packedAt` or `fulfillmentStatus` to invoice in PR-06 |
| Refund ≠ returned inventory | Not modeled (no refund concept) | Out of scope for v0 |
| Duplicate submissions are idempotent | Not enforced at domain layer | PR-04 must add `syncKey` dedup check |
| Failed sync is visible | `serverUnavailable` flag exists in `PushAllSummary` | UI must surface this — verify in PR-02 smoke test |
| Seller data is exportable | `buildFullDatabaseExport()` exists | ✅ Already implemented |
| Existing ClerkBid records readable | Export v1–v6 all accepted | ✅ Already implemented |
| Financial estimates expose missing inputs | Missing `costBasis` should show “cost not set” | Add to profit column in PR-07 |

---

## Fitness Verdict

**High fit.** The ClerkBid domain model is a superset of the Live Sale Clerk Founder Class v0 model. Every required workflow step maps to an existing ClerkBid concept with label renames or small additive schema changes. No core logic needs to be replaced. The largest gap is the backup-claim model, which requires a new domain concept (3 new fields + 1 new domain op) but does not require touching the sync, export, or auth layers.
