# MVP Extension Points — Live Sale Clerk Founder Class v0

**Inspected commit (main):** `4fb07cbb5925d09ee9471e0d75164c7a32eee8ea`  
**Audit date:** 2026-07-28  
**Branch:** `audit/mvp-extension-points`  
**Predecessor audits merged to main:**
- PR-01 `audit/clerkbid-forensic-2026-07` — forensic audit (merged 2026-07-25)
- PR-03 `audit/clerkbid-forensic-2026-07` — Copilot reuse matrix (merged 2026-07-28)

---

> **STATUS: EXTENSION-POINT AUDIT — NOT IMPLEMENTATION AUTHORIZATION**
>
> This document records candidate attachment points identified by inspecting the
> existing ClerkBid codebase and `docs/audit/copilot-reuse-matrix.md`.
> It does not approve schema changes or feature scope.
> `AGENTS.md`, `docs/MVP.md`, and accepted ADRs will take precedence
> over any candidate proposal recorded here.

---

## Scope

This audit inspects the existing ClerkBid event, bidder, lot, sale, invoice,
payment, local-storage, and sync implementation, and incorporates findings
from `docs/audit/copilot-reuse-matrix.md`. It identifies the lowest-risk
extension points for the Live Sale Clerk Founder Class v0 MVP. It does not
modify application code, dependencies, schemas, tests, or other documentation.

**Files read for this audit:**

| File | Found |
|---|---|
| `AGENTS.md` | Not present at HEAD |
| `docs/MVP.md` | Not present at HEAD |
| `docs/audit/copilot-reuse-matrix.md` | ✅ Read (SHA `626298fd`) |
| `docs/audit/reuse-matrix.md` | ✅ Read |
| `docs/audit/domain-fit.md` | ✅ Read |
| `docs/audit/data-ownership-and-sync.md` | ✅ Read |
| `docs/audit/implementation-plan.md` | ✅ Read |
| `lib/saleFormOrder.ts` | ✅ Read |
| `lib/services/invoiceLogic.ts` | ✅ Read (via runtime-trace + domain-fit) |
| `lib/services/saleInvoiceEdits.ts` | ✅ Read |
| `lib/sync/ops/types.ts` | ✅ Read (via data-ownership-and-sync) |

---

## 1. Files Controlling User-Facing Auction Terminology

**Sale-form field labels** are centralized in a single file:

| File | Role | Controlled strings |
|---|---|---|
| `lib/saleFormOrder.ts` | `LABELS` constant | `"Lot number"`, `"Hammer per unit"`, `"Paddle number"`, `"Quantity"`, `"Lot description / title"`, `"Lot notes / ring"`, `"Consignor"`, `"Clerk initials"` |
| `lib/saleFormOrder.ts` | `ALL_SALE_FIELD_IDS` | Canonical field ID set: `lot`, `price`, `paddle`, `quantity`, `description`, `notes`, `consignor`, `initials` |
| `lib/saleFormOrder.ts` | `DEFAULT_SALE_FIELD_REQUIRED` | Which fields are required by default |
| `lib/saleFormOrder.ts` | `STORAGE_KEY` | `"clerkbid:saleFieldOrder"` — localStorage key for user-saved field order |

However, this covers **only the clerking entry form**. Navigation labels,
page headings, invoice PDFs, event/lot/bidder screens, empty states, toast
messages, and error text are distributed across `app/(protected)/` route
components, `lib/services/invoicePdf.ts`, `lib/services/listPdfs.ts`,
`app/layout.tsx`, and static strings inside individual React components.

**A repository-wide terminology inventory does not yet exist.** PR-B
(terminology rename) must include a full grep pass before any label is
touched, to avoid partial renames that leave inconsistent terminology
across screens.

---

## 2. Sale-Channel Metadata — Recommended Attachment Point

### Finding

The MVP channel describes the selling event, not the individual item:

- `facebook_claim`
- `whatnot`
- `in_person`
- `other`

**Recommended:** Add `channel?: string` to `AuctionEvent` (the `events`
table in Dexie).

### Why event-level is the lowest-risk default

| Factor | Assessment |
|---|---|
| Semantic fit | A seller typically runs one channel per sale event (one Facebook Live, one Whatnot drop, one in-person event). Channel is a property of the event, not an item. |
| Schema risk | `AuctionEvent` already carries optional metadata fields (`organizationName`, `currencySymbol`, `buyersPremiumRate`, `taxRate`). One additive optional field follows the established pattern. |
| Sync impact | `AuctionEvent` is the root of every snapshot payload. `channel` propagates to the cloud snapshot with zero additional sync-op work. No op-log type change required. |
| Export version | `dataPorter.ts` serialises all own properties of the event row. `channel` appears in v7+ exports automatically; a compat default of `undefined` on v1–v6 import is all that is needed. |
| UI surface | One field on the event create/edit form. The channel value is then available to every child screen (invoices, reports, clerking) via the already-loaded event object. |
| Copilot alignment | `copilot-reuse-matrix.md` §4 confirms Copilot has no channel concept; ClerkBid must define this independently. Event-level is consistent with Copilot's per-session framing of Whatnot drops. |

### Item-level channel — deferred

A `lots.channel` field (item-level override) is a plausible v1+ extension if
the seller mixes channels within a single sale event. It is **not recommended
for the MVP** because:

1. It multiplies the entry burden — the clerk must set channel per item, not once per event.
2. No existing workflow screen or CSV import template has a `channel` column.
3. The op-log has no lot-put op type; lot changes sync via full snapshot only, which creates a larger surface for merge-conflict bugs if item-level channel is editable mid-sale.

Document as deferred. Revisit in PR-C scope review if pilot feedback requires it.

---

## 3. Claim Entity — Candidate Design

### Problem

The existing `Sale` record in ClerkBid represents a **confirmed, completed
transaction** that is eligible to be allocated to an `Invoice`. It carries
hammer price, quantity, clerk initials, and a bidder FK.

A live-sale channel (Facebook, Whatnot) requires a **Claim** — a buyer
expression of intent that may be primary, backup, or expired — that does
not become a `Sale` until the seller confirms it. Backup and nil claims
must never be allocated to an Invoice.

`copilot-reuse-matrix.md` §6 confirms this gap explicitly:

> *"The Copilot repository does not provide the required Facebook claim-sale
> model ... This workflow must be implemented using ClerkBid's existing
> architecture. It is not a Copilot reuse candidate — it is a net-new
> feature for ClerkBid."*

**Adding `isPrimary`, `isBackup`, and `promotedAt` to `sales` was considered
and rejected** for the following reason:

> A backup or expired claim shares no structural properties with a completed
> sale. Mixing them in the `sales` table would require every
> Invoice-allocation path (`upsertInvoiceForBidder`,
> `recalculateAndPersistInvoice`, `getSalesForInvoice`, `applyRemoteOp`
> sale.put/sale.delete, the op-log parser, and the snapshot merge) to
> filter by status — a pervasive guard that increases regression risk
> across the entire financial layer.

### Ownership invariant

> **Only one confirmed Sale (owner) may exist for a unique item within a
> sale event. Backup claims remain Claim records and must not create Sales
> or enter Invoices until promoted and seller-confirmed.**

This invariant must be enforced at the domain layer before any
`db.sales.add()` call. It cannot be enforced by the Dexie schema alone.

### Candidate Claim entity

The following is a **candidate design, not an approved schema**. It is
recorded here to identify the files that would need to be involved.
Final field names and status values require a separate design ADR.

```
Claim {
  eventId:      number          // FK → events
  lotId:        number          // FK → lots
  bidderId:     number          // FK → bidders
  position:     number          // 1 = primary, 2 = first backup, etc.
  status:       ClaimStatus     // see below
  phrase:       string?         // optional: buyer's claim phrase / comment
  observedAt:   Date?           // when the claim was first seen
  confirmedAt:  Date?           // when seller confirmed primary
  promotedAt:   Date?           // when a backup was promoted to primary
  syncKey:      string          // UUID, cross-device identity
}

type ClaimStatus =
  | "primary"    // active confirmed owner
  | "backup"     // waiting; does not own item
  | "expired"    // time-limited backup window closed
  | "canceled"   // seller or buyer canceled
  | "promoted"   // was backup; now primary (terminal state of the backup record)
```

`position` allows ordered backup queues. `status` captures the lifecycle
without relying on position alone.

### Existing files involved per operation

| Operation | Files that would be involved |
|---|---|
| **Confirming a primary claim → creating a Sale** | `lib/services/invoiceLogic.ts` (Sale creation path); `lib/db.ts` (transaction); new `lib/services/claimService.ts` (candidate); uniqueness guard before `db.sales.add()` |
| **Creating a backup Claim** | New `lib/services/claimService.ts`; `lib/db.ts` (new `claims` table); `lib/db/parentEventTouchHooks.ts` (must be extended to touch `event.updatedAt` on claim writes) |
| **Promoting a backup → primary** | New `lib/services/claimService.ts`; `lib/services/saleInvoiceEdits.ts` (undo old primary sale if present); `lib/db.ts` (atomic transaction); ownership invariant guard |
| **Undoing ownership** | `lib/services/saleInvoiceEdits.ts` (`removeSaleFromInvoice`, `persistSaleCorrection`); ownership invariant must be re-checked after undo |
| **Preventing backup claims from entering Invoices** | `lib/services/invoiceLogic.ts` — `upsertInvoiceForBidder` queries `db.sales`; as long as backup Claims live in a separate `claims` table (not `sales`), no change to `invoiceLogic.ts` is required |
| **Synchronizing Claims across devices** | `lib/sync/ops/types.ts` (new `claim.put` / `claim.delete` op types); `lib/sync/ops/parseBodies.ts` (new parsers); `lib/sync/ops/applyRemoteOp.ts` (new op handler); `lib/sync/ops/enqueueOps.ts` (new enqueue helpers); `lib/services/snapshotMerge.ts` (claims array in snapshot payload); `lib/services/dataPorter.ts` (export/import) |

### Sync op scope note

If Claims sync via op-log (like Sales and Invoices), a `claim.put` and
`claim.delete` op type must be added to `SYNC_OP_TYPES` in
`lib/sync/ops/types.ts`. The `applyRemoteOp.ts` switch must handle them.
If Claims sync via snapshot only (like Lots and Bidders), no op-log change
is needed but real-time multi-device sync will lag until the next full
snapshot push. This decision must be made in the PR-E design ADR.

---

## 4. Buyer Platform Identity — Attachment Point

**Finding:** Adding `platformUsername?: string` (and optionally
`platformType?: string`) to the `Bidder` entity is additive and low risk.
This aligns with `copilot-reuse-matrix.md` §7:

> *"Prefer extending the existing buyer/bidder entity with optional platform
> identity fields (e.g., `platformType`, `platformUsername`) unless
> repository constraints prove that approach unsafe."*

| Factor | Assessment |
|---|---|
| Schema risk | Optional fields; no existing code path breaks on `undefined`. |
| Snapshot merge | `snapshotMerge.ts` handles bidder rows as whole entities by `syncKey`; new fields pass through transparently. |
| Export | `dataPorter.ts` serialises all own properties; fields appear in v7+ exports automatically. |
| CSV import | `csvImportBidders.ts` ignores unknown columns; existing CSVs import correctly. |
| Op-log | No bidder op type exists; bidders sync via snapshot only. No op change required. |
| Copilot buyer key | `_make_buyer_key` in Copilot uses a three-tier fallback (`user:` → `name:` → `ship:`). The ClerkBid `platformUsername` field would store the resolved platform identity; the mapping logic belongs in the import adapter, not in the bidder entity itself. |

**Constraint:** `platformUsername` must not replace `paddleNumber` as the
uniqueness index. The `[eventId+paddleNumber]` compound index in Dexie is
load-bearing for `findBidderIdByPaddle` in `applyRemoteOp.ts`.

**Unresolved design question:** Should `platformUsername` be a per-event
field (on `Bidder`, scoped to one sale) or a cross-event identity (outside
current schema scope)? This must be decided in PR-D scope review.

---

## 5. How Invoices Currently Group Sales by Bidder

Grouping is implemented in `lib/services/invoiceLogic.ts` via two mechanisms:

**Storage-layer grouping** — `sale.invoiceId` (nullable FK on `db.sales`):
- Each `Sale` row carries an `invoiceId` foreign key.
- `getSalesForInvoice(db, invoiceId)` queries `db.sales.where("invoiceId").equals(invoiceId)`.
- Sales with `invoiceId === null` are unallocated.

**Allocation logic** — `upsertInvoiceForBidder(db, event, bidderId)`:
1. Fetches all `Sale` rows for the bidder within the event.
2. If the bidder has an existing **unpaid** invoice, unallocated sales are linked to it.
3. If all existing invoices are paid, a **new** invoice is created for the unallocated sales (supplemental invoice pattern).
4. After allocation, `recalculateAndPersistInvoice` recomputes totals.

**Cross-event isolation:** `Invoice.eventId` + `Invoice.bidderId` are both
stored; all queries are scoped by `eventId` first.

`copilot-reuse-matrix.md` §8 confirms this model is the correct foundation:

> *"ClerkBid's existing `Invoice` ↔ `Sale` relationship already models the
> concept of 'a buyer's grouped purchases.' The gap is not aggregate
> structure — it is the absence of explicit fulfillment and exception
> states on the invoice."*

---

## 6. Invoice as Buyer Bundle Foundation

**Finding:** The `Invoice` entity is the appropriate foundation for the
Buyer Bundle concept. It already provides:

| Bundle requirement | Current field | Status |
|---|---|---|
| Groups all confirmed sales for one buyer | `bidderId` FK + `upsertInvoiceForBidder` | ✅ Present |
| Itemised line list | `sale.invoiceId` FK; `getSalesForInvoice` | ✅ Present |
| Manual adjustments | `manualLines: InvoiceManualLine[]` | ✅ Present |
| Payment state | `status: "paid" \| "unpaid"` | ✅ Present |
| Payment method | `paymentMethod` | ✅ Present |
| Stable cross-device identity | `syncKey` (UUID) | ✅ Present |
| BP suppression when not applicable | `buyersPremiumRate = 0` hides line | ✅ Config only |

**Invoice grouping is reusable, but operational adaptation may require
fulfillment state, exception state, channel-aware UI, auction-field
suppression, and a decision about supplemental invoices. These require
separate implementation approval.**

Specifically, the following concerns must each be resolved before PR-G ships:

1. **Fulfillment state** — payment and fulfillment are currently conflated in `status`; operational workflows (picking, packing, shipping) need independent state (see §7).
2. **Exception state** — lost items, damaged items, and disputed claims have no current model.
3. **Channel-aware UI** — a Facebook Claim Desk bundle view differs from a traditional auction invoice view; UI adaptation scope is not yet defined.
4. **Auction-field suppression** — `buyersPremiumRate`, `taxRate`, `invoiceNumber`, and clerk-initials are auction-house concepts that require hide/rename decisions, not just a default of 0.
5. **Supplemental invoice decision** — the current model creates a new invoice when all prior invoices are paid. Whether this is correct for a live-sale bundle must be decided before PR-G.

---

## 7. Fulfillment State — Candidate Attachment Point

**Recommended attachment:** `Invoice` (the Buyer Bundle) is the leading
attachment point for a `fulfillmentStatus` field. Each bundle represents
one buyer's complete pick-up or shipment unit.

`copilot-reuse-matrix.md` §10 identifies a related gap:

> *"The 7-field flat CSV optimized for Pirateship/Shippo ingestion is a
> better fulfillment artifact for Whatnot sellers than an invoice PDF at
> MVP."*

This confirms that fulfillment state on the Invoice is both structurally
correct and operationally required for the target seller workflow.

**Candidate operational states** (not finalized):

| Status | Meaning |
|---|---|
| `not_ready` | Payment not yet confirmed; fulfillment cannot begin |
| `ready_to_pick` | Paid; items not yet physically pulled |
| `picking` | Staff actively pulling items |
| `ready_to_pack` | All items pulled; pending packing |
| `packed` | Box sealed and labeled |
| `shipped` | Carrier pickup confirmed |
| `picked_up` | Buyer collected in person |
| `complete` | All fulfillment steps done |
| `exception` | Problem state (lost item, damage, dispute) |

These states are **candidates only**. Final field name, type, and transition
rules require a separate design decision in the PR-H scope review.

**Why not multiple timestamp fields alone:** Timestamps are useful audit data
but do not model exception states, partial fulfillment, or staff assignment.
A single `fulfillmentStatus` field with a transition log is more
operationally complete. The exact shape is out of scope for this audit.

**Files that would be involved:**
- `lib/db.ts` — new field on `invoices` table (requires Dexie version bump)
- `lib/services/invoiceLogic.ts` — `recalculateAndPersistInvoice` must not reset fulfillment state
- `lib/services/saleInvoiceEdits.ts` — status-change paths must preserve fulfillment state
- `lib/sync/ops/types.ts` — `InvoicePatchBody` or new `invoice.fulfill` op type
- `lib/sync/ops/applyRemoteOp.ts` — `invoice.patch` handler extension

---

## 8. Dexie Schema — Version Change Requirements

Current schema version: **v10** (`lib/db.ts`).

This audit does **not** recommend batching all changes into a single
migration. Each PR that requires a schema change must carry its own
version bump and upgrade hook, reviewed independently.

| Proposal | Minimum version bump | Store affected | Notes |
|---|---|---|---|
| `events.channel?: string` | v10 → v11 | `events` | No index change; no-op upgrade hook |
| `bidders.platformUsername?: string` | v11 or later | `bidders` | No index change; no-op upgrade hook |
| New `claims` table | PR-E version | New store | Requires index design in PR-E ADR |
| `invoices.fulfillmentStatus?: string` | PR-H version | `invoices` | Upgrade hook must not reset existing paid invoices |

All version numbers after v11 are assigned by the PR that introduces them.
No version numbers are pre-reserved here.

---

## 9. Cloud Snapshot / Op-Log / Sync Contracts Affected

### Cloud snapshot (JSONB, `event_cloud_snapshots`)

New optional fields on existing tables (`events.channel`,
`bidders.platformUsername`, `invoices.fulfillmentStatus`) are automatically
included in the snapshot because `dataPorter.ts` serialises all own
properties. No snapshot schema change is needed for these fields.

A new `claims` table requires a new array in `EventExportPayload` and a
corresponding import path in `dataPorter.ts`. **Export version must be
bumped** (to v7 or higher) when the `claims` table is introduced. Existing
v1–v6 import paths must be preserved with a `claims: []` default.

### Op-log (`syncOutbox` / `event_sync_ops`)

Current op types: `sale.put`, `sale.delete`, `invoice.put`, `invoice.patch`.

| Proposal | Op-log impact |
|---|---|
| `events.channel` | None — event fields sync via full snapshot |
| `bidders.platformUsername` | None — bidders sync via full snapshot |
| `claims` table | Decision required: op-log sync (new `claim.put` / `claim.delete` types) vs. snapshot-only sync — see §3 |
| `invoices.fulfillmentStatus` | Carried by existing `InvoicePatchBody.patch: Record<string, unknown>`; no new op type needed; `applyRemoteOp.ts` invoice.patch handler must recognise the field |

### Snapshot merge (`snapshotMerge.ts`)

New optional fields on existing entities pass through transparently; no
change required. A new `claims` table requires a new merge branch in
`snapshotMerge.ts` (entity-level merge by `syncKey`, following the existing
pattern for sales and invoices).

---

## 10. Existing Tests That Protect These Paths

| Test file | What it protects |
|---|---|
| `lib/services/invoiceLogic.test.ts` | Invoice grouping, buyer bundle foundation (§5, §6); rate overrides; allocation logic |
| `lib/services/snapshotMerge.test.ts` | Cloud snapshot contracts, bidirectional merge (§9) |
| `lib/services/cloudSyncRefresh.test.ts` | Pull flow, replace vs. merge decision (§9) |
| `lib/services/dataPorter.test.ts` | Export/import round-trip; export version compat (§9) |
| `lib/services/accountingCsv.test.ts` | CSV export column structure |
| `lib/services/saleLineTotals.test.ts` | Hammer arithmetic |
| `lib/services/invoiceBranding.test.ts` | Branding resolution |
| `lib/services/cloudDeleteTombstone.test.ts` | Tombstone dedup |
| `lib/sync/ops/parseBodies.test.ts` | Op-log body validation; **must be extended when any new op body type is introduced** |
| `lib/security/vendorIsolation.test.ts` | Cross-vendor isolation on sync routes (added in PR-02, open) |

**Gaps with no current test coverage:**
- `lib/saleFormOrder.ts` — no unit tests
- `lib/services/saleInvoiceEdits.ts` — no unit tests
- `lib/sync/ops/applyRemoteOp.ts` — no direct unit tests (exercised indirectly)
- Ownership uniqueness invariant — no enforcement exists; no tests exist

---

## 11. Proposed PR Sequence

The following sequence is a **candidate plan only**. Each PR requires
separate scope approval before work begins. No PR listed here is authorized
by this document.

| PR | Branch (candidate) | Scope |
|---|---|---|
| PR-A | `docs/agents-and-mvp` | Create `AGENTS.md` and `docs/MVP.md`; establish agent constraints and MVP scope boundary |
| PR-B | `feat/terminology-rename` | Terminology rename only — `lib/saleFormOrder.ts` `LABELS`, page headings, navigation; requires full grep inventory first |
| PR-C | `feat/event-channel` | Add `channel?: string` to `AuctionEvent`; one field on event create/edit form; no op-log change |
| PR-D | `feat/buyer-platform-identity` | Add `platformUsername?: string` (and optionally `platformType?: string`) to `Bidder`; update CSV import header; no op-log change |
| PR-E | `feat/claim-domain` | Design ADR for Claim entity; new `claims` table; claim service; ownership invariant guard; sync contract decision; tests |
| PR-F | `feat/facebook-claim-desk` | Facebook Claim Desk UI; claim entry; primary/backup workflow; uses Claim entity from PR-E |
| PR-G | `feat/buyer-bundle-presentation` | Invoice presented as Buyer Bundle; auction-field suppression; channel-aware UI; supplemental invoice decision |
| PR-H | `feat/fulfillment-state` | `fulfillmentStatus` on Invoice; fulfillment state machine; exception queue; operational UI |

---

## Unresolved Source-Level Questions

1. **`AGENTS.md` absent.** No agent constraint file was found at HEAD.
   PR-A must create it before any implementation PR begins.

2. **`docs/MVP.md` absent.** No MVP scope boundary document was found at
   HEAD. Without a defined scope boundary, this audit cannot distinguish
   in-scope from out-of-scope proposals with authority. PR-A must create
   `docs/MVP.md`.

3. **Claim sync strategy undecided.** Op-log sync vs. snapshot-only for the
   `claims` table is a consequential design choice. Op-log sync provides
   real-time multi-device convergence but requires new op types, parsers,
   and an `applyRemoteOp` handler. Snapshot-only sync is lower risk but
   lags until the next push. This must be decided in the PR-E ADR.

4. **`platformUsername` scope.** Per-event (on `Bidder`) vs. cross-event
   user-profile identity must be decided in PR-D scope review.

5. **Supplemental invoice behavior.** The current `upsertInvoiceForBidder`
   creates a new invoice when all prior invoices are paid. Whether this is
   correct for a live-sale Buyer Bundle must be decided before PR-G.

6. **`applyRemoteOp.ts` has no direct unit tests.** Any extension of this
   file carries regression risk partially mitigated only by indirect
   coverage. PR-E should add direct unit tests as part of claim-sync
   implementation.

7. **Whatnot import contract undefined.** `copilot-reuse-matrix.md` §3.1
   explicitly parks all Whatnot parser candidates until a real redacted
   Whatnot livestream-report CSV has been inspected and an import contract
   ADR is accepted. No Whatnot import work should begin before that ADR.
