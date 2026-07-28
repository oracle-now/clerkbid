# Founder Class v0 — Manual Acceptance Scenarios

**Status:** Acceptance scenario document — not automated tests  
**Effective:** 2026-07-28  
**Governed by:** `AGENTS.md` DR-1 through DR-8; `docs/MVP.md`  
**Supersedes:** Nothing (first version)

> These scenarios are executed by a human tester against a running staging
> environment. They are not automated test cases. No code is implied by
> this document. Fixture data uses fictional buyers and items.

---

## Priority Legend

| Tag | Meaning |
|---|---|
| 🔴 LAUNCH BLOCKER | Pilot cannot ship until this scenario passes |
| 🟡 IMPORTANT | Must pass before wider rollout; not a hard pilot gate |
| 🔵 POST-MVP | Not required for Founder Class v0 |

---

## Fixture Data

All scenarios in this document use the following fictional data. No real
personal information is used.

### Facebook Event

| Field | Value |
|---|---|
| Event name | Maple Street Vintage — July Drop |
| Channel | `facebook` |
| Date | 2026-07-28 |

### Whatnot Event

| Field | Value |
|---|---|
| Event name | Maple Street Vintage — Whatnot Drop #3 |
| Channel | `whatnot` |
| Date | 2026-07-28 |

### Lots (shared across both events)

| Lot # | Description | Price |
|---|---|---|
| 101 | Vintage brass candlestick pair | $45.00 |
| 102 | 1970s macramé wall hanging | $28.00 |
| 103 | Hand-painted ceramic vase | $62.00 |
| 104 | Wicker basket set (3) | $18.00 |
| 105 | Amber glass lamp | $85.00 |

### Buyers

| Name / Username | Paddle | Platform |
|---|---|---|
| Dana Holloway | 7 | Facebook |
| Marcus Trent | 12 | Facebook |
| Priya Osei | 4 | Facebook |
| wn_shopperJade | — | Whatnot |
| wn_shopperJade99 | — | Whatnot (similar username; different buyer) |
| Roberto Fenn | — | Whatnot |

---

## Part A — Facebook Manual Claim Intake

---

### FB-01 · Primary Claimant — Happy Path

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-1, DR-3, DR-4, SC-1, SC-4; `docs/MVP.md §1`

**Fixture:** Lot 101 (Vintage brass candlestick pair, $45.00); buyer Dana Holloway (paddle 7)

**Given**
- The Facebook event "Maple Street Vintage — July Drop" is open and active.
- Lot 101 has no existing claims.
- The seller is watching the Facebook Live and Dana Holloway comments "Mine!"

**When**
1. The clerk opens the Claim Desk for Lot 101.
2. The clerk enters buyer name "Dana Holloway", paddle 7, claim type **Primary**.
3. The seller taps **Confirm** to confirm Dana as owner.

**Then**
- A Claim record for Dana / Lot 101 exists with `status: primary`.
- After seller confirmation, exactly one Sale record is created for Dana / Lot 101 / this event.
- The Sale record is linked to Dana's Invoice (Buyer Bundle) via `invoiceId`.
- Dana's Invoice appears in the Buyer Bundle view with Lot 101 as a line item.
- No duplicate Sale row exists for `(eventId, Lot 101)`. *(SC-1)*

---

### FB-02 · Ordered NIL/NEXT Backup Queue

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-1, DR-2, DR-8, SC-2, SC-3; `docs/MVP.md §1`

**Fixture:** Lot 102 (macramé wall hanging, $28.00); primary buyer Dana Holloway (paddle 7); backups Marcus Trent (paddle 12, position 1) and Priya Osei (paddle 4, position 2)

**Given**
- Lot 102 has no existing claims.
- Dana comments first; Marcus comments "NIL"; Priya comments "NEXT".
- The seller watched the comments and **verbally assigns** backup positions: Marcus = 1st backup, Priya = 2nd backup.

**When**
1. Clerk enters Dana Holloway as **Primary** for Lot 102.
2. Clerk enters Marcus Trent as **Backup, position 1** for Lot 102.
3. Clerk enters Priya Osei as **Backup, position 2** for Lot 102.
4. *(The seller has not yet confirmed the primary.)*

**Then**
- Three Claim records exist for Lot 102:
  - Dana: `status: primary`, `position: 0` (or equivalent primary marker)
  - Marcus: `status: backup`, `position: 1`
  - Priya: `status: backup`, `position: 2`
- **No Sale record exists** for Lot 102. *(DR-1)*
- **No Invoice line exists** for Marcus or Priya on Lot 102. *(DR-2)*
- The Backup Queue view for Lot 102 shows Marcus before Priya.
- Seller-assigned positions are stored as entered; the system did not reorder based on entry time. *(DR-8)*

---

### FB-03 · Seller Confirmation Is Required — System Does Not Auto-Confirm

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-4; `docs/MVP.md §1`

**Fixture:** Lot 103 (ceramic vase, $62.00); buyer Priya Osei (paddle 4)

**Given**
- The clerk has entered Priya Osei as Primary for Lot 103.
- The seller has **not yet tapped Confirm**.

**When**
- One minute passes with no seller action.
- The clerk navigates away from Lot 103 and returns.

**Then**
- Priya's Claim record is still `status: primary` (unconfirmed).
- **No Sale record exists** for Priya / Lot 103.
- **No Invoice** has been created or modified for Priya with a Lot 103 line.
- The Claim Desk still shows the Confirm button awaiting seller action.
- The system has not confirmed ownership automatically.

---

### FB-04 · Expired Primary — Backup Preserved

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-1, DR-2, DR-8, SC-2; `docs/MVP.md §4` (`claim.expired`)

**Fixture:** Lot 103 (ceramic vase, $62.00); primary Priya Osei (paddle 4); 1st backup Dana Holloway (paddle 7)

**Given**
- Lot 103 has: Priya as unconfirmed primary, Dana as backup position 1.
- The seller decides Priya's claim has expired (she did not respond or pay).

**When**
1. Seller marks Priya's primary claim as **Expired** (or presses an Expire / Release button).

**Then**
- Priya's Claim record updates to `status: expired`.
- **No Sale record was ever created** for Priya / Lot 103.
- **Priya's Invoice does not contain Lot 103.**
- Dana's backup Claim remains intact at `status: backup`, `position: 1`.
- The Backup Queue view still shows Dana as the next candidate.
- The Claim Desk prompts the seller to promote Dana or leave the lot open.

---

### FB-05 · Manual Promotion of First Backup to Primary

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-1, DR-2, DR-3, DR-4, DR-8, SC-2; `docs/MVP.md §4` (`claim.promoted`)

**Fixture:** Lot 103 continued from FB-04; Dana Holloway (paddle 7) is 1st backup

**Given**
- Priya's claim is `status: expired`.
- Dana is `status: backup`, `position: 1`.
- The seller decides to promote Dana.

**When**
1. Seller taps **Promote** on Dana's backup Claim.
2. Seller taps **Confirm** to confirm Dana as the new primary owner.

**Then**
- Dana's original backup Claim record updates to `status: promoted` (terminal).
- A new Claim record (or the promoted record) reflects Dana as confirmed primary.
- Exactly one Sale record is created for Dana / Lot 103 / this event.
- Dana's Invoice now contains Lot 103 as a line item.
- **No second Sale record exists** for Lot 103; Priya has no Sale row. *(DR-3)*
- If Lot 103 had a 2nd backup (e.g., another buyer at position 2), their Claim record is unchanged and still at `status: backup`.

---

### FB-06 · Promoted Buyer Enters Buyer Bundle — Unpromoted Backups Do Not

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-2, DR-5, SC-3, SC-4; `docs/MVP.md §3`

**Fixture:** Lot 104 (wicker basket set, $18.00); primary Marcus Trent (paddle 12) confirmed; backups: Priya Osei (position 1), Dana Holloway (position 2)

**Given**
- Marcus Trent is the seller-confirmed primary for Lot 104.
- A Sale record for Marcus / Lot 104 exists with `invoiceId` pointing to Marcus's Invoice.
- Priya and Dana are `status: backup` for Lot 104.

**When**
- Tester opens Marcus's Invoice (Buyer Bundle).
- Tester opens Priya's Invoice (Buyer Bundle).
- Tester opens Dana's Invoice (Buyer Bundle).

**Then**
- Marcus's Invoice contains Lot 104 as a confirmed Sale line. *(SC-4)*
- **Priya's Invoice does not contain Lot 104.** *(DR-2, SC-3)*
- **Dana's Invoice does not contain Lot 104.** *(DR-2, SC-3)*
- No `sale` row exists in the database linking Priya or Dana to Lot 104.
- The Buyer Bundle total for Marcus includes Lot 104's $18.00 price.
- The Buyer Bundle totals for Priya and Dana do not include Lot 104.

---

### FB-07 · First Entered ≠ First Commenter — Position Must Be Seller-Assigned

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-8; `docs/MVP.md §1`

**Fixture:** Lot 105 (amber glass lamp, $85.00); Marcus Trent as primary; seller verbally places Priya at backup position 1 and Dana at backup position 2, but clerk enters Dana first

**Given**
- The clerk enters Dana Holloway as **Backup** for Lot 105 first (due to notification order).
- The clerk then enters Priya Osei as **Backup** for Lot 105.
- The seller explicitly tells the clerk: "Priya is first backup, Dana is second."

**When**
1. Clerk sets Priya's backup position to **1**.
2. Clerk sets Dana's backup position to **2**.

**Then**
- The Backup Queue for Lot 105 shows: 1 — Priya Osei, 2 — Dana Holloway.
- System did not assign positions automatically based on entry order.
- Entry timestamp is not displayed as a position indicator.
- If the primary falls through, the Promote action targets Priya first, not Dana.

---

## Part B — Whatnot Manual Completed-Purchase Intake

---

### WN-01 · Manual Entry of a Single Completed Purchase

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-6, SC-1, SC-4; `docs/MVP.md §2`

**Fixture:** Whatnot event; buyer wn_shopperJade; Lot 101 ($45.00)

**Given**
- The Whatnot event "Maple Street Vintage — Whatnot Drop #3" is open.
- The drop has ended and the seller has the completed-purchase list open in the Whatnot seller dashboard.
- wn_shopperJade purchased Lot 101 for $45.00.

**When**
1. Clerk opens the Whatnot Intake screen in ClerkBid.
2. Clerk reads the dashboard and manually types: buyer username `wn_shopperJade`, lot 101, price $45.00.
3. Clerk submits the entry.

**Then**
- A Sale record is created for wn_shopperJade / Lot 101 / this event with `status: confirmed`.
- No Claim record is created. Whatnot purchases skip the Claim step. *(DR-6)*
- The Sale is immediately grouped into wn_shopperJade's Invoice (Buyer Bundle).
- The event's `channel` field reads `whatnot`.
- No Facebook-specific fields (claim type, backup position, phrase, NIL/NEXT) are visible or required on this screen.

---

### WN-02 · Multiple Purchases by One Buyer — All in One Buyer Bundle

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-5, SC-4; `docs/MVP.md §2–3`

**Fixture:** Whatnot event; buyer wn_shopperJade; Lot 101 ($45.00) and Lot 103 ($62.00)

**Given**
- wn_shopperJade purchased Lot 101 and Lot 103 in the same Whatnot drop.
- Lot 101 has already been entered (from WN-01).

**When**
1. Clerk enters: buyer `wn_shopperJade`, lot 103, price $62.00.
2. Clerk submits.

**Then**
- A second Sale record is created for wn_shopperJade / Lot 103 / this event.
- **Both Sale records share the same `invoiceId`** — they are grouped into one Invoice.
- wn_shopperJade's Buyer Bundle shows two line items: Lot 101 ($45.00) and Lot 103 ($62.00).
- Bundle subtotal is $107.00.
- No second Invoice is created for wn_shopperJade.

---

### WN-03 · Two Buyers with Similar Usernames — No Cross-Assignment

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-3, DR-5; `docs/MVP.md §2`

**Fixture:** Whatnot event; buyers `wn_shopperJade` and `wn_shopperJade99`; Lot 102 ($28.00) for `wn_shopperJade`; Lot 104 ($18.00) for `wn_shopperJade99`

**Given**
- The Whatnot dashboard shows two distinct buyers: `wn_shopperJade` (purchased Lot 102) and `wn_shopperJade99` (purchased Lot 104).

**When**
1. Clerk enters: buyer `wn_shopperJade`, lot 102, $28.00.
2. Clerk enters: buyer `wn_shopperJade99`, lot 104, $18.00.

**Then**
- Two distinct bidder/buyer records exist: one for `wn_shopperJade`, one for `wn_shopperJade99`.
- `wn_shopperJade`'s Invoice contains only Lot 102.
- `wn_shopperJade99`'s Invoice contains only Lot 104.
- **No cross-assignment occurred** — Lot 104 does not appear in `wn_shopperJade`'s bundle, and Lot 102 does not appear in `wn_shopperJade99`'s bundle.
- If the intake screen has a buyer name autocomplete or search, selecting `wn_shopperJade` does not pre-fill `wn_shopperJade99` and vice versa.

---

### WN-04 · Duplicate Purchase-Entry Prevention

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-3, SC-1; `docs/MVP.md §2`

**Fixture:** Whatnot event; buyer Roberto Fenn; Lot 105 ($85.00)

**Given**
- Roberto Fenn / Lot 105 has already been entered and a Sale record exists.

**When**
1. Clerk accidentally attempts to enter Roberto Fenn / Lot 105 / $85.00 a second time.

**Then**
- The system **rejects the duplicate entry** before creating a second Sale record.
- An error or warning is surfaced to the clerk identifying the duplicate `(buyer, lot)` combination.
- **No second Sale record is created** for Roberto Fenn / Lot 105.
- The existing Sale record is unchanged.
- The clerk can dismiss the warning and continue entering other purchases.

---

### WN-05 · No Facebook Claim Fields in the Whatnot Flow

**Priority:** 🟡 IMPORTANT  
**Covers:** DR-6; `docs/MVP.md §2`

**Fixture:** Whatnot event; any buyer; any lot

**Given**
- The tester is on the Whatnot Intake screen.

**When**
- Tester inspects every visible form field and UI element on the Whatnot Intake screen.

**Then**
- The following fields are **absent** from the Whatnot Intake screen:
  - Claim type (Primary / Backup)
  - Backup position number
  - NIL/NEXT phrase field
  - Backup queue display
  - Confirm / Expire / Promote buttons
- No Facebook-specific terminology appears in labels, placeholders, or help text.
- The Whatnot Intake screen contains only: buyer identifier, lot number, price, and submit.

---

## Part C — Shared Operations

---

### SH-01 · One Confirmed Owner Per Unique Item

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-3, SC-1; `docs/MVP.md §4`

**Fixture:** Facebook event; Lot 101; Dana Holloway already confirmed as primary owner (Sale record exists)

**Given**
- Dana Holloway is the confirmed owner of Lot 101 with a Sale record in the database.

**When**
1. Tester attempts to confirm a second buyer (Marcus Trent) as primary owner of Lot 101 in the same event, via any available UI path.

**Then**
- The system **rejects the second confirmation**.
- An error is surfaced to the clerk or seller: "Lot 101 already has a confirmed owner."
- **No second Sale record is created** for Lot 101.
- Dana Holloway's Sale record is unchanged.
- Marcus Trent's Claim record (if any) remains in backup or unconfirmed state.

---

### SH-02 · Payment State: Unpaid → Paid

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** DR-5, SC-4; `docs/MVP.md §3`

**Fixture:** Facebook event; Dana Holloway; Invoice containing Lot 101 ($45.00) and Lot 102 ($28.00); total $73.00; `status: unpaid`

**Given**
- Dana Holloway's Invoice exists with two confirmed Sale lines.
- Invoice `status` is `unpaid`.

**When**
1. Seller opens Dana's Buyer Bundle.
2. Seller records payment: method "Venmo", amount $73.00.
3. Seller marks the Invoice as **Paid**.

**Then**
- Invoice `status` updates to `paid`.
- `paymentMethod` is recorded as "Venmo".
- The Buyer Bundle view reflects the paid state (visual indicator or badge).
- The change persists after page refresh.
- No Sale records were modified; only the Invoice status changed.

---

### SH-03 · Fulfillment States: Ready to Pick → Packed → Complete

**Priority:** 🟡 IMPORTANT  
**Covers:** `docs/MVP.md §3` (fulfillment is a separate operational state from payment)  
**Note:** `fulfillmentStatus` field is deferred to PR-H. This scenario defines the target behaviour for when that feature ships. Do not execute against v0 staging until PR-H is merged.

**Fixture:** Dana Holloway's Invoice; `status: paid`; two Sale lines

**Given**
- Dana's Invoice is `paid`.
- `fulfillmentStatus` field exists on Invoice (post PR-H).

**When**
1. Seller opens Dana's Buyer Bundle.
2. Seller sets fulfillment status to **Ready to Pick**.
3. Seller physically pulls the items, then sets status to **Packed**.
4. Seller hands off the package and sets status to **Complete**.

**Then**
- `fulfillmentStatus` transitions: `null` → `ready_to_pick` → `packed` → `complete`.
- Each transition is visible in the Buyer Bundle view.
- Payment `status` (`paid`) is unchanged by fulfillment transitions.
- Fulfillment state is preserved after page refresh.
- No Sale records or Claim records are modified by fulfillment transitions.

---

### SH-04 · Missing-Item Exception

**Priority:** 🟡 IMPORTANT  
**Note:** Depends on fulfillment states from PR-H. Do not execute against v0 staging until PR-H is merged.

**Fixture:** Roberto Fenn's Whatnot Invoice; Lot 105 ($85.00); Invoice `paid`

**Given**
- Roberto Fenn's Invoice is `paid` with Lot 105 as a line item.
- When packing, the seller cannot locate Lot 105.

**When**
1. Seller opens Roberto's Buyer Bundle.
2. Seller marks Lot 105 (or the overall bundle) with fulfillment status **Exception**.
3. Seller adds a manual note: "Lamp not found — investigating."

**Then**
- `fulfillmentStatus` updates to `exception` (or equivalent).
- The manual note is saved to the Invoice record.
- Roberto's Buyer Bundle appears in an exception queue or is visually distinguished from packed bundles.
- Payment status remains `paid` — the exception does not revert payment.
- No Sale record is deleted or modified; the Sale for Lot 105 remains confirmed.

---

### SH-05 · Export and Restore Round-Trip

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** SC-5; `docs/MVP.md §5`

**Fixture:** Facebook event with at least: 3 confirmed Sales, 1 backup Claim, 1 expired Claim, 2 Invoices (one paid, one unpaid)

**Given**
- The Facebook event has data in the state described above.

**When**
1. Seller opens the Export screen and initiates a full export via `dataPorter.ts`.
2. Export file downloads to the seller's device.
3. Tester opens a clean staging environment (or clears local IndexedDB for the same account).
4. Tester imports the exported file.

**Then**
- All 3 confirmed Sale records are present with correct `invoiceId` values.
- The backup Claim record is present with `status: backup` and correct `position`.
- The expired Claim record is present with `status: expired`.
- Both Invoices are present with correct `status` (`paid` / `unpaid`).
- Buyer Bundle views show the same line items as before export.
- No additional or duplicate records were created during import.
- The seller can immediately resume working from the restored state.

---

### SH-06 · Offline Refresh and Recovery

**Priority:** 🟡 IMPORTANT  
**Covers:** `docs/MVP.md §3` (offline-first; Dexie local-first with cloud push/pull)

**Fixture:** Facebook event; mid-sale state with 2 confirmed Sales and 1 backup Claim

**Given**
- The seller's device has the event loaded and is actively clerking.
- The seller's device loses internet connectivity (e.g., tester switches to airplane mode).

**When**
1. While offline, the clerk enters one additional Claim for a new lot.
2. Clerk confirms the primary for that lot (seller taps Confirm).
3. Tester restores internet connectivity.
4. Tester waits for sync to complete (or triggers a manual sync if available).

**Then**
- While offline, all actions succeeded locally (Dexie IndexedDB).
- The new Claim and confirmed Sale are visible in the UI without internet.
- After reconnection, the new records sync to the cloud without data loss.
- No records entered offline were lost or duplicated after sync.
- The sync outbox is empty after successful sync.
- No error banners persist after successful reconnection and sync.

---

### SH-07 · Cross-Vendor Data Isolation

**Priority:** 🔴 LAUNCH BLOCKER  
**Covers:** SC-6; `docs/MVP.md §6` Gate 1

**Fixture:** Two distinct vendor accounts: Vendor A (Maple Street Vintage) and Vendor B (Riverdale Resale). Each has one event with Sale records.

**Given**
- Vendor A's event has Sales for Dana Holloway and Marcus Trent.
- Vendor B's event has Sales for Roberto Fenn.
- Tester is logged in as Vendor A.

**When**
1. Tester attempts to view or query Vendor B's events, buyers, Sales, or Invoices through any available UI path or direct URL manipulation.

**Then**
- Vendor A's session returns **no data belonging to Vendor B**.
- Direct URL access to Vendor B's resources returns an appropriate HTTP error (401 or 403) or an empty result — not Vendor B's data.
- No Vendor B buyer names, lot descriptions, Sale amounts, or Invoice totals are visible in Vendor A's session.
- Vendor A's export file contains only Vendor A's records.

---

## Scenario Index

| ID | Title | Priority |
|---|---|---|
| FB-01 | Primary claimant — happy path | 🔴 LAUNCH BLOCKER |
| FB-02 | Ordered NIL/NEXT backup queue | 🔴 LAUNCH BLOCKER |
| FB-03 | Seller confirmation is required — system does not auto-confirm | 🔴 LAUNCH BLOCKER |
| FB-04 | Expired primary — backup preserved | 🔴 LAUNCH BLOCKER |
| FB-05 | Manual promotion of first backup to primary | 🔴 LAUNCH BLOCKER |
| FB-06 | Promoted buyer enters Buyer Bundle — unpromoted backups do not | 🔴 LAUNCH BLOCKER |
| FB-07 | First entered ≠ first commenter — position must be seller-assigned | 🔴 LAUNCH BLOCKER |
| WN-01 | Manual entry of a single completed purchase | 🔴 LAUNCH BLOCKER |
| WN-02 | Multiple purchases by one buyer — all in one Buyer Bundle | 🔴 LAUNCH BLOCKER |
| WN-03 | Two buyers with similar usernames — no cross-assignment | 🔴 LAUNCH BLOCKER |
| WN-04 | Duplicate purchase-entry prevention | 🔴 LAUNCH BLOCKER |
| WN-05 | No Facebook claim fields in the Whatnot flow | 🟡 IMPORTANT |
| SH-01 | One confirmed owner per unique item | 🔴 LAUNCH BLOCKER |
| SH-02 | Payment state: unpaid → paid | 🔴 LAUNCH BLOCKER |
| SH-03 | Fulfillment states: ready to pick → packed → complete | 🟡 IMPORTANT (post PR-H) |
| SH-04 | Missing-item exception | 🟡 IMPORTANT (post PR-H) |
| SH-05 | Export and restore round-trip | 🔴 LAUNCH BLOCKER |
| SH-06 | Offline refresh and recovery | 🟡 IMPORTANT |
| SH-07 | Cross-vendor data isolation | 🔴 LAUNCH BLOCKER |

---

## Explicitly Out of Scope for These Scenarios

The following are **not tested here** and must not be added to this
document without a corresponding `docs/MVP.md` scope change:

- Whatnot CSV import (blocked pending ADR-8 and redacted CSV inspection)
- Facebook API, scraping, or comment automation
- PayPal or Venmo payment processing
- Shipping label generation
- n8n workflow integration
- Cost basis or profit reporting
- AI claim parsing
- Automated test harness (these are manual scenarios only)

---

## Source Basis

Derived from:

- `AGENTS.md` — DR-1 through DR-8
- `docs/MVP.md` — §1 Facebook intake, §2 Whatnot intake, §3 Bundle/Fulfillment, §4 States, §5 Success Criteria, §6 Release Gates
- `docs/audit/mvp-extension-points.md` — Claim entity design, ownership invariant
- `docs/audit/copilot-reuse-matrix.md` — §3.1 Whatnot import blocker, §6 Facebook claim-sale gap
