# Whatnot Import Evidence Kit

> **RESEARCH AND REPOSITORY INSPECTION ONLY**
> Import implementation is not authorized.
> See [AGENTS.md](../../AGENTS.md) and [docs/audit/copilot-reuse-matrix.md §3.1](../audit/copilot-reuse-matrix.md).

---

## Status

| Item | Value |
|---|---|
| Document type | Research — no code authorized |
| Implementation status | **NOT AUTHORIZED** |
| Base SHA | `e79d74bd4192b5658a28bc39f4cc5c781428eed6` |
| Branch | `audit/whatnot-import-discovery` |
| Real seller exports required | **Yes — no implementation may begin without them** |
| Audit date | 2026-07-28 |

---

## Verified Repository Facts

All rows below are VERIFIED against the actual source files cited.

| Area | Verified finding | Source path |
|---|---|---|
| CSV parse core | `parseCsvTable` + `normalizeHeaderKey` handle comma-delimited input, strip punctuation from header keys, and return typed `{headers, rows}` | `lib/services/csvParse.ts` |
| Lot import | `parseLotCsv` parses lot number, suffix, description, consignor, quantity, notes; enforces required columns; deduplicates `displayLotNumber` in-file via `Set`; emits typed `LotCsvImportIssue` per bad row | `lib/services/csvImportLots.ts` |
| Bidder import | `parseBidderCsv` parses paddle, firstName, lastName, email, phone; rejects duplicate paddles within the file | `lib/services/csvImportBidders.ts` |
| CSV export | `buildAccountingCsvString` produces UTF-8 comma-delimited accounting export; `rowsToCsv` is the shared serializer | `lib/services/accountingCsv.ts`, `lib/services/csvExporter.ts` |
| Money convention | All monetary values stored as **float dollars** (not cents); `roundMoney(n) = Math.round(n * 100) / 100`; rates in (1, 100] divided by 100 at boundary | `lib/services/invoiceLogic.ts` |
| Invoice / Buyer Bundle | `Invoice` groups all `Sale` rows for one `bidderId` per `eventId`; `upsertInvoiceForBidder` is atomic (Dexie transaction over `events`, `sales`, `invoices`); unpaid invoice absorbs unallocated lines; paid invoices are never mutated | `lib/services/invoiceLogic.ts` |
| Sale entity | `Sale` fields: `eventId`, `lotId`, `bidderId`, `displayLotNumber`, `paddleNumber`, `description`, `consignor?`, `consignorId?`, `quantity`, `amount`, `clerkInitials`, `createdAt`, `invoiceId?` | `lib/services/claimService.ts` (newSaleRow) |
| Bidder / buyer entity | `Bidder` identified by numeric `paddleNumber` (required); optional `email`, `phone`; no `platformType` or `platformUsername` field today | `lib/services/csvImportBidders.ts`, `lib/services/invoiceLogic.ts` |
| Claim domain | `Claim` is Facebook-specific; statuses: primary → confirmed (→ Sale) or canceled/expired; backup → promoted → confirmed; `confirmClaim` is the **only** path creating a Sale; `claimService.ts` never touches Whatnot data | `lib/services/claimService.ts`, `types/claim.ts` |
| Claim-domain rule DR-6 | "Facebook and Whatnot use separate intake workflows. They share the downstream Buyer Bundle and fulfillment core but have distinct pre-confirmation paths." Whatnot completed results are **not** Facebook claims. | `AGENTS.md` |
| Duplicate handling | In-file: `Set`-based deduplication in all three CSV parsers. Cross-import: no global dedup key exists for Whatnot rows today — **no `sourceRecordId` or `platformType` field on Sale or Bidder** | `lib/services/csvImportLots.ts`, `csvImportBidders.ts` |
| Transaction/rollback | Dexie `db.transaction("rw", [...tables], async () => {...})` wraps Sale creation, Claim update, and Invoice upsert atomically; rollback is automatic on thrown error | `lib/services/claimService.ts` (confirmClaim) |
| Import preview/error UI | Row-level `LotCsvImportIssue` and `BidderCsvImportIssue` surface to the caller; each issue carries `rowIndex` and `message`; UI layer (not verified in this pass) is responsible for display | `lib/services/csvImportLots.ts`, `csvImportBidders.ts` |
| DataPorter / export version | `EXPORT_VERSION = 7`; `buildEventExport` and `parseEventExportPayload` handle claims v1–v7; export includes `claims` array; import remaps bidder/lot/sale IDs | `lib/services/dataPorter.ts` (commit history — not re-read in recovery pass) |
| Copilot reuse audit | `parser.py`, `group_buyers`, `_parse_price_to_cents`, `_make_buyer_key` are all **CANDIDATE FOR SELECTIVE PORT** but blocked pending import contract; bundle detection is **RESEARCH ONLY, NOT AUTHORITATIVE** | `docs/audit/copilot-reuse-matrix.md §2.1, §3.1–3.5` |
| Whatnot CSV import gate | AGENTS.md explicitly lists "Whatnot CSV import" as **out of scope for Founder Class v0** conditional on: no real redacted CSV inspected and no import-contract ADR accepted | `AGENTS.md` (Do Not Build for MVP) |

---

## Hypotheses

> HYPOTHESIS — none of these are accepted architecture. Each requires real export files and an ADR before implementation.

- **H-1 · Sale reuse.** A completed Whatnot auction row could map to a `Sale` record under a synthetic `AuctionEvent` without requiring a new top-level aggregate. Whatnot's "hammer" equivalent (final price) would map to `Sale.amount`; the item title to `Sale.description`; qty to `Sale.quantity`. _Unverified: Whatnot's granularity (order vs. line item) is unknown._

- **H-2 · Invoice / Buyer Bundle reuse.** `upsertInvoiceForBidder` could group Whatnot sales per buyer once a `bidderId` is resolved. No new aggregate is required if the existing Invoice ↔ Sale relationship covers the use case. _Unverified: whether Whatnot already groups by shipment in its export._

- **H-3 · Bidder extension.** The existing `Bidder` entity could be extended with optional `platformType` and `platformUsername` fields to carry Whatnot buyer identity without a new aggregate, per the buyer model recommendation in the reuse matrix. _Unverified: requires a schema ADR._

- **H-4 · No Claim required for Whatnot results.** DR-6 separates intake workflows. A completed Whatnot auction result is already confirmed by the platform; it does not enter the Facebook Claim lifecycle. A Whatnot import would write Sales directly (bypassing `confirmClaim`), subject to a yet-to-be-defined authorization path. _Unverified: whether any exception or refund scenario would require a Claim-like state._

- **H-5 · Source-record deduplication via `syncKey`.** A stable Whatnot order/line identifier from the export could be stored in a new optional field (e.g., `sourceRecordId` on `Sale`) to prevent repeat-import duplicates. The existing `syncKey` UUID is for sync, not external-source identity. _Unverified: whether Whatnot exports a stable row identifier at all._

- **H-6 · Money parsing at import boundary.** `_parse_price_to_cents` from the Copilot parser (or a TypeScript equivalent) could strip currency symbols and convert strings to float dollars at the CSV parse boundary before `roundMoney()` is applied. _Unverified: actual format of price strings in Whatnot exports._

---

## Unknowns

> UNKNOWN UNTIL REAL SELLER EXPORTS ARRIVE

| # | Unknown |
|---|---|
| U-1 | Column names, count, and order in a Whatnot livestream-results export |
| U-2 | Delimiter (comma, tab, semicolon) and character encoding (UTF-8, UTF-8-BOM, Latin-1) |
| U-3 | Granularity: one row per order, one row per line item, or both in separate exports |
| U-4 | Whether a stable order ID and/or line ID exist as exportable columns |
| U-5 | Buyer identity fields available in the export (username, display name, email, address, or none) |
| U-6 | Whether shipment grouping is explicit in the file or must be inferred |
| U-7 | How cancellations and refunds appear (separate rows, status column, negative amounts, absent) |
| U-8 | Whether fees (platform fee, shipping fee, payout) are present and at what granularity |
| U-9 | Whether giveaways appear in the export and how they are flagged |
| U-10 | How quantity > 1 is represented (repeated rows, a qty column, or both) |
| U-11 | Timezone of timestamp columns and whether UTC offset is embedded |
| U-12 | How seller-assigned SKUs or item numbers appear, if at all |
| U-13 | Whether the export is paginated / multi-file for large shows |
| U-14 | Whether Whatnot's export UI produces different files for different date ranges or categories |
| U-15 | Whether duplicate item names (same title, different items) are distinguishable by any column |

---

## Seller Sample Request

We are requesting **3–5 consenting Whatnot sellers** to provide redacted export files for research purposes only. No data will be committed to the public repository.

### What to export

1. Log in to your Whatnot seller dashboard.
2. Locate the results or orders export for a completed livestream show.
3. Export at least one complete show. Multiple shows at different date ranges are helpful.
4. Take a screenshot of the export screen before downloading (showing the UI, not your data).

### What to tell us

- Export date range (e.g., "June 2026 show")
- Category (e.g., trading cards, vintage clothing, collectibles)
- Approximate number of items sold in the show
- Any unusual rows you noticed: cancellations, refunds, giveaways, bundled shipments, items with quantity > 1, items with a seller SKU or item number

### Examples to seek, if your show contained them

> Do not fabricate rows. Only include what your actual export contains.

- Ordinary sold items
- Two items with identical names sold to different buyers
- An item with quantity greater than one
- A cancelled order
- A refund or price adjustment
- A giveaway (if it appears in the export at all)
- Items grouped into one shipment (bundled)
- A seller-assigned SKU or item number column
- Fee or payout columns
- Shipment status column

---

## Redaction Guide

Before sending your export file, apply these redactions. Use a plain text editor or spreadsheet app.

**Preserve (do not change):**
- All column headers and their order
- Data types (numbers stay numbers, dates stay dates)
- Prices, fees, quantities, and statuses
- Timestamps and timezone indicators
- Relationships between anonymized IDs (if buyer ID `12345` appears on three rows, keep the same fake ID `99001` on all three rows)

**Replace consistently:**
- Buyer display names → `Buyer_A`, `Buyer_B`, … (same fake name every time the real name appears)
- Seller username → `Seller_Research_1`
- Whatnot usernames → `user_a`, `user_b`, …

**Remove entirely (replace with blank cell or placeholder):**
- Shipping addresses and ZIP codes
- Email addresses
- Phone numbers
- Tracking numbers and carrier references
- Any field containing a full legal name not already replaced above

**Do not provide:**
- Login credentials, session tokens, or cookies
- Account passwords or API keys
- Screenshots of your account settings, payment details, or private messages

---

## Intake Checklist

For each file received from a consenting seller:

- [ ] Confirm the seller provided written consent for this specific research use
- [ ] Confirm the file is redacted per the Redaction Guide above
- [ ] Verify no real names, emails, addresses, or tracking numbers remain (spot-check 10 random rows)
- [ ] Record the seller's stated show category and approximate show size
- [ ] Record the export date range
- [ ] Store the file in a **private, non-public location** (do not commit to this repository)
- [ ] Log receipt: seller pseudonym, file hash, date received, show category, row count
- [ ] Share only the log entry (not the file) in the implementation ADR
- [ ] After the research phase, confirm with the seller before retaining the file longer than needed

> ⚠️ **Raw seller files must never be committed to this repository, public or private branch.**

---

## Import Contract Questions

These decisions cannot be made until real export files are inspected. Each is a gate item for the implementation ADR.

| # | Question | Why it matters |
|---|---|---|
| C-1 | Delimiter and character encoding | Parser configuration; UTF-8-BOM requires stripping |
| C-2 | Order vs. line-item granularity | Determines whether one CSV row = one `Sale` or one row = one order containing multiple items |
| C-3 | Required vs. optional columns | Which columns must be present for a row to be importable at all |
| C-4 | Source record identity | Is there a stable per-row ID usable as a deduplication key? |
| C-5 | Deduplication strategy | How to detect and reject a row already imported (repeat import of the same show) |
| C-6 | Repeat import behavior | Should re-importing the same file be a no-op, an error, or offer a diff/merge? |
| C-7 | Buyer matching | How to match a Whatnot buyer to an existing `Bidder` (by username, name, email, or always create new)? |
| C-8 | Item matching | Should imported items be linked to existing `Lot` records, or always create standalone `Sale` records? |
| C-9 | Unmatched rows | What happens to rows whose buyer or item cannot be matched (reject, queue for manual resolution, import as unlinked)? |
| C-10 | Cancellations and refunds | Are they present as negative amounts, status flags, or separate rows? How should they affect existing Sales/Invoices? |
| C-11 | Fees and payout | Are platform fees in the file? At order or line level? Should they create `InvoiceManualLine` entries? |
| C-12 | Quantity representation | Single column, repeated rows, or both? |
| C-13 | Timestamps and timezone | Are timestamps UTC, local, or platform-local? How to normalize for `Sale.createdAt`? |
| C-14 | CSV injection defense | Do any cells begin with `=`, `+`, `-`, or `@`? Parser must sanitize before display. |
| C-15 | Preview UX | What does the seller see before committing? Row-level match confidence? Error list? |
| C-16 | Rollback / undo | After committing, can the import be reversed? What is the unit of rollback (whole import, single sale)? |
| C-17 | Partial failure | If row 47 of 200 fails validation, do rows 1–46 commit or does the entire import roll back? |
| C-18 | Raw file retention and deletion | After import, should the original file be stored, hashed, or discarded? What is the privacy obligation? |

---

## Proposed User Flow

> PROPOSED — not implemented, not authorized. Described for future ADR scoping only.

1. **Select export.** Seller uploads or drops a Whatnot export file. File is parsed client-side only; no bytes leave the device at this stage.
2. **Preview parsed rows.** App displays a table of parsed rows with column mapping, row count, and any parse errors or warnings.
3. **Show matches and exceptions.** Each row shows: matched/unmatched buyer, matched/unmatched item (if applicable), and any flagged status (cancellation, refund, zero-price giveaway). Unresolvable rows are listed separately.
4. **Seller confirms.** Seller reviews the summary, resolves or skips exceptions, and explicitly confirms the import. No data is written before this step.
5. **Commit locally.** Import writes `Sale` records (and optionally `Bidder` records) inside a single Dexie transaction. Invoice upsert follows via `upsertInvoiceForBidder`.
6. **Allow safe recovery or undo.** The committed import is visible in the Buyer Bundle / Invoice view immediately. A clearly labelled undo action is available until the invoice is marked paid or exported.

---

## Implementation Gate

Import implementation **may not begin** until all of the following conditions are met:

- [ ] At least **three** usable, redacted, independently sourced Whatnot export files have been received and logged
- [ ] The column schema has been compared across all three files and a stable common subset identified
- [ ] A deduplication identity (stable source record key) has been confirmed present in the export
- [ ] Money parsing behavior (currency symbol stripping, decimal separator, float-dollar conversion) is confirmed and tested
- [ ] Buyer matching strategy is defined and approved by the seller/operator stakeholder
- [ ] Fixture files used in tests are safely anonymized per the Redaction Guide and stored outside the public repo
- [ ] An ADR (or equivalent accepted import contract document) exists and is linked from `AGENTS.md`
- [ ] The implementation PR scope declaration is compliant with `AGENTS.md`

---

## Verdict

**NO-CODE UNTIL REAL EXPORTS ARE INSPECTED**

- **Whatnot's export column schema is entirely unknown.** No column names, delimiter, encoding, granularity, or stable ID have been observed in a real file. Every implementation decision depends on this.
- **No deduplication key exists.** Neither `Sale` nor `Bidder` carries a `sourceRecordId` or `platformType` field today. Importing without a dedup key risks silent duplication on repeat runs.
- **Buyer matching is unresolved.** Whatnot buyers are identified by username, not paddle number. The current `Bidder` model has no platform identity field. Whether to match, create, or prompt is undefined.
- **The Claim domain does not apply.** Completed Whatnot results are not Facebook claims (DR-6). A Whatnot import must write Sales directly through a new, not-yet-authorized path that bypasses `confirmClaim`.
- **AGENTS.md explicitly blocks this feature** until a real redacted CSV is inspected and an import-contract ADR is accepted. No amount of repository analysis can substitute for actual seller export files.

---

*This file is research output only. It authorizes nothing. Reviewed against `AGENTS.md`, `docs/audit/copilot-reuse-matrix.md`, `lib/services/claimService.ts`, `lib/services/invoiceLogic.ts`, `lib/services/csvImportLots.ts`, `lib/services/csvImportBidders.ts`, `lib/services/accountingCsv.ts`, `types/claim.ts`, and `lib/services/csvImport.test.ts`.*
