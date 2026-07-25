# Runtime Trace — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25  
**Status:** Static code inspection. No live environment executed.

---

## Trace Legend

| Column | Meaning |
|---|---|
| UI Component | React component or route that initiates the action |
| Event Handler | Handler function or server action |
| Validation | Input guards before domain op |
| Domain Op | Business logic layer |
| Storage Adapter | Dexie table + operation |
| Sync Behavior | Cloud sync consequence |
| Error Behavior | What the user sees on failure |
| Tests | Confirmed test coverage |
| Auction Assumption | ClerkBid-specific coupling that affects Live Sale Clerk fork |

---

## 1. Create Event

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/events/new/page.tsx` (inferred) — form with name, description, organizationName, taxRate, currencySymbol, buyersPremiumRate |
| **Event Handler** | `db.events.add({...})` via `useAuctionDB` hook |
| **Validation** | Name required; taxRate/buyersPremiumRate coerced to finite number ≥0 |
| **Domain Op** | `eventService.ts` — generates `syncId` via `newEventSyncId()` (UUID v4 prefix) on first cloud push, or at creation time |
| **Storage Adapter** | `db.events.add(row)` → Dexie IndexedDB `events` store; auto-increment `id` |
| **Sync Behavior** | `parentEventTouchHooks.ts` — `updatedAt` bumped on event row; cloud push debounced; `syncId` assigned before first push |
| **Error Behavior** | Dexie write errors surface as thrown exceptions; UI expected to catch and toast (unconfirmed in this audit pass) |
| **Tests** | No direct event-creation unit test found; `dataPorter.test.ts` covers round-trip import |
| **Auction Assumption** | `buyersPremiumRate` field is auction-specific; irrelevant for claim sales — must default to 0 and hide in UI |

---

## 2. Register Bidder

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/bidders/` — bidder list + add form |
| **Event Handler** | `db.bidders.add({eventId, paddleNumber, name, ...})` |
| **Validation** | `paddleNumber` uniqueness within event enforced by UI (Dexie uniqueness index on `[eventId+paddleNumber]` — inferred from schema); name required |
| **Domain Op** | Direct Dexie insert; `syncKey` assigned via `newEntitySyncKey()` |
| **Storage Adapter** | `db.bidders.add()` → IndexedDB `bidders` store |
| **Sync Behavior** | Parent event `updatedAt` touched via hook; op written to `syncOutbox` when op-sync enabled |
| **Error Behavior** | Duplicate paddle → Dexie `ConstraintError`; UI should surface as paddle-already-in-use message |
| **Tests** | `csvImportBidders.ts` tested indirectly via `csvImport.test.ts`; no unit test for direct add |
| **Auction Assumption** | `paddleNumber` is auction-specific; for claim sales rename to buyer identifier (FB name / handle). Schema field must remain for backward compat — UI label only rename in v0 |

---

## 3. Create or Select Lot

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/lots/` (list + add) and `app/(protected)/clerking/` (select by lot number) |
| **Event Handler** | Clerking: `findLotByBaseSuffix()` — `lib/clerking/findLotByBaseSuffix.ts`; Lot CRUD: `db.lots.add()`/`db.lots.put()` |
| **Validation** | Lot number parse via `lotParse.ts`; base + suffix structure; duplicate lot number within event rejected |
| **Domain Op** | `findLotByBaseSuffix` performs IndexedDB query; `nextBaseLot` auto-advances lot number |
| **Storage Adapter** | `db.lots` → IndexedDB `lots` store |
| **Sync Behavior** | Parent event touched; op-sync outbox if enabled |
| **Error Behavior** | Unknown lot number → "Lot not found" inline error in clerking form; prevents sale entry |
| **Tests** | `findLotByBaseSuffix.test.ts`, `lotParse.test.ts`, `nextBaseLot.test.ts` — **well tested** |
| **Auction Assumption** | Lot number (`base`+`suffix`) is auction-specific. For claim sales: item number or sequential identifier. `lotParse.ts` logic is reusable but label must change. |

---

## 4. Record Winning Bidder (Claim)

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/clerking/` — sale entry form; fields: lot, paddle, price, quantity, description, notes, consignor, initials |
| **Event Handler** | Form submit handler → `db.sales.add({eventId, lotId, bidderId, hammerPrice, quantity, ...})` |
| **Validation** | `saleFormOrder.ts` enforces required fields; paddle always required; lot or description required; duplicate submission idempotency not explicitly enforced at DB level — **gap** |
| **Domain Op** | Resolves `lotId` from lot number; resolves `bidderId` from paddle number; assigns `syncKey` |
| **Storage Adapter** | `db.sales.add()` → IndexedDB `sales` store |
| **Sync Behavior** | Parent event touched; op written to outbox |
| **Error Behavior** | Failed lot/bidder lookup blocks submission; network errors on sync are silent at write time (sync is async/background) |
| **Tests** | `saleLineTotals.test.ts` covers totals; **no test for duplicate primary claim invariant** — critical gap |
| **Auction Assumption** | `hammerPrice` + `paddle` are auction-specific; for claim sales: claimed price + buyer name. Field rename only. No logic change. |

---

## 5. Undo Recorded Sale

| Field | Detail |
|---|---|
| **UI Component** | Clerking screen — undo button on last sale; or invoices screen — remove sale from invoice |
| **Event Handler** | `lib/services/saleInvoiceEdits.ts` — `undoSale()` / `removeSaleFromInvoice()` |
| **Validation** | Confirms sale exists and belongs to current event |
| **Domain Op** | `db.sales.delete(saleId)`; if invoice exists, recalculates invoice totals via `invoiceLogic.ts` |
| **Storage Adapter** | `db.sales.delete()` + `db.invoices.update()` in Dexie transaction |
| **Sync Behavior** | Parent event touched; op-log records delete op; cloud snapshot will not resurrect deleted sale on next merge (tombstone via syncKey) |
| **Error Behavior** | If invoice is in `paid` state, undo may be blocked (inferred — not confirmed by test) |
| **Tests** | `invoiceLogic.test.ts` covers recalculation after removal; no undo-then-redo sequence tested |
| **Auction Assumption** | None specific — undo logic is domain-neutral |

---

## 6. Generate Invoice

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/invoices/` — generate button per bidder |
| **Event Handler** | `invoiceLogic.ts` — `generateInvoice()` |
| **Validation** | Bidder must have at least one sale; event tax rate and BP rate must be present (defaults to 0 if missing — `EXPORT_VERSION_2` backward compat) |
| **Domain Op** | Aggregates all uninvoiced sales for bidder; calculates subtotal, buyersPremiumAmount, taxAmount, total; creates invoice row; links sale rows via `invoiceId` FK |
| **Storage Adapter** | `db.invoices.add()` + `db.sales.update({invoiceId})` in transaction |
| **Sync Behavior** | Parent event touched |
| **Error Behavior** | Missing inputs exposed in totals (financial estimate gap visible) |
| **Tests** | `invoiceLogic.test.ts` — **well tested** (multiple BP + tax scenarios) |
| **Auction Assumption** | `buyersPremiumRate` and `taxRate` are auction-specific. For claim sales: `buyersPremiumRate` should default to 0; invoice becomes a simple purchase summary. |

---

## 7. Modify Invoice

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/invoices/[id]/edit` (inferred) |
| **Event Handler** | `saleInvoiceEdits.ts` — add/remove sale lines; `invoiceLogic.ts` — recalculate; manual line add/edit |
| **Validation** | Manual line amount must be numeric; description required |
| **Domain Op** | `db.invoices.update({manualLines, subtotal, total, ...})` |
| **Storage Adapter** | `db.invoices.update()` |
| **Sync Behavior** | Parent event touched; op-log op written |
| **Error Behavior** | Concurrent edit from another tab: last write wins (no UI lock) — **concurrency gap** |
| **Tests** | `invoiceLogic.test.ts` covers manual lines |
| **Auction Assumption** | Manual lines useful for claim sales (e.g. shipping estimate) — keep. |

---

## 8. Work Offline

| Field | Detail |
|---|---|
| **UI Component** | Any — PWA service worker (`next-pwa`) caches app shell and static assets |
| **Event Handler** | All Dexie writes proceed normally; sync calls fail silently and queue in `syncOutbox` |
| **Validation** | Unchanged — all validation is client-side |
| **Domain Op** | All domain ops read/write IndexedDB only |
| **Storage Adapter** | Dexie — fully available offline |
| **Sync Behavior** | Outbox accumulates ops; snapshot push returns network error; UI shows sync failure indicator (inferred from `serverUnavailable` flag in `pushAllLocalEvents`) |
| **Error Behavior** | Failed sync visible via `PushAllSummary.serverUnavailable === true`; data not lost |
| **Tests** | `cloudSyncRefresh.test.ts` covers skip-when-fetch-fails path; no end-to-end offline test |
| **Auction Assumption** | None — offline-first behavior is domain-neutral |

---

## 9. Reconnect After Offline Work

| Field | Detail |
|---|---|
| **UI Component** | Sync status indicator; manual "Sync now" button in settings |
| **Event Handler** | `pushAllLocalEvents(db)` — iterates all events, pushes snapshots; op-sync: `opSyncClient.ts` flushes outbox |
| **Validation** | Conflict detection: 409 response triggers auto-merge via `pushEventWithAutoMerge()` |
| **Domain Op** | `mergeServerSnapshotIntoLocal()` — entity-level merge: server wins on fields not locally edited since last pull |
| **Storage Adapter** | `db.events.update({lastCloudPushAt, updatedAt})` after successful push |
| **Sync Behavior** | Bidirectional: local → server (push), server → local (pull if server newer); auto-merge on 409 |
| **Error Behavior** | After auto-merge fails: `snapshotConflicts` array populated; UI must surface conflict (inferred) |
| **Tests** | `cloudSyncRefresh.test.ts`, `snapshotMerge.test.ts` — **merge logic well tested** |
| **Auction Assumption** | None |

---

## 10. Perform Cloud Backup

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/settings/` — "Backup to cloud" button; also `vercel.json` cron monthly |
| **Event Handler** | `pushCurrentEvent(db, eventId)` → `pushEventSnapshot(payload)` → `POST /api/sync/push/` |
| **Validation** | `syncId` must be present; payload validated via `parseEventExportPayload()` on server |
| **Domain Op** | `buildEventExport(db, eventId)` — serializes all child rows |
| **Storage Adapter** | Server: Neon Postgres `event_cloud_snapshots` table (JSONB payload + `updatedAt`) |
| **Sync Behavior** | One-way push at initiation; bidirectional pull triggered on next app load |
| **Error Behavior** | 409 conflict → auto-merge + retry; 503 server unavailable → `serverUnavailable: true` |
| **Tests** | `cloudSyncRefresh.test.ts` covers decision logic; no test for HTTP layer |
| **Auction Assumption** | None |

---

## 11. Restore From Backup

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/settings/` — "Restore from cloud" |
| **Event Handler** | `restoreEventFromCloud(db, eventId, syncId)` → `fetchEventSnapshot()` → `replaceEventFromPayload()` |
| **Validation** | `parseEventExportPayload()` validates version + required arrays |
| **Domain Op** | Full replace: deletes all child rows, re-inserts from payload, remaps FKs via `legacyId` maps |
| **Storage Adapter** | Dexie transaction over `events, bidders, consignors, lots, sales, invoices, syncOutbox, syncState, syncConflicts` |
| **Sync Behavior** | Clears outbox for this event (avoids stale ops re-applying after restore) |
| **Error Behavior** | Partial transaction failure: Dexie rolls back entire transaction |
| **Tests** | `dataPorter.test.ts` covers import round-trip; no test for replace-from-cloud specifically |
| **Auction Assumption** | None |

---

## 12. Export All Data

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/settings/` — "Export all data" |
| **Event Handler** | `buildFullDatabaseExport(db)` → `downloadJson(filename, data)` |
| **Validation** | None — export proceeds even if some events have incomplete data |
| **Domain Op** | Iterates all events; calls `buildEventExport()` per event; wraps in `FullDatabaseExport` envelope |
| **Storage Adapter** | Read-only Dexie queries |
| **Sync Behavior** | None — local export only |
| **Error Behavior** | If a date field is missing: throws `Error('Missing date for export: ...')` — aborts export |
| **Tests** | `dataPorter.test.ts` |
| **Auction Assumption** | None — export is format-neutral |

---

## 13. Delete an Account or Its Data

| Field | Detail |
|---|---|
| **UI Component** | `app/(protected)/settings/` (inferred) or `app/api/admin/` for super-admin |
| **Event Handler** | Not fully traced — **UNKNOWN** for self-service account deletion. Admin: `/api/admin/` routes |
| **Validation** | Unknown |
| **Domain Op** | Expected: delete Postgres `users` row (cascades to vendor data); delete all Dexie data locally |
| **Storage Adapter** | Postgres (server-side) + Dexie `db.delete()` or per-table clear (client-side) |
| **Sync Behavior** | Cloud snapshots: `deleteCloudEventBackup(syncId)` exists; full account deletion unclear |
| **Error Behavior** | Unknown |
| **Tests** | None confirmed |
| **Auction Assumption** | None — but **must be verified before inviting pilot users** (GDPR/CCPA right to erasure) |

---

## Gaps Summary

| Gap | Severity | Trace |
|---|---|---|
| Duplicate primary claim invariant not enforced at DB/domain level | High | #4 |
| Account deletion flow not fully traced | High | #13 |
| Two-tab concurrent edit: last-write-wins, no UI lock | Medium | #7 |
| Undo-then-redo sequence untested | Medium | #5 |
| No E2E offline/reconnect test | Medium | #8, #9 |
| `POST /api/sync/push` vendor scoping not confirmed in this audit | High | #10 |
