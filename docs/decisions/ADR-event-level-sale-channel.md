# ADR — Event-Level Sale Channel

**Status:** ACCEPTED  
**Date:** 2026-07-28  
**Deciders:** oracle-now  
**Governed by:** `AGENTS.md` domain rules DR-1 through DR-8; `docs/MVP.md` scope boundary  
**Blocking:** PR-C (`feat/event-channel`) — implementation may not begin until this ADR is accepted  
**Related audit:** `docs/audit/mvp-extension-points.md §2`

---

> **Documentation-only.** This file records a design decision. It does not
> modify source code, schemas, tests, CI, authentication, synchronisation,
> or deployment configuration.

---

## 1. Context

### The gap

ClerkBid's existing `AuctionEvent` entity carries no information about which
selling platform or format the event belongs to. All current event records
are implicitly "traditional auction" — a model that does not match the two
primary user groups identified in `AGENTS.md`:

- **Facebook group claim-sale sellers** — manual live-video sales where
  buyers comment to claim items; ownership is seller-confirmed.
- **Whatnot sellers** — live drop sessions on Whatnot's platform where
  completed purchases are entered manually after the drop ends.

`docs/MVP.md §2` already references the field directly:

> *"The `channel` field on `AuctionEvent` is set to `whatnot` for these
> events, distinguishing them from Facebook events in reports and UI."*

`docs/audit/mvp-extension-points.md §2` identifies event-level as the
"lowest-risk default" and documents why item-level channel is deferred.

`docs/audit/copilot-reuse-matrix.md §4` confirms that the Copilot
repository has no channel concept and that ClerkBid must define this
independently.

### What "channel" means in this decision

`channel` answers: **"What kind of sale is this event?"** It is a
seller-set classification applied once when the event is created or edited.
It is not a per-item, per-sale, per-bidder, or per-invoice property in
this decision. Mixed-channel events (a single event spanning both Facebook
and Whatnot) are **not authorized** by this ADR and require a separate
decision.

---

## 2. Decision

**For Founder Class v0, sale channel is a property of `AuctionEvent`.**

A new optional field `channel` is added to the `AuctionEvent` entity with
the following allowed values:

| Value | Display label | Meaning |
|---|---|---|
| `facebook_claim` | Facebook Claim Sale | Live Facebook video sale; buyers claim by commenting; ownership confirmed manually by seller |
| `whatnot` | Whatnot Drop | Whatnot live drop; completed purchases entered manually after drop ends |
| `in_person` | In-Person Sale | Physical live auction or sale event; no platform involvement |
| `other` | Other | Any sale format not covered by the above three values |

The field is **optional** (`channel?: string`). Existing events that carry
no `channel` value are treated as `undefined` — they retain their current
behaviour without modification. `undefined` is **not** the same as `other`;
`other` is an explicit seller declaration that the channel is known but
does not match the three named values. `undefined` means the channel was
never set.

**This ADR does not assign a Dexie version number.** The implementation PR
(PR-C) owns the version bump, following the rule established in
`docs/audit/mvp-extension-points.md §8`:

> *"Each PR that requires a schema change must carry its own version bump
> and upgrade hook, reviewed independently."*

---

## 3. Why Event-Level Is the Lowest-Risk Choice

### Semantic fit

A seller schedules one event per selling session. A Facebook Live claim
sale is one event. A Whatnot drop is one event. An in-person sale is one
event. Channel describes the session, not the item. Placing channel on
`AuctionEvent` matches the mental model sellers already use.

`AGENTS.md` primary user description confirms this framing — users are
distinguished at the event level ("Facebook group claim-sale sellers" vs.
"Whatnot sellers"), not at the item level.

### Schema change surface is minimal

`AuctionEvent` already carries optional metadata fields
(`organizationName`, `currencySymbol`, `buyersPremiumRate`, `taxRate`,
`logoUrl`, `theme`). Adding one optional string field follows the
established pattern. No index change is required.

### Propagation is free

Once `channel` is set on the event, every child screen — Claim Desk,
Invoice / Buyer Bundle view, reports — can read it from the already-loaded
event object. No join, no additional query, no denormalisation required.

### Snapshot and export pass-through

`dataPorter.ts` serialises all own properties of the event row. A new
`channel` field appears in v7+ exports automatically. No export schema
change is required for the field to round-trip. The implementation PR must
verify this assumption (see §6).

### Op-log is not involved

Auction events do not flow through the op-log. They sync via full cloud
snapshot (`event_cloud_snapshots`). Adding an optional field to an event
triggered no op-log changes. Existing `invoice.put`, `invoice.patch`,
`sale.put`, and `sale.delete` op types are unaffected.

### Downstream code paths are isolated

All downstream code that reads `AuctionEvent` (invoice logic, sale
calculations, sync, PDF generation) either ignores unknown fields or reads
only the specific fields it needs. Adding an optional field breaks nothing.

### `docs/MVP.md` already references this field by name

The decision is not novel — `docs/MVP.md §2` already states that
`AuctionEvent.channel` is set to `whatnot` for Whatnot events. This ADR
formalises and fully specifies that reference.

---

## 4. Alternatives Rejected

### 4.1 Item-level channel (`lots.channel`)

**Rejected for MVP.** Reasons:

1. **Entry burden.** The clerk must set channel per lot, not once per
   event. For a 50-lot sale, this is 50 redundant inputs if all items are
   on the same channel.
2. **No existing workflow support.** No current clerking screen, CSV
   import template, or bulk-entry path has a `channel` column.
3. **Lot sync via snapshot only.** There is no lot op type in the op-log;
   lot changes sync via full snapshot. Adding a writable per-item channel
   increases the surface for mid-sale merge conflicts without any MVP use
   case that requires it.
4. **Authorised path exists for later.** If a pilot seller genuinely needs
   per-item channel overrides, a `lots.channel` field can be added in a
   post-MVP PR. The event-level field does not block that extension.

### 4.2 Sale-level channel (`sales.channel`)

**Rejected.** A `Sale` record in ClerkBid represents a confirmed,
completed transaction. Channel is a property of the intake context, not of
the confirmation act. Placing channel on `Sale` would require every sale
entry path (manual entry, claim promotion, Whatnot intake) to carry and
store the channel redundantly. The event already provides this context.

Additionally, `sales` participates in the op-log (`sale.put`,
`sale.delete`). Any change to the `SalePutBody` type would require
corresponding changes to `parseBodies.ts`, `applyRemoteOp.ts`, and
`parseBodies.test.ts`. This is unjustified when the event-level field
provides the same information at lower cost.

### 4.3 Bidder-level channel (`bidders.platformType`)

**Rejected as a channel signal.** A bidder may participate in events on
multiple channels over time. `platformType` on `Bidder` is appropriate
for recording a buyer's platform identity (handled by ADR-2,
`platformUsername`), not for classifying the event type. Channel is not a
property of who the buyer is — it is a property of the event.

### 4.4 Invoice-level channel

**Rejected.** An `Invoice` (Buyer Bundle) is derived from Sales, which are
derived from Claims within an Event. Channel context is available from the
parent event throughout. Adding it redundantly to the Invoice entity creates
a denormalisation risk: an invoice's stated channel could diverge from its
parent event's channel if either is updated independently. The event is the
authoritative source.

### 4.5 A separate `ChannelConfig` entity or table

**Rejected.** A separate entity would require new Dexie table(s), snapshot
support, and likely a new UI settings screen — none of which is justified
for a four-value enum on a single entity. The additional complexity would
delay the pilot without any corresponding benefit at MVP scale.

### 4.6 Hard-coding channel implicitly in the UI (no schema field)

**Rejected.** Without a stored `channel` value, the Claim Desk, Buyer
Bundle view, and report screens cannot adapt their UI per channel. The
field must be stored to be actionable.

---

## 5. Backward-Compatible Default for Existing Events

`channel` is optional (`channel?: string`). All existing `AuctionEvent`
records in production and in test databases will have `channel === undefined`
after the migration.

### Behaviour rules for `undefined` channel

| Context | Rule |
|---|---|
| Clerking screens | Display as if no channel is set; show the generic auction UI (current behaviour). Do not infer or default-display a channel label. |
| Reports and exports | Omit the channel column or show blank/`—` for events with no channel. Do not back-fill with a guessed value. |
| Invoice / Buyer Bundle view | Auction-field suppression is driven by channel (ADR-6); `undefined` means no suppression — all auction fields remain visible (current behaviour). |
| Import / dataPorter.ts | `undefined` channel on import is preserved as `undefined`. Importers must not coerce `undefined` to any named value. |
| Dexie upgrade hook | The upgrade hook for the version bump that adds `channel` must be a no-op on existing rows — it must not write any value to existing `AuctionEvent` records. |

### Explicit non-equivalence

`undefined` ≠ `"other"`. `"other"` is a seller's deliberate declaration.
`undefined` is the absence of a declaration. Code that branches on channel
value must treat them as distinct cases.

---

## 6. Display-Label Mapping

The canonical display labels are defined here. Implementation must not
hard-code alternative strings for these values.

```
const CHANNEL_LABELS: Record<string, string> = {
  facebook_claim: "Facebook Claim Sale",
  whatnot:        "Whatnot Drop",
  in_person:      "In-Person Sale",
  other:          "Other",
};

// For undefined channel (existing events with no channel set):
const CHANNEL_LABEL_UNDEFINED = "—";   // em-dash; used in reports/exports only
```

These labels are the display strings for UI, PDF invoices, CSV reports,
and any other human-readable surface. The stored `channel` value is always
the raw key (`facebook_claim`, `whatnot`, `in_person`, `other`).

The label map is a candidate location: `lib/channelLabels.ts` (new file,
no dependencies). Implementation must verify this is consistent with the
existing pattern in `lib/saleFormOrder.ts` (`LABELS` constant).

---

## 7. Likely Storage, Snapshot, and Export Effects

The following are **likely** effects based on audit of the existing
implementation. The implementation PR (PR-C) must verify each one before
the implementation is considered complete. None of the statements below
constitute code-level approval; they are design expectations only.

### 7.1 Dexie (`lib/db.ts`)

| Expectation | Implementation must verify |
|---|---|
| `AuctionEvent` type gains `channel?: string` field | TypeScript type updated in `lib/db.ts` or the type definition file for `AuctionEvent` |
| Dexie version bumped (number TBD in PR-C) | Version increment follows existing pattern; upgrade hook is a no-op for existing rows |
| No index on `channel` required for MVP | `channel` is a filter/display field, not a query key; an index can be added post-MVP if query performance on channel is needed |

### 7.2 Cloud snapshot (`event_cloud_snapshots`, `dataPorter.ts`)

| Expectation | Implementation must verify |
|---|---|
| `dataPorter.ts` serialises all own properties of the event row | `channel` appears in the exported JSON automatically; no export code change required |
| `dataPorter.ts` import path accepts `channel?: string` without coercion | Existing `undefined`-tolerant import path handles absence of `channel` correctly |
| Export version bump | If the export version schema is bumped to v7+ for the claims table (PR-E), `channel` will be present in v7+. If PR-C ships before PR-E, implementation must decide whether to bump the export version in PR-C or add a migration note. |

### 7.3 Op-log (`syncOutbox`, `event_sync_ops`)

| Expectation | Implementation must verify |
|---|---|
| No op-log change required | `AuctionEvent` fields sync via full snapshot, not op-log. Adding `channel` does not require a new op type or changes to `parseBodies.ts`, `applyRemoteOp.ts`, or `enqueueOps.ts`. |

### 7.4 Snapshot merge (`snapshotMerge.ts`)

| Expectation | Implementation must verify |
|---|---|
| New optional field on event passes through existing merge logic transparently | Merge handles event rows as whole entities; `channel` is an additive field; no merge conflict case is introduced |

### 7.5 Vendor isolation

| Expectation | Implementation must verify |
|---|---|
| `channel` is an attribute of an event; events are already vendor-scoped by `vendorId` | No additional vendor-isolation guard is required specifically for `channel` |
| Vendor isolation tests in PR-02 (`lib/security/vendorIsolation.test.ts`) continue to pass | No test changes required for this field; implementation must confirm tests still pass |

---

## 8. Questions Implementation Must Verify Before PR-C Merges

These are open implementation-level questions. They are not unresolved
design questions — the design decision above is made. They are verification
steps the implementation PR author must complete and document in the PR
description.

| # | Question | Where to verify |
|---|---|---|
| V-1 | Does `dataPorter.ts` serialise `AuctionEvent` via `JSON.parse(JSON.stringify(event))` or via an explicit field list? If explicit, `channel` must be added to the field list. | `lib/services/dataPorter.ts` — inspect the event serialisation path |
| V-2 | Does the event create/edit form (`app/(protected)/events/` or equivalent) use a controlled-input approach (explicit field list) or spread the entity? If explicit, `channel` must be added to the form state initialiser and the submit handler. | Event form component — inspect props and submit handler |
| V-3 | Does `snapshotMerge.ts` merge events by replacing the whole row, or by merging individual fields? If field-level merge, `channel` must be included in the merge logic. | `lib/services/snapshotMerge.ts` — inspect the event merge branch |
| V-4 | Is there a Zod or other validation schema for `AuctionEvent` that must be updated to allow the new field? | Search for `z.object` or `zod` schemas referencing `AuctionEvent` |
| V-5 | Does the `cloudSyncRefresh` pull path deserialise events into a typed object that would drop unknown fields? | `lib/services/cloudSyncRefresh.ts` — inspect the event deserialisation |
| V-6 | Does `csvImportBidders.ts` or any other import path reconstruct `AuctionEvent` in a way that would lose `channel`? | `lib/services/csvImportBidders.ts` — event object is not reconstructed here, but verify |
| V-7 | Are there any existing `AuctionEvent` tests that assert the exact shape of the entity and would fail with a new field? | Run `vitest` after adding the field; observe any snapshot-style test failures |
| V-8 | Does the Dexie upgrade hook for the new version need to handle any compound index on `events` that includes currently-indexed fields? (e.g., if `events` has an `[vendorId+createdAt]` index, it is unaffected; confirm no existing index is broken) | `lib/db.ts` — inspect the `events` store definition |

---

## 9. Rollback Strategy

### If the implementation PR (PR-C) is reverted before any pilot data exists

1. Revert the PR — `git revert` the merge commit on `main`.
2. The Dexie version bump is reversed. Because the upgrade hook is a no-op,
   reverting the version bump is safe: Dexie will re-open the database at
   the previous version and existing data is unaffected.
3. No cloud snapshot migration is required — `channel` is optional; existing
   snapshots already lack the field; the revert restores the prior code that
   ignores it.
4. No op-log rollback is required — no op types were added.

### If the implementation PR has shipped and pilot data includes events with a `channel` value

1. **Do not revert the schema change.** Reverting a Dexie version bump after
   real data has been written at the higher version number can corrupt the
   client-side database for affected users.
2. Instead: deploy a corrective PR that either (a) fixes the specific bug
   in the channel implementation, or (b) removes the channel field from the
   UI and treats it as a deprecated internal field, preserving existing
   stored values.
3. Cloud snapshot: because `channel` is optional and `dataPorter.ts`
   handles `undefined` correctly, a corrective PR that stops writing
   `channel` will produce snapshots without the field; the merge path will
   treat absence as `undefined`; no data is lost.
4. **No credential rotation or security response is required** — `channel`
   is a non-sensitive classification field.

### Summary

| Scenario | Safe to revert? | Action |
|---|---|---|
| Before pilot data | Yes | `git revert` the PR merge commit |
| After pilot data written, no live users affected | Yes, with care | `git revert` acceptable if Dexie version is confirmed stable; test locally first |
| After pilot data written, live users have synced | No schema revert | Deploy corrective PR; preserve stored values |

---

## Source Basis

| Document | Section read |
|---|---|
| `AGENTS.md` | Primary users; domain rules DR-1–DR-8; permitted scope; what agents may not do |
| `docs/MVP.md` | §2 (Whatnot intake, explicit `channel` reference); §3 (auction-field suppression, ADR-6); §7 (open ADRs list) |
| `docs/audit/mvp-extension-points.md` | §2 (event-level channel recommendation, item-level deferral rationale); §8 (Dexie version rule); §9 (snapshot pass-through expectation) |
| `docs/audit/copilot-reuse-matrix.md` | §4 (no channel concept in Copilot; ClerkBid must define independently) |
