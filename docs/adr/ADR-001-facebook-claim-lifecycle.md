# ADR-001 — Facebook Claim Lifecycle

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-28 |
| **Revised** | 2026-07-28 (rev 2) |
| **Deciders** | Jacquelyn (founder) |
| **Governed by** | `AGENTS.md` DR-1 through DR-8 |
| **Blocking PRs** | PR-E (`feat/claim-domain`), PR-F (`feat/facebook-claim-desk`) |
| **Related ADRs** | Partially addresses ADR-1 and ADR-5 from `docs/MVP.md §7` |

---

## 1. Context

During a Facebook live-sale event the seller (or one assistant) operates
the Claim Desk. Buyers comment on the video — “Sold”, “NIL”, “NEXT”, or a
bid phrase — and the clerk enters each comment as a Claim record. Multiple
bidders may compete for the same item; only one may be confirmed as the
owner. Backups must be preserved in ordered queue.

**Current state of Claims in the codebase:** Claim records do not yet
exist in any Dexie store, schema, or export/import path. The Claim
interface, Dexie table, and all persistence and export/import support are
new work to be introduced in PR-E (`feat/claim-domain`). Nothing in this
ADR assumes Claims are already persisted or synced.

This ADR records the authoritative lifecycle rules for Claims in the
Facebook intake path. It governs how Claim records are created, advanced,
and resolved, and when (and only when) a Sale record may be created from
them. Rules here are invariants — not guidelines.

---

## 2. Decision

### 2.1 A backup or NIL Claim is a Claim, never a Sale

> **Invariant (DR-1).** A Claim with `type === "backup"` or whose
> originating phrase is a NIL/NEXT variant is a Claim record and nothing
> more. It never produces a Sale record, regardless of its position in
> the queue or the passage of time.

Rationale: the seller has not confirmed this buyer as the owner of the
item. Creating a Sale before confirmation would violate DR-3 (at most one
confirmed owner per item per sale event) and DR-4 (seller confirmation is
authoritative).

### 2.2 Backup Claims never enter Buyer Bundles

> **Invariant (DR-2).** No backup Claim may have a `saleId` assigned
> to it and no Sale derived from a backup Claim (prior to promotion and
> confirmation) may appear in any Invoice (Buyer Bundle).

A backup Claim that is later promoted to primary (§2.5) does not
retroactively insert a Sale into a Buyer Bundle. A new, independent
Sale record is created at confirmation time after promotion. The prior
backup Claim record is set to `status: "promoted"` and remains a
historical record only.

### 2.3 Seller confirmation is authoritative

> **Invariant (DR-4).** No code path — including workflow automation,
> background job, timer, or AI agent — may set a Claim to confirmed or
> create a Sale on the seller’s behalf.

The system records the seller’s confirmation action; it does not issue it.
A UI affordance that automatically confirms based on queue position or
comment content is prohibited for Founder Class v0.

### 2.4 One item has at most one active confirmed owner per Sale event

> **Uniqueness invariant (DR-3).** At most one Sale record may be in an
> active (non-voided) confirmed state for a given `(eventId, lotId)` pair
> at any point in time.

This is an **ownership uniqueness** constraint, not an idempotency rule.
It means the domain layer must reject any attempt to create a second
active confirmed Sale for the same event and item — regardless of which
Claim triggered the attempt. If the seller confirms a primary Claim and
then a backup is promoted and also confirmed, the prior Sale must be
explicitly voided (via the corrective workflow in §2.7) before or
atomically with the new confirmation. The UI must surface this conflict
and require explicit seller action.

### 2.5 Promotion and confirmation are separate unless explicitly acted together

> **Invariant.** Promoting a backup Claim to primary (`status:
> "promoted"`) is a distinct event from confirming the promoted buyer as
> the owner (`Sale` creation). Promotion does not automatically trigger
> confirmation.

A single seller UI action _may_ combine promotion and confirmation into
one atomic step — “Promote & Confirm” — if the seller explicitly invokes
it. When such a combined action is available in the UI it must be clearly
labelled so the seller understands both operations are occurring. The
underlying domain model still records them as two distinct events:

1. `Claim.status` → `"promoted"`
2. `Sale` created with `source: "facebook-claim"`

If only promotion is performed (e.g. the seller wants to review before
finalising), the Claim sits in `status: "promoted"` and awaits a
separate confirmation step.

### 2.6 Retrying confirmation of the same Claim is a no-op

> **Idempotency rule.** Calling the Sale-creation path for a Claim that
> has already produced a confirmed Sale must be a no-op: the existing
> Sale is returned and no duplicate is created.

This is distinct from the uniqueness invariant in §2.4:

- **Uniqueness (§2.4)** prevents a *different* Claim from creating a
  second active owner for the same event and item.
- **Idempotency (§2.6)** prevents the *same* Claim from being processed
  twice (e.g. a double-tap, a network retry, or a sync replay).

The domain layer identifies a retry by the originating Claim’s own
identifier, not by `(eventId, lotId)`. If the Claim already has an
associated confirmed Sale, the operation is treated as already-applied
and the existing Sale is returned without error. If no Sale is associated
but an active confirmed Sale for the same event and item exists from a
*different* Claim, that is a uniqueness violation (§2.4), not a retry,
and must be rejected.

### 2.7 Post-invoice undo requires an explicit corrective workflow

> **Invariant.** Once a Sale has been incorporated into an Invoice
> (Buyer Bundle), it may not be silently deleted, overwritten, or
> retroactively removed. Correction requires an explicit corrective
> workflow invoked by the seller.

The minimal corrective workflow for PR-E is:

1. Seller voids the Sale (`sale.status: "voided"`).
2. The voided Sale is retained for audit. Physical deletion of Sale rows
   is prohibited in application code.
3. Optionally, the seller may then promote a backup Claim and confirm a
   new owner (§2.5), which creates a fresh Sale record.

Step 1 is the only required step for PR-E. Step 3 is an optional
follow-on seller action.

> **Invoice-side correction is deferred.** How the Invoice (Buyer Bundle)
> responds when its constituent Sales are voided — whether it is
> auto-corrected, requires a seller action, or accumulates into a new
> invoice — is not decided here. That behavior is deferred to
> **ADR-3 / PR-G** (`feat/buyer-bundle-presentation`). No claim is made
> about whether Invoice currently has or will have a `voided` status.

### 2.8 MVP sync recommendation and conflict behavior

#### Recommended approach: snapshot-only (ADR-1 default)

For Founder Class v0, the recommended approach is that Claim state is
persisted locally in Dexie and included in the event snapshot that
`/api/sync/push` already transports. Claims do not require a separate
op-log channel.

**This requires PR-E to:** add Claims to the export/import payload so
that the snapshot includes the full Claim array for an event. Until PR-E
delivers this, Claims exist only in the local Dexie store and are not
synced or recoverable from cloud storage.

**Rationale:**

- Claim records are ephemeral within a sale event; their primary value
  is the downstream Sale they may produce. Once confirmed, the Sale is
  the durable record.
- A solo founder using one device has no multi-device Claim-sync
  requirement for v0.
- Adding Claims to a separate op-log introduces schema, ordering, and
  conflict complexity not justified by the v0 use case.

#### Future requirement: conflict behavior for Claim snapshots

Once PR-E includes Claims in the snapshot payload, the existing
`/api/sync/push` conflict-detection mechanism (comparing client-supplied
timestamp against a stored server timestamp and returning a conflict
response for stale pushes) should apply to snapshots that contain
Claims, in the same way it applies to snapshots today. The specifics —
which timestamp field is compared, the exact response shape, and whether
a force-override is permitted — must be confirmed against the
implemented route behavior at the time PR-E is written. These are
**future requirements for PR-E**, not descriptions of current behavior.

#### Accepted limitations of snapshot-only

| Limitation | Severity for MVP | Mitigation |
|---|---|---|
| Claims not recoverable from cloud before PR-E delivers export/import | Medium — device loss before push loses in-flight Claims | Seller should push snapshot frequently during live sale |
| Two devices editing Claims concurrently may diverge | Low — solo seller, one device | Documented; multi-device scenario deferred to post-MVP |
| Replay of individual Claim events not possible from cloud | Low — not an audit requirement for v0 | Full snapshot retained after PR-E; Sale and Invoice records are durable |

---

## 3. State Machine

```
                    ┌─────────────────────────────────────────────┐
                    │              CLAIM STATES                   │
                    └─────────────────────────────────────────────┘

  [Clerk enters claim]
          │
          ▼
  ┌──────────────┐   seller rejects    ┌───────────────┐
  │   primary    │────────────────────▶│   canceled    │  (terminal)
  └──────────────┘                     └───────────────┘
          │
          │ seller confirms
          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Sale created (idempotent re same Claim)                      │
  │  → uniqueness check: reject if active confirmed Sale exists    │
  │  → added to Invoice (Buyer Bundle) on success                  │
  └──────────────────────────────────────────────────────────────┘

  [Clerk enters backup]
          │
          ▼
  ┌──────────────┐   backup window     ┌───────────────┐
  │    backup    │─────────────────────▶    expired    │  (terminal)
  └──────────────┘      closed         └───────────────┘
          │
          │ seller promotes
          ▼
  ┌──────────────┐
  │   promoted   │  (not yet a Sale — awaits confirmation)
  └──────────────┘
          │
          │ seller confirms (separate step, or combined “Promote & Confirm”)
          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Sale created (idempotent re same Claim)                      │
  │  → uniqueness check: reject if active confirmed Sale exists    │
  │  → added to Invoice (Buyer Bundle) on success                  │
  └──────────────────────────────────────────────────────────────┘

  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Post-Invoice correction path (§2.7):

  [Confirmed Sale in Invoice]
          │
          │ seller invokes void
          ▼
  ┌─────────────┐
  │  sale.voided│  (retained for audit; never deleted)
  └─────────────┘
          │
          │ optional: seller promotes backup → confirms new owner
          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  New Sale created  →  Invoice behavior per ADR-3 / PR-G        │
  └──────────────────────────────────────────────────────────────┘
```

---

## 4. Invariant Cross-Reference

| # | Invariant | AGENTS.md rule | Section |
|---|---|---|---|
| I-1 | Backup/NIL Claim is never a Sale | DR-1 | §2.1 |
| I-2 | Backup Claims never enter Buyer Bundles | DR-2 | §2.2 |
| I-3 | One active confirmed owner per item per Sale event (uniqueness) | DR-3 | §2.4 |
| I-4 | Seller confirmation is authoritative | DR-4 | §2.3 |
| I-5 | Promotion and confirmation are separate unless explicitly combined | DR-4, DR-8 | §2.5 |
| I-6 | Retrying confirmation of the same Claim is a no-op (idempotency) | DR-3 | §2.6 |
| I-7 | Post-invoice undo requires explicit corrective workflow | DR-4 | §2.7 |
| I-8 | Snapshot-only sync for v0; Claim export/import delivered by PR-E | ADR-1 default | §2.8 |

---

## 5. Unresolved Implementation Questions

| # | Question | Blocking PR | Notes |
|---|---|---|---|
| UIQ-1 | Should the “Promote & Confirm” combined action be the default UX, or should promotion and confirmation always be two separate taps? | PR-F only | Affects Claim Desk layout. Combined action is faster for solo sellers but reduces auditability of intermediate state. |
| UIQ-2 | When a voided Sale is the last item on an Invoice, should the Invoice be auto-corrected or require a separate seller action? | ADR-3 / PR-G | Deferred. Does not block PR-E. Invoice-side correction behavior is not defined here. |
| UIQ-3 | Should promoted Claims remain visible in the Claim Desk queue (greyed out) or be removed from the active view? | PR-F only | UX decision; no domain impact. |
| UIQ-4 | Is the `phrase` field (NIL/NEXT text stored on Claim) displayed to the seller during confirmation, or only stored for export? | PR-F only | Small UX decision; useful for seller to verify entry accuracy. |
| SYQ-1 | Once Claims are included in the snapshot, should conflict-resolution policy for Claim records differ from Sale records (e.g. merge backup queues rather than stomp)? | Post-MVP / ADR-1 full resolution | Out of scope for v0; document for future consideration. |

---

## 6. PR-E Acceptance Requirements

The following must all be true before `feat/claim-domain` (PR-E) may merge.

### 6.1 Data model

- [ ] A `Claim` TypeScript interface is defined with at minimum:
  `id`, `syncKey`, `eventId`, `lotId`, `bidderId`, `type` (`"primary"` |
  `"backup"`), `status` (`"primary"` | `"backup"` | `"promoted"` |
  `"canceled"` | `"expired"`), `position` (numeric, backup queue order),
  `phrase` (optional string), `saleId` (optional, set only on
  confirmation), `createdAt`, `updatedAt`.
- [ ] A `claims` Dexie table is added to the local database store.
- [ ] The Dexie schema version is incremented; migration path is
  documented. The schema-version decision (increment vs. new table with
  no migration needed) must be made and recorded in the PR description
  before merge.

### 6.2 Export / import

- [ ] The `claims` array is included in the export payload produced by
  `dataPorter.ts` (or equivalent).
- [ ] Import correctly restores Claim records from the payload.
- [ ] On import, buyer (`bidderId`) and lot (`lotId`) references are
  remapped to the local Dexie IDs of the corresponding imported records.
  If a referenced record cannot be remapped, the Claim is rejected and
  the error is surfaced to the clerk.
- [ ] Queue order (`position`) survives a full export → re-import round
  trip without reordering or gaps.

### 6.3 Domain invariant tests

Each of the following must have a passing Vitest test in the PR-E test
suite:

- [ ] **Backup creates no Sale or Invoice entry.** Entering a backup
  Claim and advancing it to any terminal state other than
  `"promoted"` + confirmed never creates a Sale row or adds an entry
  to an Invoice.
- [ ] **Same-Claim retry creates no duplicate Sale.** Calling the
  Sale-creation path twice for the same Claim returns the existing
  Sale on the second call and does not insert a new row.
- [ ] **Second active owner is rejected.** Attempting to create a
  confirmed Sale for an `(eventId, lotId)` pair that already has an
  active confirmed Sale (from a different Claim) is rejected at the
  domain layer with a typed error. The existing Sale is not modified.
- [ ] **Replacement owner requires explicit correction.** Confirming a
  new owner for an item whose prior Sale has been voided succeeds;
  confirming a new owner without first voiding the prior Sale is
  rejected (per the uniqueness invariant §2.4).

---

## 7. Consequences

### Positive

- All implementation PRs touching Claim, Sale, or Invoice logic have an
  unambiguous reference document.
- The invariants expressed here are directly testable. Each maps to a
  specific test requirement in §6.3.
- Snapshot-only sync keeps v0 implementation complexity low and
  consistent with the existing `/api/sync/push` architecture once
  PR-E adds Claim export/import.

### Negative / accepted trade-offs

- Claims are not recoverable from cloud storage until PR-E ships the
  export/import path. Device loss during a live sale before the seller
  pushes a snapshot will lose in-flight Claim state.
- Multi-device real-time Claim visibility is not supported. Acceptable
  for a solo-founder MVP.
- The corrective workflow (§2.7) adds UI surface area not present in
  the base ClerkBid fork. This surface must be built in PR-E / PR-F.

---

## 8. Alternatives Considered

| Alternative | Reason rejected |
|---|---|
| Op-log sync for Claims (ADR-1 alternative) | Adds schema and ordering complexity not justified by solo v0 use case. Deferred to post-MVP. |
| Automatic confirmation based on queue position | Violates DR-4; prohibited. |
| Silent Sale deletion for undo | Violates audit requirement; voided state required instead. |
| Merging backup queues on snapshot conflict | Out of scope for v0; snapshot-only approach accepted with documented limitations. |

---

## 9. References

- `AGENTS.md` — domain rules DR-1 through DR-8
- `docs/MVP.md` — §1 (Facebook intake workflow), §4 (claim states),
  §5 (success criteria SC-1 through SC-3), §7 (open ADRs)
- `docs/audit/open-questions.md` — Q1, Q5
- `docs/audit/security-gaps.md` — Gap #2 (`force:true` permission gate)
- `docs/audit/mvp-extension-points.md` — §10 (applyRemoteOp test gap),
  §6 (upsertInvoiceForBidder)
- `docs/audit/copilot-reuse-matrix.md` — §6 (Facebook claim-sale gap)
