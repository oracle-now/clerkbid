# Terminology Inventory — Live Sale Clerk · Founder Class v0

**Status:** Verified display-language reference
**Effective:** 2026-07-28
**Governed by:** `AGENTS.md` and `docs/MVP.md`

---

## 1. Status

This inventory authorizes **display-language planning only**. It does not authorize, and must not be used to justify, any schema rename, internal identifier rename, database migration, or code refactor. All changes governed by this document are restricted to visible UI strings, PDF labels, and user-facing copy.

This is a **verified but not exhaustive** inventory of currently observed display strings. Future-feature copy (Claim Desk, Whatnot Intake) is excluded. Payment methods are outside this document. Consignor hiding is deferred. Buyer's-premium behavior is unchanged.

---

## 2. Approved Mappings

The following table maps legacy/internal display terms to the approved Live Sale Clerk display language.

| Legacy / Internal Display Term | Approved Display Term |
|---|---|
| Event | Sale |
| Bidder | Buyer |
| Paddle number | Buyer code |
| Paddle #\<value\> | Buyer code: \<value\> |
| Lot | Item |
| Lot # | Item # |
| Hammer price | Sale price |
| Hammer subtotal | Items subtotal |
| Invoice | Buyer Bundle |
| Invoice # | Buyer Bundle # |
| Clerk initials | Seller initials |
| Auction clerking | Sale clerking |

---

## 3. Core Form Findings — lib/saleFormOrder.ts

Strings observed in the sale entry form.

| Location | Observed String | Approved Replacement | Notes |
|---|---|---|---|
| saleFormOrder.ts | Lot number | Item number | Form field label |
| saleFormOrder.ts | Hammer per unit | Sale price per item | Per-unit price label |
| saleFormOrder.ts | Paddle number | Buyer code | Field label |
| saleFormOrder.ts | Quantity | Quantity | Unchanged |
| saleFormOrder.ts | Lot description / title | Item description / title | Field label |
| saleFormOrder.ts | Lot notes / ring | Item notes | Field label |
| saleFormOrder.ts | Consignor | Consignor | Unchanged; hiding deferred |
| saleFormOrder.ts | Clerk initials | Seller initials | Metadata field label |

---

## 4. Page Findings — Protected Pages

Strings observed in full protected page views.

| Page | Observed String | Approved Replacement | Notes |
|---|---|---|---|
| events/page.tsx — heading | Events | Sales | Page title |
| bidders/page.tsx — heading | Bidders | Buyers | Page title |
| bidders/page.tsx — row | Paddle #\<value\> | Buyer code: \<value\> | Row cell display |
| lots/page.tsx — heading | Lots | Items | Page title |
| lots/page.tsx — column | Lot # | Item # | Column header |
| lots/page.tsx — consignor | Consignor | Consignor | Unchanged; hiding deferred |
| invoices/page.tsx — heading | Invoices | Buyer Bundles | Page title |
| invoices/page.tsx — row | Paddle #\<value\> | Buyer code: \<value\> | Row cell display |

---

## 5. Navigation and PDF Findings

Strings observed in navigation elements and PDF-rendered outputs.

| Location | Observed String | Approved Replacement | Notes |
|---|---|---|---|
| Sidebar.tsx — primary link | Events | Sales | Nav item label |
| Sidebar.tsx — primary link | Bidders | Buyers | Nav item label |
| Sidebar.tsx — primary link | Lots | Items | Nav item label |
| Sidebar.tsx — primary link | Invoices | Buyer Bundles | Nav item label |
| Sidebar.tsx — secondary link | Auction clerking | Sale clerking | Nav item label |
| invoicePdf.ts — document title | INVOICE | BUYER BUNDLE | PDF heading |
| invoicePdf.ts — document identifier | Invoice # | Buyer Bundle # | PDF sub-heading |
| invoicePdf.ts — event reference | Event | Sale | PDF metadata label |
| invoicePdf.ts — buyer reference | Paddle #\<value\> | Buyer code: \<value\> | Identifier display |
| invoicePdf.ts — line items | Lot # | Item # | Line item reference |
| invoicePdf.ts — totals | Hammer subtotal | Items subtotal | Totals section label |
| invoicePdf.ts — buyer's premium | Buyer's premium | Buyer's premium | Unchanged |
| app/layout.tsx — description | auction clerking | sale clerking | App metadata string |
| app/layout.tsx — title | ClerkBid | ClerkBid | Unchanged |

**Total verified rows (Sections 3 + 4 + 5): 30**

---

## 6. Deferred Behavior

The following items are explicitly deferred and must not be implemented as part of any display-language PR:

- **Consignor hiding** is deferred.
- **Buyer's-premium calculation** must not change.
- **Internal identifiers** are not renamed.
- **Payment methods** are a separate decision.
- **PDF heading fit** must be visually checked before shipping.

---

## 7. Internal Names Preserved

The following internal identifiers are **not renamed** under any circumstance. They remain as-is in source code, schema, database, and sync logic:

- `event`
- `bidder`
- `paddleNumber`
- `lot`
- `hammer`
- `invoice`
- `displayLotNumber`
