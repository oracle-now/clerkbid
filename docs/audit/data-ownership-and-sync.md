# Data Ownership and Sync — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25

---

## Authoritative Data Location

There are two data tiers:

| Tier | Technology | Scope | Authority |
|---|---|---|---|
| **Local (primary)** | Dexie 4 (IndexedDB) | Per browser/device | Write-first; always authoritative for current session |
| **Cloud (backup/sync)** | Neon Postgres via `@vercel/postgres` | Per vendor account | JSONB snapshot; becomes authoritative on restore or second-device pull |

All reads and writes during normal use go through **Dexie only**. The cloud tier is never queried for domain operations — it is a snapshot store.

---

## Local Database Schema (Dexie v10)

Database name: `ClerkBid_u_{userId}` (one database per authenticated user).  
Source: `lib/db.ts`

| Table | Key | Indexes | Role |
|---|---|---|---|
| `events` | `++id` | `syncId` | Auction/sale events |
| `bidders` | `++id` | `[eventId+paddleNumber]`, `syncKey` | Buyers |
| `consignors` | `++id` | `eventId`, `syncKey` | Consignors (not in v0) |
| `lots` | `++id` | `[eventId+lotNumber]`, `syncKey` | Items/lots |
| `sales` | `++id` | `eventId`, `lotId`, `bidderId`, `syncKey` | Claim records |
| `invoices` | `++id` | `eventId`, `bidderId`, `syncKey` | Buyer bundles |
| `settings` | `1` (singleton) | — | App-level settings, last sync timestamps |
| `syncOutbox` | `++id` | `eventSyncId` | Op-log queue for pending cloud pushes |
| `syncState` | `eventSyncId` | — | Per-event sync cursor (last op applied) |
| `syncConflicts` | `++id` | `eventSyncId` | Unresolved merge conflicts |
| `deletedCloudSyncTombstones` | `eventSyncId` | — | Prevents re-importing locally deleted cloud events |

**Schema version:** 10 (migrations v1–v10 inline in `lib/db.ts` `upgrade()` chain).

---

## Record ID Generation

| ID Type | Generator | Scope | Used For |
|---|---|---|---|
| Local integer `id` | Dexie `++id` auto-increment | Per IndexedDB database | All FK joins within one device |
| `syncId` (event) | `newEventSyncId()` — `lib/utils/syncId.ts` (UUID-based) | Global | Identifies event snapshot on cloud |
| `syncKey` (entity) | `newEntitySyncKey()` — `lib/utils/clientSyncKey.ts` (UUID-based) | Global | Stable cross-device identity for bidders, lots, sales, invoices |

**Integer IDs are never sent to the cloud.** Export payloads use `legacyId` (the local integer at export time) only to re-map FKs on import. Cloud identity is always UUID-based.

---

## Cloud Sync Architecture

### Postgres Schema (server-side)

```sql
-- Core tables (from db/schema.sql + migrations)
vendors               -- one row per organization
users                 -- one row per user; vendor_id FK
event_cloud_snapshots -- one row per (vendor_id, event_sync_id): JSONB payload
event_sync_ops        -- op-log table (optional feature flag)
user_sync_preferences -- per-user sync config
vendor_invites        -- multi-user org invites
```

All snapshot rows are scoped by `vendor_id` from the authenticated session. **Client cannot specify vendor_id in request body** (inferred from session extraction in API routes — must verify in `/api/sync/push/route.ts`).

### Sync Flow

```
Local write (Dexie)
    │
    ├─ parentEventTouchHooks → event.updatedAt bumped
    ├─ syncOutbox.add(op)   [if op-sync enabled]
    └─ debounced push trigger → pushCurrentEvent()
                                    │
                          POST /api/sync/push/
                                    │
                         server: upsert JSONB snapshot
                                    │
                       200 OK → recordSuccessfulPush()
                       409 Conflict → fetchEventSnapshot()
                                       → mergeServerSnapshotIntoLocal()
                                       → force-push merged result
```

### Pull Flow

```
App load / manual sync
    │
    ├─ fetchSyncList() → GET /api/sync/list/
    └─ refreshStaleLocalEventsFromList()
            │
            ├─ isServerSnapshotNewerThanLocalBaseline()?
            ├─ hasUnpushedLocalEventMetadataEdits()?
            │       ├─ YES → mergeServerSnapshotIntoLocal() [entity merge]
            │       └─ NO  → replaceEventFromPayload()      [full replace]
            └─ update event.lastCloudPullAt
```

### Sync Direction

**Bidirectional** — not a simple one-way backup:
- Push: local → cloud (explicit or debounced)
- Pull: cloud → local (on app load when server snapshot is newer)
- Conflict resolution: entity-level merge (`snapshotMerge.ts`) when both sides have edits

---

## Offline Behavior

1. All reads and writes proceed via Dexie (IndexedDB is always available).
2. `syncOutbox` accumulates ops; snapshot push returns network error.
3. `PushAllSummary.serverUnavailable` flag signals to UI that sync failed.
4. On reconnect: `pushAllLocalEvents()` drains outbox; 409 conflicts auto-merge.
5. PWA service worker (`next-pwa`) caches app shell — app loads fully offline.

**Data loss scenario:** If user clears browser storage while offline, local data is gone. Cloud snapshot is the only recovery. This is disclosed behavior (not a bug) but must be communicated to pilot users.

---

## Conflict and Duplicate Handling

| Scenario | Behavior |
|---|---|
| 409 on push | Auto-merge: fetch server snapshot → `mergeServerSnapshotIntoLocal()` → force-push |
| Duplicate `syncKey` on import | `replaceEventFromPayload` clears all children before re-insert; no duplicate possible within a replace |
| Two tabs writing same record | Last Dexie write wins; no optimistic locking; **race condition possible** (low risk for solo seller) |
| Partial write (interrupted save) | Dexie transaction: all-or-nothing; interrupted transactions roll back |
| Failed cloud request | Logged in `PushAllSummary`; local data preserved; sync visible as failed in UI |

---

## Export Versioning

| Version | Changes |
|---|---|
| v1 (legacy) | Minimal: event + bidders + lots; no sales/invoices/consignors |
| v2 | Added consignors array |
| v3 | Added `sale.invoiceId` + `invoice.legacyId` |
| v4 | Added per-invoice rate overrides + `manualLines` |
| v5 | No `sale.syncKey` / `invoice.syncKey` |
| v6 (current) | Stable `syncKey` on sales and invoices |

All versions v1–v6 are accepted for import. Version check is strict: unknown versions throw.  
Source: `lib/services/dataPorter.ts` lines 1–30.

---

## What Happens After Offline Writes Reconnect

1. App detects online status (browser `online` event or manual trigger).
2. `pushAllLocalEvents(db)` iterates all local events.
3. For each event: `pushEventWithAutoMerge()` is called.
4. If 409: server snapshot fetched, `mergeServerSnapshotIntoLocal()` runs, result force-pushed.
5. `recordSuccessfulPush()` updates `lastCloudPushAt` and `updatedAt` on event row.
6. If op-sync is enabled: `opSyncClient.ts` flushes `syncOutbox` ops to `/api/sync/ops/`.
7. UI sync indicator updates to “Synced”.

**No data is discarded** unless the server snapshot has newer edits for the same entity field. In that case the server value wins for unchanged-locally fields; local edits win for locally-changed fields.

---

## Independence From AuctionMethod Backend

The application makes **no calls to any external AuctionMethod-hosted API**. All cloud calls are relative paths (`/api/sync/...`) served by the Next.js deployment itself. The only external services are:

- **Neon Postgres** — operator-supplied via `DATABASE_URL`
- **Resend** — operator-supplied via `RESEND_API_KEY`
- **Ably** — optional; omit env var to disable
- **HubSpot** — optional; omit env var to disable
- **Vercel Analytics** — passive telemetry; remove import to disable

A fork deploying its own instance with its own `DATABASE_URL` is fully independent.
