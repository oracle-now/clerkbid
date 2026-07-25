# Repository Map — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5bb82077e6fc1282376ba0984066395532`  
**Inspection date:** 2026-07-25

---

## Stack Summary

| Dimension | Value | Source |
|---|---|---|
| Framework | Next.js 14.2.21 (App Router) | `package.json` |
| Language | TypeScript 5.7.2 | `package.json` |
| Package manager | npm (lockfile v3) | `package-lock.json` |
| Runtime target | Node 20 (inferred from `@types/node ^20`) | `package.json` |
| CSS | Tailwind CSS 3.4.16 | `package.json` |
| Local storage | Dexie 4.0.10 (IndexedDB wrapper) | `package.json` |
| Auth | NextAuth 4.24.11 (credentials provider) | `package.json`, `middleware.ts` |
| Cloud DB | @vercel/postgres 0.10.0 (Neon) | `package.json`, `.env.example` |
| Realtime (optional) | Ably 2.21.0 | `package.json`, `.env.example` |
| PDF generation | jsPDF 2.5.2 + jspdf-autotable 3.8.4 | `package.json` |
| Email | Resend (via fetch, not SDK) | `.env.example`, `lib/email/` |
| CRM (optional) | HubSpot Private App | `.env.example`, `lib/hubspot/` |
| Telemetry | @vercel/analytics 2.0.1 | `package.json` |
| Test runner | Vitest 2.1.8 | `package.json`, `vitest.config.ts` |
| PWA | next-pwa 5.6.0 | `package.json`, `next.config.js` |
| Deployment | Vercel (vercel.json present) | `vercel.json` |

---

## Root Directory

```
/
├── .env.example            # All required/optional env vars documented
├── .eslintrc.json          # Extends next/core-web-vitals
├── .gitignore
├── AUCTION_MANAGER_PWA_SPEC.md  # Original product spec (38 KB)
├── LICENSE                 # MIT — Copyright (c) 2026 AuctionMethod, Inc.
├── middleware.ts            # NextAuth route guard; super-admin gate
├── next-env.d.ts
├── next.config.js          # PWA config via next-pwa; no custom webpack
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json           # paths alias: @/ → root
├── vercel.json             # cron: /api/cron/backup-email/ monthly
├── vitest.config.ts        # jsdom environment; fake-indexeddb
├── app/                    # Next.js App Router
├── components/             # Shared React components
├── db/                     # SQL schema + migration scripts
├── docs/                   # Documentation (this audit lives here)
├── hs-fields/              # HubSpot field definitions (⚠ ownership unclear)
├── lib/                    # Domain logic, services, utilities
├── public/                 # Static assets, PWA icons, offline.html
├── terms/                  # Legal copy (⚠ AuctionMethod-authored)
└── types/                  # Global TypeScript declarations
```

---

## `app/` — Next.js App Router

```
app/
├── globals.css
├── layout.tsx              # Root layout; SessionProvider; Vercel Analytics
├── providers.tsx           # SessionProvider wrapper
├── (protected)/            # Auth-gated routes (middleware enforces token)
│   ├── layout.tsx
│   ├── ProtectedShell.tsx  # Nav shell; DB init; legacy migration trigger
│   ├── admin/              # Super-admin panel (vendor list, impersonation, announcements)
│   ├── announcements/      # Global announcement message center
│   ├── bidders/            # Bidder CRUD (list, add, edit, import CSV)
│   ├── clerking/           # ★ Core: sale entry form, lot navigation, pass-out
│   ├── consignors/         # Consignor CRUD + CSV import
│   ├── dashboard/          # Event switcher + summary cards
│   ├── events/             # Event CRUD
│   ├── help/               # Markdown help pages
│   ├── invoices/           # Invoice list, view, edit, PDF download
│   ├── lots/               # Lot CRUD + CSV import
│   ├── reports/            # Sale/commission/accounting reports + CSV export
│   └── settings/           # User settings, branding, sync, data export/import
└── (public)/               # Unauthenticated routes
    ├── login/
    ├── register/
    ├── forgot-password/
    ├── reset-password/
    ├── feedback/
    ├── user-agreement/
    └── privacy-policy/
```

### `app/api/` — API Routes

```
app/api/
├── ably/           # Token endpoint for Ably realtime (optional)
├── admin/          # Super-admin: vendor list, revert, impersonation
├── announcements/  # Read/dismiss global announcements
├── auth/           # NextAuth [...nextauth] handler
├── cron/           # Vercel cron: monthly backup-email
├── feedback/       # Submit feedback → Resend email
├── invite/         # Accept vendor invite token
├── org/            # Org settings read/update
├── register/       # New vendor + user creation
└── sync/           # Cloud snapshot: list, push, pull, delete, op-log
```

---

## `db/` — Database Migrations

```
db/
├── schema.sql                      # Baseline Postgres schema (vendors, users, snapshots, op-log)
├── migrate_users_first_last.sql    # Add first_name/last_name columns
├── migrate_password_reset.sql      # Add password_reset_tokens table
├── migrate_cloud_sync.sql          # Add event_cloud_snapshots + user_sync_preferences
├── migrate_event_sync_ops.sql      # Add event_sync_ops op-log table
├── migrate_admin_impersonation.sql # ⚠ Add impersonation capability to super-admin
├── migrate_multi_user_org.sql      # Add vendor_invites + org_role to users
└── migrate_global_announcements.sql # Add global_announcements + toast-shown tracking
```

**Note:** Migrations are plain SQL files applied manually. No migration runner (e.g. Prisma Migrate, Flyway) is present. Order of application must be inferred from file content. `schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`).

---

## `lib/` — Domain Logic and Services

```
lib/
├── db.ts                   # ★ AuctionDB Dexie class (v10 schema), all entity interfaces
├── clerkFormPrefs.ts       # Clerk initials preference (localStorage)
├── displayPrefs.ts         # Display preferences (localStorage)
├── saleFormOrder.ts        # ★ Sale form field order/required prefs (localStorage)
├── settings.ts             # AppSettings row helpers
├── ably/                   # Ably WebSocket client (optional)
├── admin/                  # Super-admin helpers
├── announcements/          # Announcement fetch + dismiss logic
├── auth/                   # NextAuth options, secret resolver, super-admin check
├── db/
│   ├── parentEventTouchHooks.ts  # Dexie hooks: touch event.updatedAt on child writes
│   └── syncApplyGuard.ts         # Mutex guard: suppresses redundant sync triggers during apply
├── dexie/
│   └── liveQueryGuard.ts         # SSR guard for useLiveQuery
├── email/                  # Resend email helpers (password reset, invite, backup)
├── help/                   # Help content loader
├── hooks/                  # React hooks (useAuctionDB, useCurrentEvent, etc.)
├── hubspot/                # HubSpot CRM sync on registration (optional)
├── services/
│   ├── accountingCsv.ts         # Accounting CSV export logic
│   ├── cloudDeleteTombstone.ts  # Mark cloud syncId as locally deleted
│   ├── cloudSync.ts             # ★ Push/pull/merge snapshot orchestration
│   ├── consignorAttribution.ts  # Attribute sales to consignor
│   ├── consignorCommission.ts   # Commission calculation
│   ├── consignorStatementPdf.ts # Consignor statement PDF (jsPDF)
│   ├── csvExporter.ts           # Generic CSV download helper
│   ├── csvImport*.ts            # CSV import for bidders, lots, consignors
│   ├── csvParse.ts              # CSV row parser
│   ├── dataPorter.ts            # ★ JSON export/import/replace (versioned, v1–v6)
│   ├── eventService.ts          # Event CRUD helpers
│   ├── invoiceBranding.ts       # Logo/footer resolution for invoices
│   ├── invoiceLogic.ts          # ★ Invoice generation, totals, BP, tax, manual lines
│   ├── invoicePdf.ts            # Invoice PDF (jsPDF)
│   ├── listPdfs.ts              # Lot list PDF
│   ├── opSyncClient.ts          # Op-level sync client (push outbox, pull ops)
│   ├── reportCalculator.ts      # Sale/commission report aggregation
│   ├── saleInvoiceEdits.ts      # Undo sale, move sale between invoices
│   ├── saleLineTotals.ts        # Per-line hammer + quantity totals
│   └── snapshotMerge.ts         # ★ Entity-level bidirectional merge
├── sync/
│   ├── ops/                     # Op-type definitions for op-log sync
│   └── syncOpsFlag.ts           # Feature flag: NEXT_PUBLIC_SYNC_OPS env check
└── utils/                  # clientSyncKey, coerceDate, constants, syncId, etc.
```

---

## `components/` — Shared React Components

Not fully enumerated in this audit pass. Contains UI primitives (buttons, modals, inputs), nav components, sync status indicators, and invoice preview. All are React client components using Tailwind.

---

## `types/` — Global TypeScript Declarations

Global type augmentations for NextAuth session (vendor_id, org_role, super-admin flag) and any module declarations.

---

## Test Files (confirmed present)

| File | Subject |
|---|---|
| `lib/saleFormOrder.test.ts` | Sale field order normalization and invariants |
| `lib/clerking/findLotByBaseSuffix.test.ts` | Lot lookup by base+suffix |
| `lib/clerking/lotParse.test.ts` | Lot number parsing |
| `lib/clerking/nextBaseLot.test.ts` | Next lot number autoadvance |
| `lib/services/accountingCsv.test.ts` | Accounting CSV export |
| `lib/services/cloudDeleteTombstone.test.ts` | Cloud tombstone logic |
| `lib/services/cloudSyncRefresh.test.ts` | Sync refresh decision logic |
| `lib/services/consignorCommission.test.ts` | Commission calculation |
| `lib/services/csvImport.test.ts` | CSV import validation |
| `lib/services/dataPorter.test.ts` | Export/import round-trip |
| `lib/services/invoiceBranding.test.ts` | Invoice branding resolution |
| `lib/services/invoiceLogic.test.ts` | Invoice totals + BP + tax + manual lines |
| `lib/services/reportCalculator.test.ts` | Report aggregation |
| `lib/services/saleLineTotals.test.ts` | Per-line totals |
| `lib/services/snapshotMerge.test.ts` | Bidirectional entity merge |

**Total confirmed test files:** 15  
**Test runner:** Vitest 2.1.8 with `jsdom` + `fake-indexeddb`

---

## Notable Absent Files

- No `Dockerfile`
- No `docker-compose.yml`
- No CI workflow (`.github/workflows/`) — **no automated test pipeline confirmed**
- No Prisma schema (raw SQL migrations only)
- No Storybook
- No E2E test suite (Playwright, Cypress)
- No `CHANGELOG.md`
- No `CONTRIBUTING.md`
