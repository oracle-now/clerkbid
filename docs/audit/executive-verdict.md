# Executive Verdict — ClerkBid Forensic Audit

**Audit date:** 2026-07-25  
**Auditor:** oracle-now (staff repository architect)  
**Source repository:** [AuctionMethod/clerkbid](https://github.com/AuctionMethod/clerkbid) @ `bf46dd5`  
**Target product:** Live Sale Clerk — Founder Class v0

---

## Decision: B — Vertical Fork

> Preserve the runtime (Next.js 14 + Dexie IndexedDB) and the cloud snapshot/sync stack for Founder Class v0, then reconsider broader architecture after pilot validation.

### Evidence

| Factor | Finding |
|---|---|
| License | MIT confirmed at root (`LICENSE`). No GPL/AGPL dependency detected. |
| Build | Standard `next build` / `npm` pipeline. No proprietary toolchain. |
| Local-first storage | Dexie v10 IndexedDB — fully offline-capable, no server required for reads/writes. |
| Cloud sync | Optional JSONB snapshot in Neon/Postgres. Bidirectional with entity-level merge. Can be self-hosted. |
| Domain fit | `Lot/Bidder/Sale/Invoice/Event` map directly to `Item/Buyer/Claim/Bundle/Sale` with terminology rename only. |
| Independent deploy | Confirmed: no hardcoded AuctionMethod backend. Own Neon + NextAuth + Resend = fully independent. |
| Test coverage | 15+ unit test files covering invoice logic, snapshot merge, CSV import/export, lot parsing. |
| Existing data | Export version 6 with backward-compat to v1. Full JSON export/restore built in. |
| Auction coupling | Screens use `lot`, `bidder`, `paddle` terminology throughout UI — rename layer required but no logic rewrite. |

### Veto Conditions Checked

- [x] **License blocker** — None. MIT license is clean.
- [x] **Backend lock-in** — None detected. All sync routes are relative (`/api/sync/...`).
- [x] **Data isolation** — Auth scopes by `vendor_id` in Postgres; Dexie scoped by `userId`. Verify API route vendor scoping before inviting users.
- [x] **Irreplaceable proprietary dependency** — None. All deps are open-source or optional SaaS.
- [ ] **Admin impersonation table** — `db/migrate_admin_impersonation.sql` exists. Must confirm it is not applied or is scoped before multi-user pilot. *(Open question — see `open-questions.md`)*
- [ ] **`hs-fields/` and `terms/` content ownership** — May contain AuctionMethod-proprietary copy. Replace before any public-facing deployment.

### Confidence Level

**High (8/10)** — All critical files were inspected at source. Stress tests are static inferences, not live execution. Confidence would reach 9/10 after a successful clean `npm install && next build` on a CI runner.

---

## Deliverables

### Day-5
- Audit documents committed to `audit/clerkbid-forensic-2026-07` branch (this PR)
- Independent deploy scaffold: own `.env` verified, Neon schema applied, registration flow smoke-tested
- `open-questions.md` answers collected from decision owner

### Day-10
- PR-03 merged: UI terminology rename (Lot→Item, Bidder→Buyer, Sale→Claim, Event→Sale, Paddle→Name)
- PR-04 merged: claim workflow additions (primary claim, backup claim, backup promotion)
- PR-05 merged: sale-order screen + bundle grouping view

### Day-15 — Founder-Class v0 Deliverable
- PR-06 merged: payment status + pack/find screen
- PR-07 merged: export (sale summary + estimated profit CSV)
- PR-08 merged: Whatnot channel label (UI label only, no API)
- PR-09 merged: Founder Class smoke test suite
- Private pilot URL live, invite link ready for first 3–5 sellers

---

## Critical Path

```
PR-01 (audit) → PR-02 (deploy scaffold)
                     ↓
               open-questions resolved
                     ↓
              PR-03 (terminology rename)
                     ↓
              PR-04 (claim workflow)
                     ↓
         PR-05 (order + bundle) ──┐
         PR-06 (payment + pack)  ─┤→ PR-07 (export) → PR-08 (channel label) → PR-09 (tests)
```

No step can safely be parallelized until PR-03 (terminology) is merged, because downstream components import UI label constants.

---

## PR Sequence

| PR | Title | Branch | Day |
|---|---|---|---|
| PR-01 | Forensic audit documents | `audit/clerkbid-forensic-2026-07` | 1 |
| PR-02 | Independent deploy scaffold + env verification | `feat/deploy-scaffold` | 3 |
| PR-03 | UI terminology rename (Lot→Item etc.) | `feat/terminology-rename` | 5 |
| PR-04 | Claim workflow: primary + backup claim fields | `feat/claim-workflow` | 7 |
| PR-05 | Sale order + bundle grouping screen | `feat/sale-order-bundle` | 9 |
| PR-06 | Payment status + pack/find screen | `feat/payment-pack` | 11 |
| PR-07 | Export: sale summary + estimated profit CSV | `feat/export-csv` | 12 |
| PR-08 | Whatnot channel label (UI only) | `feat/whatnot-label` | 13 |
| PR-09 | Founder Class v0 smoke tests | `feat/founder-smoke-tests` | 15 |

---

## File Ownership Boundaries (for future agents)

| Boundary | Owner agent |
|---|---|
| `lib/db.ts`, `lib/dexie/` | Persistence agent — no changes without migration version bump |
| `lib/services/cloudSync.ts`, `lib/services/snapshotMerge.ts` | Sync agent — no changes without sync regression test |
| `lib/services/invoiceLogic.ts`, `lib/services/dataPorter.ts` | Finance/export agent |
| `lib/clerking/` | Claim workflow agent |
| `app/(protected)/clerking/` | UI agent — safe to rename labels |
| `db/*.sql` | Migration agent — append only, never modify applied migrations |
| `docs/audit/` | Audit agent — this directory |

---

## Risks Accepted for Private Alpha

- Stress tests are static inferences only (no live build executed in audit).
- Two-tab conflict behavior is not covered by existing unit tests — race condition possible but unlikely for solo seller.
- `@vercel/analytics` sends page telemetry to Vercel; acceptable for private pilot, must disclose in terms.
- Ably realtime nudge is optional and gated by `NEXT_PUBLIC_ABLY_SYNC`; leaving disabled for v0 is safe.

## Risks That Must Be Fixed Before Inviting Users

1. **Vendor scoping on sync API routes** — confirm `/api/sync/push`, `/api/sync/event`, `/api/sync/list` enforce `vendor_id` from session, not from request body.
2. **Admin impersonation** — confirm `migrate_admin_impersonation.sql` is not applied, or add explicit guard that impersonation cannot cross vendor boundaries.
3. **`terms/` content** — replace AuctionMethod legal copy with Live Sale Clerk terms before any user-facing registration page is live.
4. **`hs-fields/` directory** — audit and remove or replace before public repo or deployment if it contains proprietary HubSpot schema definitions.
5. **Rate limiting on `/api/register`** — add host-level or middleware rate limiting before opening registration.
