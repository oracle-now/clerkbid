# UX-1 Rehearsal Fixture — Seller Journey Shell

**Class:** Founder-Class UX-1 · **Budget:** 10 min · **Viewport:** 375 px  
**Purpose:** Verify a first-time seller navigates Set up → Sell → Pack without documentation.

---

## Test Data

### Sale
Facebook · **Tartan Goat Vintage — Flash Friday #12** · Status: Active

### Items (5)
1. Plaid wool blazer, size M — $28
2. Brass candlestick pair — $15
3. Ceramic owl figurine — $8
4. Leather belt, tan 34 — $12
5. Wicker fruit basket — $10

### Buyers & Claims

| Code | Name | Role |
|---|---|---|
| B-101 | Marta Zoltan | **Current** Claim on Item 1 |
| B-202 | Devon Ashby | **1st Waiting** on Item 1; confirmed purchases: Items 3 & 4 |
| B-303 | Priya Neel | **2nd Waiting** on Item 1 |

### Buyer Bundles

| Buyer | Pack-ready | Reason |
|---|---|---|
| B-202 Devon Ashby | ✅ Yes | Items 3 & 4 confirmed |
| B-101 Marta Zoltan | ❌ No | Claim still active |

---

## Script

For each step record: **pass/fail**, hesitation notes, wrong-turn notes.

### 1 · Select the Sale
- **Destination:** Sale list → tap Tartan Goat Vintage — Flash Friday #12
- **Understanding:** Seller identifies the active Sale
- **Pass:** Selected within 30 s without prompting

### 2 · Identify the Three Phases
- **Destination:** Sale workspace
- **Understanding:** Seller names Set up, Sell, Pack in order
- **Pass:** All three named unprompted within 10 s

### 3 · Reach Items
- **Destination:** Items list — 5 rows visible
- **Understanding:** Items are the things being sold
- **Pass:** Navigates without searching for "Lots"

### 4 · Reach Buyers
- **Destination:** Buyers list — 3 rows (B-101, B-202, B-303)
- **Understanding:** Buyers are the people bidding
- **Pass:** Navigates without searching for "Bidders"

### 5 · Reach Claim Desk
- **Destination:** Claim Desk — Item 1 shows Current + 1st Waiting + 2nd Waiting
- **Understanding:** Reads "Current" and "Waiting" without confusion
- **Pass:** Identifies Marta as Current, Devon and Priya as Waiting

### 6 · Reach Manual Purchase Entry
- **Destination:** Completed-purchase entry form
- **Understanding:** Used to record a sale that happened outside the app
- **Pass:** Locates entry point and states its purpose within 30 s

### 7 · Reach Buyer Bundles
- **Destination:** Bundles list — Devon's bundle ✅, Marta's bundle ❌
- **Understanding:** Distinguishes pack-ready from not-ready
- **Pass:** Identifies Devon Ashby's bundle as ready to pack

### 8 · Reach Packing Destination
- **Destination:** Devon Ashby's bundle detail (or states no destination is set)
- **Understanding:** Knows where the bundle ships or is picked up
- **Pass:** Reads correct destination or correctly reports none

### 9 · Return to Sale Workspace
- **Destination:** Sale workspace (same as Step 2)
- **Understanding:** Knows they are back at the top of this Sale
- **Pass:** Returns with ≤ 1 back-tap

### 10 · State the Next Action
- **Destination:** No navigation — verbal
- **Understanding:** Identifies a valid next action on Item 1
- **Pass:** States confirm Marta's sale or move up Devon within 10 s

---

## Success Criteria

- [ ] Seller identifies the active Sale
- [ ] Seller finds every core destination without documentation
- [ ] Seller never sees "Event," "Bidder," "Lot," or "Invoice" in UX-1 copy
- [ ] Seller explains Set up → Sell → Pack
- [ ] Seller locates next action within 10 s
- [ ] No horizontal scrolling at 375 px
