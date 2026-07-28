# ADR-001 — Facebook Claim Lifecycle

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-28 |
| **Deciders** | Jacquelyn (founder) |
| **Governed by** | `AGENTS.md` DR-1 through DR-8 |
| **Blocking PRs** | PR-E (`feat/claim-domain`), PR-F (`feat/facebook-claim-desk`) |
| **Related ADRs** | Partially addresses ADR-1 and ADR-5 from `docs/MVP.md §7` |

---

## 1. Context

During a Facebook live-sale event the seller (or one assistant) operates
the Claim Desk. Buyers comment on the video — "Sold", "NIL", "NEXT", or a
bid phrase — and the clerk enters each comment as a Claim record. Multiple
bidders may compete for the same item; only one may be confirmed as the
owner. Backups must be preserved in ordered queue.

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
> create a Sale on the seller's behalf.

The system records the seller's confirmation action; it does not issue it.
A UI affordance that automatically confirms based on queue position or
comment content is prohibited for Founder Class v0.

### 2.4 One item has at most one confirmed owner per Sale event

> **Invariant (DR-3).** At most one Sale record may exist for a given
> `(eventId, lotId)` pair with a confirmed owner at any point in time.

If the seller confirms a primary claim and then a backup is promoted and
also confirmed (e.g. after a voided Sale — see §2.7), the prior Sale must
be voided before or atomically with the new confirmation. The system must
enforce this constraint at the domain layer; the UI must surface the
conflict and require explicit seller action.

### 2.5 Promotion and confirmation are separate unless explicitly acted together

> **Invariant.** Promoting a backup Claim to primary (`status:
> "promoted"`) is a distinct event from confirming the promoted buyer as
> the owner (`Sale` creation). Promotion does not automatically trigger
> confirmation.

A single seller UI action _may_ combine promotion and confirmation into
one atomic step — "Promote & Confirm" — if the seller explicitly invokes
it. When such a combined action is available in the UI it must be clearly
labelled so the seller understands both operations are occurring. The
underlying domain model still records them as two distinct events:

1. `Claim.status` → `"promoted"`
2. `Sale` created with `source: "facebook-claim"`

If only promotion is performed (e.g. the seller wants to review before
finalising), the Claim sits in `status: "promoted"` and awaits a
separate confirmation step.

### 2.6 Sale creation is idempotent

> **Invariant.** Calling the Sale-creation path for a Claim that has
> already produced a confirmed Sale must be a no-op that returns the
> existing Sale, never a duplicate.

The idempotency key is `(eventId, lotId)` — one confirmed Sale per
`(event, lot)` pair. The domain layer checks for an existing confirmed
Sale before inserting. If one is found, the request is treated as
already-applied and the existing Sale is returned without error.

This rule applies equally to the local Dexie write path and to any
op-log or snapshot sync that replays claim confirmations (see §2.8).

### 2.7 Post-invoice undo requires an explicit corrective workflow

> **Invariant.** Once a Sale has been incorporated into an Invoice
> (Buyer Bundle), it may not be silently deleted, overwritten, or
> retroactively removed. Correction requires an explicit corrective
> workflow invoked by the seller.

The corrective workflow for MVP is:

1. Seller voids the Sale (`sale.status: "voided"`).
2. If the Sale was the last or only item on an Invoice, the Invoice is
   set to `status: "voided"` as well.
3. If other confirmed Sales for the same buyer remain, a new Invoice
   may be created or the existing one updated (per ADR-3 behavior, to
   be resolved in PR-G).
4. Optionally, the seller may then promote a backup Claim and confirm a
   new owner (§2.5), which creates a fresh Sale record.

Step 1 is the only required step. Steps 2–4 are follow-on seller
actions, not automatic consequences.

> **Implementation note:** "void" is a domain state change, not a
> database delete. Voided Sale rows are retained for audit. Physical
> deletion of Sale or Invoice rows is prohibited in application code.

### 2.8 MVP sync recommendation and conflict behavior

#### Recommended approach: snapshot-only (ADR-1 default)

For Founder Class v0, Claim state is **not** propagated through the
op-log sync (`/api/sync/push`). Only the full event snapshot is
persisted to and restored from cloud storage.

**Rationale:**

- Claim records are ephemeral within a sale event; their primary value
  is the downstream Sale they may produce. Once confirmed, the Sale is
  the durable record.
- A solo founder using one device has no multi-device Claim-sync
  requirement.
- Adding Claims to the op-log introduces schema, ordering, and conflict
  complexity that is not justified by a single-device v0 use case.
- The snapshot already includes the full Claim array; any device that
  pulls a fresh snapshot recovers complete state.

#### Accepted limitations of snapshot-only

| Limitation | Severity for MVP | Mitigation |
|---|---|---|
| Two devices editing Claims concurrently may diverge | Low — solo seller, one device | Documented; multi-device scenario deferred to post-MVP |
| Real-time Claim visibility across devices lags until next push | Low — sole operator | Seller pushes snapshot at will; `NEXT_PUBLIC_ABLY_SYNC` nudge available |
| Replay of individual Claim events not possible from cloud | Low — not an audit requirement for v0 | Full snapshot retained; Sale and Invoice records are durable |

#### Conflict behavior

If two snapshot pushes for the same event arrive concurrently or
out-of-order:

1. The server applies a **last-write-wins** rule using `clientExportedAt`
   as the client-side timestamp.
2. If the incoming `clientExportedAt` is **older** than the stored
   `updated_at`, the server returns `409 sync_conflict`; the client must
   re-fetch, reconcile locally, and re-push with `force: false`.
3. The seller may override with `force: true` to stomp the remote
   state, accepting the risk of overwriting a more recent push from
   another session. This override path is documented as a gap
   (no permission gate in v0 — see `security-gaps.md` Gap #2).
4. Sale and Invoice records are embedded in the snapshot; conflict
   resolution for those records follows the same rule. No special
   merge logic is applied to Sale rows.

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
  │  Sale created (idempotent)  →  added to Invoice (Buyer Bundle)│
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
          │ seller confirms (separate step, or combined "Promote & Confirm")
          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Sale created (idempotent)  →  added to Invoice (Buyer Bundle)│
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
  │  New Sale created  →  new or updated Invoice                 │
  └──────────────────────────────────────────────────────────────┘
```

---

## 4. Invariant Cross-Reference

| # | Invariant | AGENTS.md rule | Section |
|---|---|---|---|
| I-1 | Backup/NIL Claim is never a Sale | DR-1 | §2.1 |
| I-2 | Backup Claims never enter Buyer Bundles | DR-2 | §2.2 |
| I-3 | One confirmed owner per item per Sale event | DR-3 | §2.4 |
| I-4 | Seller confirmation is authoritative | DR-4 | §2.3 |
| I-5 | Promotion and confirmation are separate unless explicitly combined | DR-4, DR-8 | §2.5 |
| I-6 | Sale creation is idempotent | DR-3 | §2.6 |
| I-7 | Post-invoice undo requires explicit corrective workflow | DR-4 | §2.7 |
| I-8 | Snapshot-only sync for v0; last-write-wins conflict resolution | ADR-1 default | §2.8 |

---

## 5. Unresolved Implementation Questions

The following questions are **not** resolved by this ADR. Each must be
answered before the corresponding implementation PR opens.

| # | Question | Blocking PR | Notes |
|---|---|---|---|
| UIQ-1 | Should the "Promote & Confirm" combined action be the default UX, or should promotion and confirmation always be two separate taps? | PR-F | Affects Claim Desk layout. Combined action is faster for solo sellers but reduces auditability of intermediate state. |
| UIQ-2 | When a voided Sale is the last item on an Invoice, should the Invoice be auto-voided or require a separate seller action? | PR-E / PR-G | Relates to ADR-3 (supplemental invoice behavior). |
| UIQ-3 | Should promoted Claims remain visible in the Claim Desk queue (greyed out) or be removed from the active view? | PR-F | UX decision; no domain impact. |
| UIQ-4 | Is the `phrase` field (NIL/NEXT text stored on Claim) displayed to the seller during confirmation, or only stored for export? | PR-F | Small UX decision; useful for seller to verify entry accuracy. |
| SYQ-1 | Once Claims are included in the snapshot, should the conflict-resolution policy for Claim records differ from Sale records (e.g. merge backup queues rather than stomp)? | Post-MVP / ADR-1 full resolution | Out of scope for v0 snapshot-only approach; document for future consideration. |
| SYQ-2 | Should `force: true` on `/api/sync/push` require a seller-visible confirmation dialog, or remain a silent API flag? | PR-E or security follow-up | Currently a gap (no permission gate). See `security-gaps.md`. |

---

## 6. Consequences

### Positive

- All implementation PRs touching Claim, Sale, or Invoice logic have an
  unambiguous reference document.
- The invariants expressed here are directly testable. Each may be
  expressed as a Vitest test in the claim-domain test suite.
- Snapshot-only sync keeps v0 implementation complexity low and
  consistent with the existing `/api/sync/push` architecture.

### Negative / accepted trade-offs

- Multi-device real-time Claim visibility is not supported. Acceptable
  for a solo-founder MVP.
- The corrective workflow (§2.7) adds UI surface area that is not
  present in the base ClerkBid fork. This surface must be built in
  PR-E / PR-F.
- Snapshot conflict resolution (last-write-wins) can cause data loss
  if two sessions push simultaneously. Accepted for v0 with the
  documented `force:true` gap.

---

## 7. Alternatives Considered

| Alternative | Reason rejected |
|---|---|
| Op-log sync for Claims (ADR-1 alternative) | Adds schema and ordering complexity not justified by solo v0 use case. Deferred to post-MVP. |
| Automatic confirmation based on queue position | Violates DR-4; prohibited. |
| Silent Sale deletion for undo | Violates audit requirement; voided state required instead. |
| Merging backup queues on snapshot conflict | Out of scope for v0; snapshot-only approach accepted with documented limitations. |

---

## 8. References

- `AGENTS.md` — domain rules DR-1 through DR-8
- `docs/MVP.md` — §1 (Facebook intake workflow), §4 (claim states),
  §5 (success criteria SC-1 through SC-3), §7 (open ADRs)
- `docs/audit/open-questions.md` — Q1, Q5
- `docs/audit/security-gaps.md` — Gap #2 (`force:true` permission gate)
- `docs/audit/mvp-extension-points.md` — §10 (applyRemoteOp test gap),
  §6 (upsertInvoiceForBidder)
- `docs/audit/copilot-reuse-matrix.md` — §6 (Facebook claim-sale gap)
