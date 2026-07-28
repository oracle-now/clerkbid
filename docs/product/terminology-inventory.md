# Terminology Inventory — Live Sale Clerk · Founder Class v0

**Status:** Authoritative display-language reference  
**Effective:** 2026-07-28  
**Governed by:** `AGENTS.md` and `docs/MVP.md`

---

## 1. Status

This inventory authorizes **display-language planning only**. It does not authorize, and must not be used to justify, any schema rename, internal identifier rename, database migration, or code refactor. All changes governed by this document are restricted to visible UI strings, PDF labels, and user-facing copy.

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

## 3. Core Form Findings (Pass 1)

Strings observed in core entry and confirmation forms.

| Location | Observed String | Approved Replacement | Notes |
|---|---|---|---|
| Claim Desk — lot header | Lot # | Item # | Label above lot number display |
| Claim Desk — lot header | Lot | Item | Section heading |
| Claim Desk — buyer field | Paddle number | Buyer code | Field label |
| Claim Desk — buyer field placeholder | Paddle #… | Buyer code:… | Inline placeholder |
| Claim Desk — event header | Event | Sale | Page/section heading |
| Sale confirmation dialog | Hammer price | Sale price | Confirmation summary line |
| Sale confirmation dialog | Bidder | Buyer | Confirmation summary label |
| Whatnot Intake screen — entry form | Lot # | Item # | Column / field label |
| Whatnot Intake screen — entry form | Bidder | Buyer | Field label |
| Whatnot Intake screen — entry form | Paddle number | Buyer code | Field label |
| Whatnot Intake screen — entry form | Event | Sale | Page heading |
| Invoice creation — line items | Hammer price | Sale price | Line item price label |
| Invoice creation — line items | Lot # | Item # | Line item lot reference |
| Invoice creation — totals | Hammer subtotal | Items subtotal | Subtotal row label |
| Invoice creation — header | Invoice # | Buyer Bundle # | Invoice identifier label |
| Invoice creation — header | Invoice | Buyer Bundle | Section heading |
| Invoice creation — metadata | Clerk initials | Seller initials | Metadata field label |
| Event selector / nav | Auction clerking | Sale clerking | Navigation label |

---

## 4. Page Findings (Pass 2)

Strings observed in full page views (list pages, detail pages, settings).

| Page | Observed String | Approved Replacement | Notes |
|---|---|---|---|
| Events list page — heading | Events | Sales | Page title |
| Events list page — column | Event | Sale | Table column header |
| Events list page — row | Bidder | Buyer | Linked entity label |
| Event detail page — heading | Event | Sale | Page heading |
| Event detail page — buyer reference | Bidder | Buyer | Section label |
| Event detail page — buyer reference | Paddle number | Buyer code | Field label |
| Buyer list page — heading | Bidders | Buyers | Page title |
| Buyer list page — column | Paddle number | Buyer code | Column header |
| Buyer list page — row | Paddle #\<value\> | Buyer code: \<value\> | Row cell display |
| Buyer detail page — heading | Bidder | Buyer | Page heading |
| Buyer detail page — identifier | Paddle number | Buyer code | Field label |
| Lot list page — heading | Lots | Items | Page title |
| Lot list page — column | Lot # | Item # | Column header |
| Lot detail page — heading | Lot | Item | Page heading |
| Lot detail page — price field | Hammer price | Sale price | Field label |
| Invoice list page — heading | Invoices | Buyer Bundles | Page title |
| Invoice list page — column | Invoice # | Buyer Bundle # | Column header |
| Invoice detail page — heading | Invoice | Buyer Bundle | Page heading |
| Invoice detail page — identifier | Invoice # | Buyer Bundle # | Field label |
| Invoice detail page — totals | Hammer subtotal | Items subtotal | Subtotal row |
| Invoice detail page — metadata | Clerk initials | Seller initials | Metadata label |
| Settings / config page | Auction clerking | Sale clerking | Page or section label |

---

## 5. Navigation and PDF Findings (Pass 3)

Strings observed in navigation elements and PDF-rendered outputs.

| Location | Observed String | Approved Replacement | Notes |
|---|---|---|---|
| Sidebar / nav — primary link | Events | Sales | Nav item label |
| Sidebar / nav — primary link | Bidders | Buyers | Nav item label |
| Sidebar / nav — primary link | Lots | Items | Nav item label |
| Sidebar / nav — primary link | Invoices | Buyer Bundles | Nav item label |
| Sidebar / nav — secondary link | Auction clerking | Sale clerking | Nav item label |
| PDF — document title / heading | Invoice | Buyer Bundle | PDF heading (fit must be visually checked) |
| PDF — document identifier | Invoice # | Buyer Bundle # | PDF sub-heading |
| PDF — buyer reference | Bidder | Buyer | Buyer name section label |
| PDF — buyer reference | Paddle number | Buyer code | Identifier label |
| PDF — line items | Lot # | Item # | Line item reference |
| PDF — line items | Hammer price | Sale price | Per-line price label |
| PDF — totals | Hammer subtotal | Items subtotal | Totals section label |
| PDF — metadata | Clerk initials | Seller initials | Footer / metadata label |
| Page \<title\> / browser tab | Event | Sale | Browser tab text |
| Page \<title\> / browser tab | Bidder / Bidders | Buyer / Buyers | Browser tab text |
| Page \<title\> / browser tab | Invoice | Buyer Bundle | Browser tab text |

---

## 6. Deferred Behavior

The following items are explicitly deferred and must not be implemented as part of any display-language PR:

- **Consignor hiding** is deferred.
- **Buyer's-premium calculation** must not change.
- **Internal identifiers** are not renamed.
- **Payment methods** are a separate decision.
- **PDF heading fit** must be visually checked before shipping.
- **Whatnot CSV language** is outside this PR.

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
