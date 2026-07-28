# docs/MVP.md — Live Sale Clerk · Founder Class v0

**Status:** Authoritative scope document  
**Effective:** 2026-07-28  
**Supersedes:** All prior informal scope discussions  
**Governed by:** `AGENTS.md` domain rules DR-1 through DR-8

---

> **Scope boundary:** This document defines what is built, what is
> explicitly excluded, and what must be true before pilot launch. Any
> feature not listed here as In Scope is Out of Scope by default.

---

## 1. Facebook Manual Claim Intake

### What it is

A seller-operated screen where the clerk manually enters Facebook comment
claims as they appear during a live video sale. There is no scraping,
automation, or AI parsing. The seller (or one assistant) reads comments and
types claims in.

### Workflow

```
[Seller sees comment in Facebook Live]
    ↓
[Clerk opens Claim Desk for the active lot]
    ↓
[Clerk enters buyer name / paddle + claim type: Primary | Backup]
    ↓
[Seller assigns or confirms the backup position in the queue]
    ↓
[System records Claim with seller-confirmed position]
    ↓
[Seller confirms or rejects primary]
    ↓
[Confirmed primary → Sale created; backup queue preserved]
    ↓
[If primary falls through → seller promotes first backup → new Sale]
```

### Constraints

- Claim entry is **manual**. No automated claim reading.
- A backup claim has a **position** (1st backup, 2nd backup, …). Position
  determines promotion order.
- **Position is seller-determined.** First entered in the system is not
  automatically the first commenter. The seller assigns or confirms the
  correct position. Entry order must not be used as a proxy for comment
  order without explicit seller confirmation (DR-8).
- Only the **seller** confirms ownership (DR-4). The system records the
  confirmation; it does not issue it.
- A Claim becomes a Sale only after seller confirmation. Until then it is
  a Claim record, not a Sale record (DR-1, DR-3).
- Backup Claims never appear in an Invoice (DR-2).
- The NIL/NEXT phrase from the comment may be stored as `phrase` on the
  Claim record for reference; it has no mechanical effect.

### Out of scope for this intake path

- Facebook API integration
- Comment scraping or monitoring
- Automated claim parsing
- Repost of sold/next/nil notices back to Facebook

---

## 2. Whatnot Manual Completed-Purchase Intake

### What it is

A seller-operated screen where the clerk manually enters completed purchases
from the Whatnot seller dashboard into ClerkBid. The source data exists in
Whatnot; the clerk reads it and enters each purchase by hand.

### Workflow

```
[Whatnot drop ends]
    ↓
[Seller opens completed-purchase data in Whatnot dashboard]
    ↓
[Clerk opens Whatnot Intake screen in ClerkBid]
    ↓
[Clerk manually enters each completed purchase record]
    ↓
[Each purchase → Sale record in ClerkBid under the active event]
    ↓
[Sales grouped into Buyer Bundles (Invoices) per buyer]
```

### Constraints

- **Intake is manual.** The clerk reads the Whatnot dashboard and enters
  each purchase by hand. No Whatnot API integration, no browser
  automation, no OAuth to Whatnot.
- **CSV import is not promised for MVP.** CSV import is a conditional
  feature blocked until: (a) a real redacted Whatnot livestream-report CSV
  has been inspected, and (b) an import-contract ADR has been accepted.
  No parser, field mapping, or import UI may be built before that ADR is
  approved. See `docs/audit/copilot-reuse-matrix.md §3.1` for the
  explicit blocker statement.
- Whatnot purchases enter as **confirmed Sales** directly (no Claim step;
  the platform has already confirmed purchase).
- The `channel` field on `AuctionEvent` is set to `whatnot` for these
  events, distinguishing them from Facebook events in reports and UI.
- Duplicate prevention: if a lot+buyer combination already has a Sale for
  this event, entry must reject the duplicate and surface it to the clerk
  (DR-3).

### Out of scope for this intake path

- Whatnot API or OAuth
- Whatnot browser automation
- Real-time Whatnot event monitoring
- Automatic Whatnot payout reconciliation
- Whatnot CSV import (conditional — blocked pending import-contract ADR)

---

## 3. Shared Buyer Bundle and Fulfillment Core

### Buyer Bundle = Invoice

The existing ClerkBid `Invoice` entity is the Buyer Bundle foundation
(confirmed in `docs/audit/mvp-extension-points.md §6`). After seller
confirmation (Facebook) or intake (Whatnot), all confirmed Sales for one
buyer within one event are grouped into a single Invoice via
`upsertInvoiceForBidder`.

### What the Bundle provides at MVP

| Requirement | ClerkBid field | MVP status |
|---|---|---|
| Groups confirmed sales per buyer | `sale.invoiceId` + `upsertInvoiceForBidder` | ✅ Use as-is |
| Itemised line list | `getSalesForInvoice` | ✅ Use as-is |
| Manual price adjustments | `manualLines` | ✅ Use as-is |
| Payment state | `status: paid / unpaid` | ✅ Use as-is |
| Payment method | `paymentMethod` | ✅ Use as-is |
| Stable cross-device identity | `syncKey` | ✅ Use as-is |
| Export and restore | `dataPorter.ts` | ✅ Use as-is |

### Fulfillment state — MVP scope

Fulfillment is a **separate operational state** from payment. A `fulfillmentStatus`
field on Invoice is **in scope** but deferred to PR-H. For the Founder Class
v0 pilot, sellers use the payment status (`paid` / `unpaid`) and manual notes
as a proxy for fulfillment tracking.

The following fulfillment operations are **not** in scope for v0:
- Shipping label generation
- Carrier integration
- Packing slip PDF
- Exception queue UI

### Auction-field suppression

The following Invoice/Sale fields exist in ClerkBid for traditional
auction houses and are not meaningful for Facebook/Whatnot sellers. They
must be **hidden or suppressed** in the Live Sale Clerk UI, not removed
from the schema:

- `buyersPremiumRate` — set to 0 by default; line hidden at 0
- `invoiceNumber` — retained for export; not prominently displayed
- Clerk initials — retained in Sale record; not prominent in Bundle view

Field suppression is a UI configuration decision per channel. The schema
is not modified.

---

## 4. MVP States and Exclusions

### In-scope states

| State | Description |
|---|---|
| `claim.primary` | Buyer's first-position claim; awaiting seller confirmation |
| `claim.backup` | Ordered backup position; seller-assigned; awaiting promotion |
| `claim.expired` | Backup window closed without promotion |
| `claim.canceled` | Seller or buyer canceled |
| `claim.promoted` | Was backup; promoted to primary (terminal for this Claim record) |
| `sale.confirmed` | Seller-confirmed owner; linked to Invoice |
| `invoice.unpaid` | Buyer Bundle created; payment not yet received |
| `invoice.paid` | Payment received; fulfillment may begin |

### Explicitly excluded states / features

| Excluded | Reason |
|---|---|
| Automated claim reading | DR-4: seller confirmation is authoritative; automation cannot confirm |
| Whatnot real-time sync | Out of scope; intake is manual |
| Whatnot CSV import | **Conditional** — blocked until real redacted Whatnot CSV inspected and import-contract ADR accepted (`copilot-reuse-matrix.md §3.1`) |
| PayPal / Venmo payment processing | Out of scope for v0 |
| AI claim parsing | Out of scope for v0 |
| Repost automation | Out of scope for v0 |
| Shipping labels | Out of scope for v0 |
| Cost basis / profit reporting | Out of scope for v0 |
| Cross-listing | Out of scope for v0 |
| Public signup | Out of scope for v0 |
| Storage / auth / sync rewrites | Out of scope; existing system used as-is |
| Complete inventory management | Out of scope for v0 |
| n8n as runtime dependency | Out of scope; n8n is not a system of record (DR-7) |

---

## 5. Founder-Class Success Criteria

The v0 pilot succeeds when **all** of the following are true for at least
one live Facebook sale event and one Whatnot intake event:

| # | Criterion | How verified |
|---|---|---|
| SC-1 | Every sold item has exactly one confirmed owner in ClerkBid | Zero duplicate `sale` rows for the same `(eventId, lotId)` pair |
| SC-2 | Backup queue is preserved in seller-assigned position order for every lot with multiple claims | Claim records exist with correct `position` values; seller-confirmed first backup promoted correctly when primary falls through |
| SC-3 | No backup Claim appears in any Invoice | Query `db.sales` — all rows have `invoiceId` only from confirmed-primary flow; no backup Claim has a Sale row |
| SC-4 | Every confirmed buyer has a Buyer Bundle (Invoice) grouping all their purchases | `upsertInvoiceForBidder` called after each confirmation; Invoice contains all expected Sale rows |
| SC-5 | Seller can export a complete operational record at any point during the sale | `dataPorter.ts` export completes without error; re-import restores full state |
| SC-6 | No cross-vendor data exposure | Vendor isolation tests pass (PR-02 gate; `test/vendor-isolation` branch) |
| SC-7 | Build and deployment succeed without modification to existing CI gates | All checks green on deploy |

---

## 6. Release Gates

No Founder Class v0 feature may be deployed to a pilot seller until **all**
of the following gates are cleared:

### Gate 1 — Security (must clear before any pilot access)

- [ ] Vendor isolation automated tests pass (`test/vendor-isolation` branch → PR-02)
- [ ] Unauthenticated, expired-session, and cross-vendor sync routes all return correct HTTP status with no data leak
- [ ] `migrate_admin_impersonation.sql` confirmed NOT applied to pilot database
- [ ] Public registration rate-limited or disabled for pilot

### Gate 2 — Data Integrity

- [ ] Ownership uniqueness invariant enforced at domain layer (rejects duplicate `(eventId, lotId)` confirmed owner)
- [ ] Backup Claims cannot create Sale rows or enter Invoices (automated test)
- [ ] Export → re-import round-trip preserves all Claim and Sale state

### Gate 3 — Build and Deploy

- [ ] `next build` succeeds with no errors
- [ ] `next-pwa` 5.6.0 produces clean service-worker build with Next.js 14
- [ ] CI pipeline passes (PR-02)
- [ ] Deployment to pilot environment succeeds

### Gate 4 — Legal

- [ ] `terms/` directory replaced with Live Sale Clerk legal copy (PR-03)
- [ ] MIT attribution for AuctionMethod fork present in product

### Gate 5 — Operational Readiness

- [ ] Founder can complete a full Facebook claim-sale workflow end-to-end in staging
- [ ] Founder can complete a Whatnot manual intake end-to-end in staging
- [ ] Buyer Bundle (Invoice) export is legible and complete
- [ ] Founder has performed at least one export and re-import test

---

## 7. Open ADRs — Items Requiring a Decision Record

The following design questions are **unresolved**. Each requires a separate
Architectural Decision Record (ADR) to be accepted before the relevant
implementation PR opens. No implementation may proceed on these items
based on this document alone.

| # | Question | Blocking PR | Default if undecided |
|---|---|---|---|
| ADR-1 | Claim sync strategy: op-log (`claim.put` / `claim.delete`) vs. snapshot-only | PR-E (`feat/claim-domain`) | Snapshot-only (lower risk; real-time lag accepted for MVP) |
| ADR-2 | `platformUsername` scope: per-event Bidder field vs. cross-event user-profile identity | PR-D (`feat/buyer-platform-identity`) | Per-event field on `Bidder` (additive, no index change) |
| ADR-3 | Supplemental invoice behavior: should `upsertInvoiceForBidder` create a new invoice when all prior invoices are paid, or accumulate into the existing paid invoice for live-sale Buyer Bundle continuity? | PR-G (`feat/buyer-bundle-presentation`) | Current behavior (new invoice on all-paid); revisit in PR-G scope review |
| ADR-4 | Fulfillment state shape: single `fulfillmentStatus` enum string vs. timestamp fields vs. structured `fulfillmentEvents` array | PR-H (`feat/fulfillment-state`) | Single `fulfillmentStatus` string (lowest migration complexity) |
| ADR-5 | Facebook Claim Desk: real-time op-log sync for Claims, or accept that Claims are device-local until next snapshot push | PR-F (`feat/facebook-claim-desk`) | Depends on ADR-1 resolution |
| ADR-6 | Auction-field suppression mechanism: per-channel UI config object vs. hidden CSS vs. schema-level `channelDefaults` | PR-G | Per-channel config object; no schema change |
| ADR-7 | `applyRemoteOp.ts` test coverage: add direct unit tests in PR-E, or defer to integration test suite? | PR-E | Add direct unit tests in PR-E (gap identified in `mvp-extension-points.md §10`) |
| ADR-8 | Whatnot import contract: inspect a real redacted Whatnot livestream-report CSV; define field mapping, encoding, deduplication key, and price convention before any parser or import UI is built | Blocks CSV import entirely | No CSV import until ADR accepted (see `copilot-reuse-matrix.md §3.1`) |

---

## Source Basis

This document was derived from:

- `docs/audit/executive-verdict.md` — Decision B (Vertical Fork), confidence, pilot timeline
- `docs/audit/domain-fit.md` — entity mapping, new fields, invariant gap table
- `docs/audit/reuse-matrix.md` — KEEP/ADAPT/WRAP/EXTRACT/REPLACE/REMOVE decisions
- `docs/audit/copilot-reuse-matrix.md` — Whatnot import contract blocker (§3.1), Facebook claim-sale gap (§6), buyer model (§7)
- `docs/audit/mvp-extension-points.md` — candidate extension points, entity designs, sync contracts
- `docs/audit/implementation-plan.md` — PR sequence and file ownership
- `docs/audit/open-questions.md` — blocking questions and resolution tracker
- `docs/audit/security-gaps.md` — veto risks and release gate inputs
- `AGENTS.md` — domain rules and stop conditions (this PR)
