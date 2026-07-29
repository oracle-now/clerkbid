# UX-1 Evidence Protocol — Seller Workspace Navigation

**Class:** Founder-Class UX-1 · **Budget:** 15 min · **Viewport:** 375 px  
**Purpose:** Measure whether a first-time seller can navigate the three workspace areas
(Set up / Sell / Buyer Bundles) and resume after interruption without documentation.

> **Implementation not authorized.** This document is a study protocol only.

---

## Evidence model

### Recognition over recall

The workspace exposes Sale context and operational destinations so the seller does not
need to remember legacy page names. Labels should carry enough meaning that a first-time
seller can identify the correct route by reading, not by prior knowledge.

### Information scent

Explicit labels should let sellers predict the correct destination before clicking.
A destination that requires exploration to verify its contents has weak scent.

### Choice grouping

Actions are grouped by seller goal rather than shown as one flat set of equally weighted
routes. Grouping reduces the number of competing targets a seller must evaluate per step.

### Interruption recovery

The selected Sale and a stable workspace route should help the seller return to the
correct context after a distraction. Recovery speed reflects orientation clarity, not
pure memory.

---

## Test data

Use fictional data only. Do not record real buyer names, item details, prices,
addresses, credentials, or claim phrases in results.

**Sale:** Facebook · Tartan Goat Vintage — Flash Friday #12 · Status: Active

**Items (5):** plaid blazer · brass candlesticks · ceramic owl · leather belt · wicker basket

**Buyers:**

| Code | Role |
|---|---|
| B-101 | Current Claim on Item 1 |
| B-202 | 1st Waiting on Item 1; two confirmed purchases |
| B-303 | 2nd Waiting on Item 1 |

---

## Tasks

For each task record: first click, completion, time, hesitation (>3 s), wrong destination,
backtrack, help request, terminology confusion, resumption time, and what the seller
stated they expected before clicking.

| # | Task | Destination | Pass condition |
|---|---|---|---|
| 1 | Choose or create a Sale | Sale list | Selects Tartan Goat without prompting |
| 2 | Identify the selected Sale | Workspace header | Names the active Sale within 10 s |
| 3 | Find Items | Items area | Reaches without searching for "Lots" |
| 4 | Find Buyers | Buyers area | Reaches without searching for "Bidders" |
| 5 | Find Facebook claims | Claim Desk | Reaches and reads Current + Waiting without confusion |
| 6 | Find completed-purchase entry | Purchase entry form | Locates and states its purpose within 30 s |
| 7 | Find Buyer Bundles | Bundles list | Reaches without confusion |
| 8 | Return to workspace | Sale workspace | Returns with ≤ 1 back-tap |
| 9 | Resume after short neutral interruption (60 s break) | First correct action post-return | First action correct; resumption time recorded |
| 10 | Explain each of the three areas | Verbal | Names Set up, Sell, and Buyer Bundles and states each area's purpose |

> Do not interpret hesitation alone as failure. Hesitation with a correct destination
> is an information-scent signal, not an error.

---

## Measurement formulas

All formulas apply to destination-navigation tasks (Tasks 1–8, 10).

### First-click accuracy
`correct first destination choices / destination tasks`

### Destination time
`time of correct destination click − time workspace became ready`

### Wrong-turn rate
`tasks containing an incorrect destination / destination tasks`

### Unassisted completion
`tasks completed without help / attempted tasks`

### Backtrack rate
`sessions containing an unexplained rapid return / workspace sessions`

A rapid return is a study heuristic for potential confusion, not a proven navigation error.

### Resumption time
`first correct action after return − time of return`

### UX-1 evidence score

```
score = 0.35 × completion
      + 0.25 × unassisted_completion
      + 0.20 × first_click_accuracy
      − 0.10 × normalized_task_time
      − 0.10 × normalized_wrong_turn_rate
```

- This is a project decision score, not a universal law.
- Raw metrics must always be reported alongside it.
- A serious ownership or data-integrity error cannot be averaged away by score.

---

## Initial MVP thresholds

These are hypotheses to refine after Founder testing, not acceptance gates.

- 100 % of sellers can identify the selected Sale
- ≥ 80 % first-click accuracy
- ≥ 80 % unassisted task completion
- Median destination time < 10 s
- ≤ 1 wrong destination per full rehearsal
- Median interruption resumption time < 10 s
- Zero new-copy uses of Event, Bidder, Lot, Invoice, or Clerking
- Zero data mutations caused by workspace navigation

---

## Mobile check (375 px)

Verify at approximately 375 px viewport width:

- [ ] No horizontal overflow
- [ ] Current Sale is visible without scrolling
- [ ] All three areas (Set up, Sell, Buyer Bundles) are visible
- [ ] All operational links are reachable by tap
- [ ] Tap targets are comfortably sized
- [ ] Focus indicator is visible
- [ ] No desktop sidebar is required for any task

---

## Privacy

- Use fictional test data only.
- Do not record buyer names, item descriptions, prices, addresses, credentials,
  or claim phrases in results.
- Do not add telemetry implementation to this document.

---

## Success criteria

- [ ] Sellers reach every core destination without documentation
- [ ] No new-copy appearance of Event, Bidder, Lot, Invoice, or Clerking
- [ ] Sellers can explain all three workspace areas
- [ ] Resumption after interruption meets threshold
- [ ] No horizontal overflow at 375 px
- [ ] No data mutation from navigation
