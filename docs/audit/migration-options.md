# Migration Options — AuctionMethod/clerkbid → Live Sale Clerk

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25

---

## Context

ClerkBid stores all data in a per-user Dexie 4 IndexedDB database at schema version 10. Any user who has previously used ClerkBid will have existing event, bidder, lot, sale, and invoice data in their browser. The migration strategy must keep that data readable while adding the new fields and concepts required for Live Sale Clerk Founder Class v0.

---

## Option A — Additive Schema Bump (Recommended)

**Approach:** Bump Dexie schema from v10 to v11. Add new fields to existing tables. All existing records gain default values for new fields via the Dexie upgrade hook.

### Changes Required

```typescript
// lib/db.ts — version(11).stores()
// Existing tables unchanged; add new indexes only where needed
this.version(11).stores({
  lots: '++id, [eventId+lotNumber], syncKey, [eventId+saleOrder]',
  sales: '++id, eventId, lotId, bidderId, syncKey, [eventId+isPrimary]',
}).upgrade(tx => {
  // Existing lots: saleOrder defaults to lotNumber (preserves current order)
  tx.table('lots').toCollection().modify(lot => {
    if (lot.saleOrder == null) lot.saleOrder = lot.lotNumber ?? 0;
    if (lot.costBasis == null) lot.costBasis = undefined;
    if (lot.channel == null) lot.channel = undefined;
  });
  // Existing sales: all are treated as primary claims (no backup concept before)
  tx.table('sales').toCollection().modify(sale => {
    if (sale.isPrimary == null) sale.isPrimary = true;
    if (sale.isBackup == null) sale.isBackup = false;
    if (sale.promotedAt == null) sale.promotedAt = undefined;
  });
});
```

### Export Version

Bump `EXPORT_VERSION` from 6 to 7 in `lib/services/dataPorter.ts`. Add the three new lot fields and three new sale fields to the export payload types. Maintain backward-compat import for v1–v6 (treat missing `isPrimary` as `true`, missing `saleOrder` as `lotNumber`).

### Pros
- **Zero data loss** — all existing ClerkBid records remain readable.
- Minimal code surface change.
- Sync and export layers need only additive updates.
- Rollback path: if v11 migration fails, Dexie rolls back; user retains v10 data.

### Cons
- Dexie schema file grows slightly.
- `EXPORT_VERSION` increment means v7 exports won’t import into unmodified ClerkBid (acceptable for fork).

**Recommended for Founder Class v0.**

---

## Option B — New Tables for Claims

**Approach:** Add `claims` and `backupClaims` as new Dexie tables alongside the existing `sales` table. Existing `sales` records are left untouched.

### Pros
- Clean separation of claim concept from auction sale concept.
- No upgrade migration needed for existing `sales` rows.

### Cons
- All domain logic (invoice generation, export, merge) must be duplicated or abstracted across two tables.
- Report calculator and data porter require significant changes.
- Two sources of truth for “what was sold” increases complexity.
- Higher regression risk.

**Not recommended for v0.** Consider for v1 if the claim model diverges significantly from the sale model.

---

## Option C — Full Schema Replacement

**Approach:** Delete the v10 schema. Define a new schema from scratch with Live Sale Clerk terminology (`items`, `buyers`, `claims`, `bundles`, `events`).

### Pros
- Clean slate; terminology is consistent throughout codebase.

### Cons
- **Breaks all existing ClerkBid data** — existing users lose their history.
- Export/import bridge required to migrate v1–v6 payloads to the new schema.
- All sync, merge, and data porter logic must be rewritten.
- Estimated effort: 2–3 weeks.
- Violates scope constraint: “Do not replace local-first or offline behavior merely to align with a preferred stack.”

**Rejected.** Not compatible with audit scope constraints or the Founder Class timeline.

---

## Recommendation

**Option A** — Additive schema bump to v11 with `saleOrder`, `costBasis`, `channel` on `lots` and `isPrimary`, `isBackup`, `promotedAt` on `sales`. Export version bump to v7. Implement in PR-04 (claim workflow) alongside domain logic for backup claim promotion.

---

## Existing Data Readability

| Scenario | Outcome with Option A |
|---|---|
| User opens app after v11 migration | Dexie upgrade hook runs; existing lots get `saleOrder` from `lotNumber`; existing sales get `isPrimary: true` |
| User exports data before upgrade | v6 export; importable into any ClerkBid or Live Sale Clerk instance |
| User exports data after upgrade | v7 export; importable into Live Sale Clerk; backward-compat import for v6 and earlier still works |
| User restores v6 cloud snapshot into v11 schema | `replaceEventFromPayload` handles missing fields via defaults; `isPrimary` defaults to `true` for all imported sales |
