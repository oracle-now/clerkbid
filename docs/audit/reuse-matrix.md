# Reuse Matrix — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25

---

## Classification Key

| Label | Meaning |
|---|---|
| KEEP UNCHANGED | Use as-is in the fork; no modifications needed |
| ADAPT | Use with targeted changes (label renames, config, minor logic) |
| WRAP | Preserve module; add a thin adapter layer above it |
| EXTRACT | Move to a shared package or isolate from auction-specific context |
| REPLACE | Rewrite with Live Sale Clerk-specific implementation |
| REMOVE | Not needed for Founder Class v0; delete or disable |
| UNKNOWN | Insufficient inspection to classify |

---

## Core Persistence

| Module | Path | Classification | Evidence | Effort | Dependencies | Regression Risk | Decision Owner |
|---|---|---|---|---|---|---|---|
| Dexie schema (v10) | `lib/db.ts` | **ADAPT** | Schema entities map cleanly to claim-sale domain with label renames. `paddleNumber` → `buyerHandle` in v11 migration. New fields `isPrimary`, `isBackup` on `sales` table needed. | S (1 day) | `lib/db/parentEventTouchHooks.ts` | High — all other modules depend on this | Persistence agent |
| Dexie parent touch hooks | `lib/db/parentEventTouchHooks.ts` | **KEEP UNCHANGED** | Domain-neutral; bumps `event.updatedAt` on any child write | None | `lib/db.ts` | Low | Persistence agent |
| Sync apply guard | `lib/db/syncApplyGuard.ts` | **KEEP UNCHANGED** | Mutex guard is domain-neutral | None | None | Low | Sync agent |
| Live query SSR guard | `lib/dexie/liveQueryGuard.ts` | **KEEP UNCHANGED** | SSR safety wrapper; domain-neutral | None | None | Low | UI agent |

---

## Cloud Sync

| Module | Path | Classification | Evidence | Effort | Dependencies | Regression Risk | Decision Owner |
|---|---|---|---|---|---|---|---|
| Cloud sync orchestration | `lib/services/cloudSync.ts` | **KEEP UNCHANGED** | Push/pull/merge logic is fully domain-neutral; operates on `EventExportPayload` | None | `dataPorter.ts`, `snapshotMerge.ts` | High | Sync agent |
| Snapshot merge | `lib/services/snapshotMerge.ts` | **KEEP UNCHANGED** | Entity-level bidirectional merge; well-tested | None | `lib/db.ts` | High | Sync agent |
| Data porter (export/import) | `lib/services/dataPorter.ts` | **ADAPT** | Export version bump to v7 needed when `isPrimary`/`isBackup` fields added; legacy v1–v6 import paths must be preserved | S (1 day) | `lib/db.ts`, `invoiceLogic.ts` | High | Finance/export agent |
| Cloud delete tombstone | `lib/services/cloudDeleteTombstone.ts` | **KEEP UNCHANGED** | Domain-neutral tombstone logic | None | `lib/db.ts` | Low | Sync agent |
| Op-sync client | `lib/services/opSyncClient.ts` | **KEEP UNCHANGED** | Op-level sync is domain-neutral; disabled by default (feature flag) | None | `lib/sync/` | Low | Sync agent |
| Sync ops flag | `lib/sync/syncOpsFlag.ts` | **KEEP UNCHANGED** | Simple env flag check | None | None | None | Sync agent |
| Sync op type definitions | `lib/sync/ops/` | **KEEP UNCHANGED** | Domain-neutral op types | None | None | Low | Sync agent |

---

## Domain / Business Logic

| Module | Path | Classification | Evidence | Effort | Dependencies | Regression Risk | Decision Owner |
|---|---|---|---|---|---|---|---|
| Invoice logic | `lib/services/invoiceLogic.ts` | **ADAPT** | `buyersPremiumRate` and `taxRate` remain in schema for backward compat; for claim sales both default to 0 and are hidden in UI. Manual lines and totals logic is reusable. | XS (hours) | `lib/db.ts` | Medium | Finance/export agent |
| Sale form order/prefs | `lib/saleFormOrder.ts` | **ADAPT** | Field IDs (`lot`, `paddle`) need rename for claim-sale UI; localStorage key can stay | XS (hours) | None | Low | UI agent |
| Sale line totals | `lib/services/saleLineTotals.ts` | **KEEP UNCHANGED** | Arithmetic is domain-neutral | None | None | Low | Finance/export agent |
| Invoice branding | `lib/services/invoiceBranding.ts` | **KEEP UNCHANGED** | Logo/footer resolution is domain-neutral | None | `lib/db.ts` | Low | Finance/export agent |
| Sale+invoice edits | `lib/services/saleInvoiceEdits.ts` | **ADAPT** | Undo sale: add guard for `isPrimary`/`isBackup` promotion invariant | XS | `lib/db.ts`, `invoiceLogic.ts` | Medium | Claim workflow agent |
| Consignor attribution | `lib/services/consignorAttribution.ts` | **REMOVE** | No consignor model in Founder Class v0 | None | None | None | Claim workflow agent |
| Consignor commission | `lib/services/consignorCommission.ts` | **REMOVE** | No consignor commission in Founder Class v0 | None | None | None | Finance/export agent |
| Consignor statement PDF | `lib/services/consignorStatementPdf.ts` | **REMOVE** | No consignor in v0 | None | `jsPDF` | None | Finance/export agent |
| Report calculator | `lib/services/reportCalculator.ts` | **ADAPT** | Profit estimate for claim sales — keep aggregation logic; rename consignor references | S | `lib/db.ts` | Low | Finance/export agent |
| Event service | `lib/services/eventService.ts` | **ADAPT** | Rename `event` → `sale` in UI display; schema entity name stays | XS | `lib/db.ts` | Low | Claim workflow agent |

---

## Clerking (Core Workflow)

| Module | Path | Classification | Evidence | Effort | Dependencies | Regression Risk | Decision Owner |
|---|---|---|---|---|---|---|---|
| Lot parse | `lib/clerking/lotParse.ts` | **ADAPT** | Rename to `itemParse.ts` or keep as-is with alias; logic is reusable | XS | None | Low | Claim workflow agent |
| Find lot by base+suffix | `lib/clerking/findLotByBaseSuffix.ts` | **ADAPT** | Rename to `findItemByNumber`; logic unchanged | XS | `lib/db.ts` | Low | Claim workflow agent |
| Next base lot | `lib/clerking/nextBaseLot.ts` | **ADAPT** | Rename; logic unchanged | XS | None | Low | Claim workflow agent |

---

## CSV Import / Export

| Module | Path | Classification | Evidence | Effort | Dependencies | Regression Risk | Decision Owner |
|---|---|---|---|---|---|---|---|
| CSV parse | `lib/services/csvParse.ts` | **KEEP UNCHANGED** | Generic row parser | None | None | None | Finance/export agent |
| CSV exporter | `lib/services/csvExporter.ts` | **KEEP UNCHANGED** | Generic download helper | None | None | None | Finance/export agent |
| CSV import — bidders | `lib/services/csvImportBidders.ts` | **ADAPT** | Rename `paddleNumber` column header | XS | `lib/db.ts` | Low | Claim workflow agent |
| CSV import — lots | `lib/services/csvImportLots.ts` | **ADAPT** | Rename `lot` column header to `item` | XS | `lib/db.ts` | Low | Claim workflow agent |
| CSV import — consignors | `lib/services/csvImportConsignors.ts` | **REMOVE** | No consignors in v0 | None | None | None | Claim workflow agent |
| Accounting CSV | `lib/services/accountingCsv.ts` | **ADAPT** | Rename column headers; keep logic; add `estimatedProfit` column | S | `lib/db.ts` | Low | Finance/export agent |

---

## PDF Generation

| Module | Path | Classification | Evidence | Effort | Dependencies | Regression Risk | Decision Owner |
|---|---|---|---|---|---|---|---|
| Invoice PDF | `lib/services/invoicePdf.ts` | **ADAPT** | Rename "Invoice" → "Bundle" or "Order Summary"; hide BP fields | XS | `jsPDF` | Low | Finance/export agent |
| List PDFs | `lib/services/listPdfs.ts` | **ADAPT** | Rename lot/bidder labels | XS | `jsPDF` | Low | Finance/export agent |

> Note: PDF generation (`jsPDF`) is explicitly out of scope for Founder Class v0. These modules are classified for future reference; they can be left unchanged but should not be invoked in v0 workflows.

---

## Authentication & API Routes

| Module | Path | Classification | Evidence | Effort | Dependencies | Regression Risk | Decision Owner |
|---|---|---|---|---|---|---|---|
| NextAuth config | `lib/auth/` | **KEEP UNCHANGED** | Credentials provider + session; fully self-hostable | None | Postgres `users` | High | Security agent |
| Middleware route guard | `middleware.ts` | **KEEP UNCHANGED** | Session-based route protection; domain-neutral | None | NextAuth | High | Security agent |
| Sync API routes | `app/api/sync/` | **KEEP UNCHANGED** | Relative paths; vendor-scoped (verify); domain-neutral | None | Neon Postgres | High | Security agent |
| Register API | `app/api/register/` | **KEEP UNCHANGED** | Standard registration; HubSpot call is gated by env var | None | Postgres, Resend | Medium | Security agent |
| Admin API | `app/api/admin/` | **REMOVE** | Super-admin and impersonation not needed for solo-seller v0 | XS | Postgres | Low | Security agent |
| Ably token API | `app/api/ably/` | **REMOVE** | Ably realtime disabled for v0 | None | Ably | None | Security agent |
| Announcements API | `app/api/announcements/` | **REMOVE** | Not needed for solo-seller v0 | None | Postgres | None | |

---

## UI Screens

| Screen | Path | Classification | Notes |
|---|---|---|---|
| Clerking / claim entry | `app/(protected)/clerking/` | **ADAPT** | Core screen; rename lot/paddle labels; add primary/backup claim toggle |
| Events list/edit | `app/(protected)/events/` | **ADAPT** | Rename "Event" → "Sale" in UI; hide BP rate |
| Lots list/edit | `app/(protected)/lots/` | **ADAPT** | Rename "Lot" → "Item" |
| Bidders list/edit | `app/(protected)/bidders/` | **ADAPT** | Rename "Bidder" → "Buyer"; "Paddle" → "Name/Handle" |
| Invoices | `app/(protected)/invoices/` | **ADAPT** | Rename "Invoice" → "Bundle"; hide BP line |
| Reports | `app/(protected)/reports/` | **ADAPT** | Rename columns; add estimated profit |
| Dashboard | `app/(protected)/dashboard/` | **ADAPT** | Minor label renames |
| Settings | `app/(protected)/settings/` | **ADAPT** | Remove consignor settings; keep sync, export, branding |
| Consignors | `app/(protected)/consignors/` | **REMOVE** | Not in v0 scope |
| Admin | `app/(protected)/admin/` | **REMOVE** | Not in v0 scope |
| Announcements | `app/(protected)/announcements/` | **REMOVE** | Not in v0 scope |

---

## External Services

| Service | Classification | Notes |
|---|---|---|
| Neon/Vercel Postgres | **KEEP UNCHANGED** | Required for auth + cloud sync; self-host with own DB URL |
| Resend (email) | **KEEP UNCHANGED** | Password reset, invite emails; own API key |
| Vercel Analytics | **REMOVE** | Remove `@vercel/analytics` import before pilot if telemetry not desired; otherwise disclose |
| HubSpot | **REMOVE** | Gated by env var; simply omit `HUBSPOT_ACCESS_TOKEN` in pilot deploy |
| Ably | **REMOVE** | Optional realtime; omit `NEXT_PUBLIC_ABLY_SYNC` env var for v0 |
| Vercel Cron | **ADAPT** | Monthly backup email cron — keep but update email template |

---

## Effort Summary

| Classification | Count | Aggregate Effort |
|---|---|---|
| KEEP UNCHANGED | 18 | 0 |
| ADAPT | 22 | ~4–6 days |
| REMOVE | 10 | ~0.5 days (delete + verify no imports) |
| WRAP | 0 | — |
| EXTRACT | 0 | — |
| REPLACE | 0 | — |
| UNKNOWN | 1 (account deletion) | TBD |

**Total estimated effort for Founder Class v0 terminology + workflow layer: 5–7 working days.**
