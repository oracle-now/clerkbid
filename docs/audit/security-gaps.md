# Security Gaps — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25  
**Status:** Static code inspection only. No penetration test performed.

---

## Severity Key

| Level | Meaning |
|---|---|
| 🔴 Critical | Must fix before inviting any user |
| 🟡 High | Fix before general availability; acceptable risk for private alpha with mitigations |
| 🟢 Medium | Fix before public launch |
| ⚪ Low | Monitor; not blocking |

---

## Gap 1: Vendor Scoping on Sync API Routes — 🔴 Critical (unverified)

**File:** `app/api/sync/push/route.ts`, `app/api/sync/event/route.ts`, `app/api/sync/list/route.ts`  
**Finding:** The `cloudSync.ts` client sends `eventSyncId` in the request body. The server must extract `vendor_id` from the authenticated session (not from the request body) and scope all Postgres queries to that `vendor_id`. This was **not confirmed by direct inspection of the route handler source** in this audit pass.  
**Risk:** If `vendor_id` is taken from the request body, any authenticated user could read or overwrite another vendor’s event snapshots by spoofing a `syncId`.  
**Mitigation before pilot:** Inspect `/api/sync/push/route.ts` and `/api/sync/event/route.ts`; confirm `vendor_id` is always read from `getServerSession()`, never from the request payload. Add a test.

---

## Gap 2: Admin Impersonation — 🔴 Critical (scope)

**File:** `db/migrate_admin_impersonation.sql`, `app/api/admin/`  
**Finding:** A super-admin impersonation migration exists. If applied, a super-admin session can act as any vendor. For a solo-seller private pilot, this capability creates an implicit privileged access path.  
**Risk:** If the impersonation migration is applied and `SUPER_ADMIN_EMAILS` is misconfigured, an operator could accidentally gain full access to all vendor data.  
**Mitigation:** Do not apply `migrate_admin_impersonation.sql` for the Founder Class v0 deployment. Confirm the migration has not been applied to the pilot Postgres instance. If it is required, add an explicit audit log.

---

## Gap 3: No Rate Limiting on `/api/register` or `/api/auth` — 🟡 High

**File:** `app/api/register/route.ts`, `app/api/auth/[...nextauth]/route.ts`  
**Finding:** No rate-limiting middleware detected in app code. Registration and login endpoints are open to brute-force and credential stuffing.  
**Mitigation:** For Vercel deployment: enable Vercel’s built-in DDoS protection and add an edge middleware rate limiter (e.g. `@upstash/ratelimit`). For other hosts: configure infra-level rate limiting (nginx, Cloudflare). Acceptable for private alpha with invite-only registration (disable public registration endpoint or add invite token requirement).

---

## Gap 4: Vercel Analytics Telemetry — 🟢 Medium

**File:** `app/layout.tsx` (inferred; `@vercel/analytics` imported)  
**Finding:** `@vercel/analytics` sends page-view and web-vitals data to Vercel’s servers for every visitor. This is passive telemetry but constitutes a third-party data processor.  
**Risk:** GDPR/CCPA disclosure obligation if EU/CA users are invited.  
**Mitigation:** Either (a) remove the `<Analytics />` component from `app/layout.tsx` before pilot, or (b) disclose in the privacy policy that Vercel collects anonymized performance data.

---

## Gap 5: HubSpot PII Transmission — 🟢 Medium (if env var set)

**File:** `lib/hubspot/`, `app/api/register/route.ts`  
**Finding:** If `HUBSPOT_ACCESS_TOKEN` is set, new user registration data (email, name, company) is sent to HubSpot CRM.  
**Mitigation:** Do not set `HUBSPOT_ACCESS_TOKEN` for the Founder Class v0 deployment. Confirm it is absent from the pilot `.env`.

---

## Gap 6: No CSRF Protection on Mutation API Routes — 🟢 Medium

**Finding:** Next.js App Router API routes do not automatically include CSRF protection. The sync routes (`POST /api/sync/push/`) rely on `credentials: 'include'` + same-origin session cookies. A cross-origin forged request from a malicious page could trigger a push if session cookies are not `SameSite=Strict`.  
**Mitigation:** Confirm `NextAuth` session cookie `sameSite` is set to `lax` or `strict` (default in NextAuth 4 is `lax`). For additional hardening, add a custom `Origin` header check in sync route handlers.

---

## Gap 7: bcryptjs (Pure JS) — ⚪ Low

**File:** `package.json` — `bcryptjs 2.4.3`  
**Finding:** Uses pure-JavaScript bcrypt implementation rather than native `bcrypt` (which requires native binaries). bcryptjs is slower per hash, which slightly weakens brute-force resistance at high iteration counts but eliminates binary dependency risks.  
**Assessment:** Acceptable for a web app with low registration volume. Not a blocker.

---

## Gap 8: Duplicate Primary Claim Invariant Not Enforced at Storage Layer — 🔴 Critical (domain)

**Finding:** The product invariant “an item cannot have two active primary claims” is not enforced by a Dexie unique index or a domain-layer guard in the current codebase. The `sales` table has no `isPrimary` field yet (to be added in PR-04). Until that PR lands and the guard is implemented, the invariant is only enforced by UI flow.  
**Risk:** Rapid double-submit or two-tab scenario could create two primary claims on the same item.  
**Mitigation:** PR-04 must add: (a) `isPrimary: boolean` and `isBackup: boolean` fields to `sales` schema, (b) a domain-layer check in the claim-entry handler before `db.sales.add()`, (c) a unit test for the duplicate-primary scenario.

---

## Gap 9: Local Data Loss on Browser Storage Clear — ⚪ Low (disclosure)

**Finding:** If a user clears browser storage (IndexedDB) while offline or before syncing, all local data is lost. Cloud snapshot is the only recovery path.  
**Mitigation:** Surface a clear warning in the UI: “Your data lives in this browser. Back up to cloud regularly.” Add this to onboarding for Founder Class sellers.

---

## Gap 10: No CI Pipeline — 🟡 High (operational)

**Finding:** No `.github/workflows/` directory. Tests are not automatically run on push or PR.  
**Risk:** Regressions introduced by any contributor will not be caught until manual testing.  
**Mitigation:** Add GitHub Actions workflow as part of PR-01 or PR-02. Minimum: `npm ci && npm test`.

---

## Summary Table

| # | Gap | Severity | Must Fix Before Pilot |
|---|---|---|---|
| 1 | Vendor scoping on sync routes (unverified) | 🔴 Critical | Yes |
| 2 | Admin impersonation migration | 🔴 Critical | Yes |
| 8 | Duplicate primary claim not enforced at storage | 🔴 Critical | Yes (PR-04) |
| 3 | No rate limiting on register/auth | 🟡 High | Mitigate (invite-only) |
| 10 | No CI pipeline | 🟡 High | Add in PR-01/02 |
| 4 | Vercel Analytics telemetry | 🟢 Medium | Disclose or remove |
| 5 | HubSpot PII (if env set) | 🟢 Medium | Omit env var |
| 6 | CSRF on mutation routes | 🟢 Medium | Verify SameSite cookie |
| 7 | bcryptjs pure JS | ⚪ Low | No action needed |
| 9 | Local storage clear = data loss | ⚪ Low | Disclose in UX |
