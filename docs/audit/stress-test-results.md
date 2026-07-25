# Stress Test Results — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25  
**⚠ IMPORTANT:** All results below are **static inferences from code inspection**. No live environment was started. No IndexedDB was exercised. No network calls were made. Per operating rules: a test is not claimed to have passed unless it was run.

---

## Test Status Key

| Status | Meaning |
|---|---|
| ✅ UNIT TEST EXISTS | A Vitest test covers this behavior; inferred to pass based on code |
| ⚠ STATIC INFERENCE | Behavior inferred from code; not executed |
| ❌ UNTESTED / GAP | No test found; behavior unknown without live run |
| 🚫 NOT APPLICABLE | Test category does not apply to this architecture |

---

## 1. Clean Installation and Production Build

| Status | ❌ UNTESTED |
|---|---|
| Expected | `npm ci && next build` completes without error |
| Evidence | Standard Next.js 14 + TypeScript 5.7 project; no exotic build plugins beyond `next-pwa` |
| Risk | `next-pwa` 5.6.0 has known compatibility quirks with Next.js 14; build may require `pwa: false` override in dev mode |
| Action | Run `npm ci && npm run build` on a clean Node 20 environment in PR-02 and record result |

---

## 2. Empty Database Startup

| Status | ⚠ STATIC INFERENCE |
|---|---|
| Expected | App loads; Dexie creates empty database; no crash; dashboard shows zero events |
| Evidence | `ensureSettingsRow(db)` in `lib/settings.ts` handles missing settings row; `db.events.toArray()` returns `[]` safely |
| Risk | Low — Dexie handles empty stores natively |

---

## 3. At Least 50 Items/Lots

| Status | ⚠ STATIC INFERENCE |
|---|---|
| Expected | All 50 lots visible in list; clerking navigation works across all |
| Evidence | Dexie `db.lots.where('eventId').equals(eventId)` is an indexed query; no in-memory limit detected |
| Risk | UI virtualization unknown — long list may render all DOM nodes if no virtual scroll is implemented |
| Action | Manual smoke test in PR-09 with 50 seeded items |

---

## 4. Rapid Repeated Sale Entry

| Status | ⚠ STATIC INFERENCE |
|---|---|
| Expected | Each submission creates exactly one sale record |
| Evidence | Form submit likely disabled on submit (common pattern); `db.sales.add()` is async |
| Risk | If submit button is not disabled during async write, rapid clicks create duplicate sales |
| Gap | No idempotency key or duplicate-submission guard confirmed at domain layer |
| Action | PR-04 must add `syncKey` dedup check: before `db.sales.add()`, check `db.sales.where('syncKey').equals(key).count()` |

---

## 5. Double-Click and Repeated Submission

| Status | ❌ UNTESTED |
|---|---|
| Expected | Second submission is silently dropped (idempotent) |
| Gap | See Gap #4 in `security-gaps.md` and Gap in trace #4 in `runtime-trace.md` |
| Action | PR-04 |

---

## 6. Two Tabs Modifying the Same Record

| Status | ❌ UNTESTED |
|---|---|
| Expected | Last write wins; no crash; data remains consistent |
| Evidence | Dexie does not provide optimistic locking; browser `storage` events fire across same-origin tabs |
| Risk | Medium — for a solo seller using one device, this is unlikely but possible (e.g. phone + laptop) |
| `saleFormOrder.ts` | Uses `window.dispatchEvent` + `localStorage` for pref sync across tabs — this part is handled |
| Action | Acceptable for private alpha solo-seller; add UI warning “Do not open two tabs” in onboarding |

---

## 7. Offline Creation and Editing

| Status | ⚠ STATIC INFERENCE |
|---|---|
| Expected | All Dexie writes succeed; sync calls fail quietly; outbox accumulates |
| Evidence | `pushAllLocalEvents` returns `serverUnavailable: true` on 503; local writes are not gated on network |
| Risk | Low — architecture is explicitly local-first |

---

## 8. Reconnection After Multiple Offline Writes

| Status | ✅ UNIT TEST EXISTS (partial) |
|---|---|
| Covered | `cloudSyncRefresh.test.ts` tests the “skip when fetch fails” and “refresh when server newer” decision paths |
| Covered | `snapshotMerge.test.ts` tests entity-level merge logic |
| Not covered | Full round-trip: offline writes → reconnect → push → pull → verify final state |
| Risk | Medium — merge logic is tested in isolation; integration scenario untested |

---

## 9. Interrupted Save

| Status | ⚠ STATIC INFERENCE |
|---|---|
| Expected | Dexie transaction rolls back; no partial record written |
| Evidence | `replaceEventFromPayload` and `importEventFromPayload` both use `db.transaction('rw', [...], async () => {...})` |
| Risk | Low — Dexie transactions are ACID within IndexedDB |

---

## 10. Failed Cloud Request

| Status | ✅ UNIT TEST EXISTS (partial) |
|---|---|
| Covered | `cloudSyncRefresh.test.ts` — `fetch_failed` reason path tested |
| Covered | `PushAllSummary.failCount` incremented; `serverUnavailable` set on 503 |
| Not covered | UI rendering of failure state (no UI test suite) |

---

## 11. Undo Followed by Redo or Correction

| Status | ❌ UNTESTED |
|---|---|
| Expected | After undo (sale delete), new sale can be entered for same lot |
| Evidence | `saleInvoiceEdits.ts` handles delete; lot is not locked after delete |
| Gap | No test for undo-then-re-claim sequence |
| Action | Add to PR-09 smoke test suite |

---

## 12. Invoice Regeneration After Sale Correction

| Status | ✅ UNIT TEST EXISTS |
|---|---|
| Covered | `invoiceLogic.test.ts` covers recalculation after sale line changes |
| Not covered | UI flow of remove-sale → add-corrected-sale → regenerate |

---

## 13. Export and Restore

| Status | ✅ UNIT TEST EXISTS |
|---|---|
| Covered | `dataPorter.test.ts` covers import round-trip for v1–v6 payloads |
| Not covered | Full export-to-file → re-import flow (requires browser `Blob` and `URL.createObjectURL`) |

---

## 14. Malformed Imported Data

| Status | ✅ UNIT TEST EXISTS (partial) |
|---|---|
| Covered | `csvImport.test.ts` — malformed CSV rows rejected with error messages |
| Covered | `parseEventExportPayload` throws on unknown export version and missing required arrays |
| Not covered | Malformed JSONB in cloud snapshot (server-side validation on push not inspected) |

---

## 15. Missing or Expired Authentication

| Status | ⚠ STATIC INFERENCE |
|---|---|
| Expected | `middleware.ts` redirects to `/login`; API routes return 401 |
| Evidence | NextAuth middleware pattern; `getServerSession()` used in API routes |
| Risk | Low — standard NextAuth behavior |

---

## 16. Unauthorized Access to Another Account’s Data

| Status | ❌ UNTESTED (critical gap) |
|---|---|
| Expected | Sync API routes reject requests for another vendor’s `syncId` |
| Evidence | Not confirmed — vendor scoping in route handlers not inspected |
| Risk | High — see `security-gaps.md` Gap #1 |
| Action | Must verify and test before pilot |

---

## 17. Mobile Viewport and Touch Operation

| Status | ❌ UNTESTED |
|---|---|
| Expected | Tailwind responsive classes provide mobile layout; touch events work natively |
| Evidence | Tailwind `sm:` breakpoints used in `saleFormOrder.ts` layout comments |
| Risk | Medium — clerking screen with many form fields may be cramped on small screens |
| Action | Manual smoke test on iOS Safari and Android Chrome in PR-09 |

---

## Summary

| Category | Status |
|---|---|
| Tests confirmed passing | 0 (no live run) |
| Unit tests inferred covering scenario | 6 |
| Static inferences (no test, code looks safe) | 5 |
| Confirmed untested gaps | 6 |
| Critical untested gaps (must fix before pilot) | 2 (vendor isolation, duplicate claim) |
