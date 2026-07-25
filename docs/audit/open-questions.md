# Open Questions — AuctionMethod/clerkbid Forensic Audit

**Audit date:** 2026-07-25  
**Status:** Requires human decision before PR-03 and beyond can proceed.

---

## How to Use This Document

Each question has:
- A **blocking PR** — the first PR that cannot safely proceed without an answer
- A **decision owner** — the person or role who can answer it
- A **default if unanswered** — the safe fallback assumed in the implementation plan

---

## Q1: Vendor Scoping Confirmation

**Question:** Do `/api/sync/push/route.ts` and `/api/sync/event/route.ts` extract `vendor_id` exclusively from the authenticated session (`getServerSession()`), never from the request body?

**Blocking PR:** PR-02  
**Decision owner:** Security agent / Jacquelyn  
**Default if unanswered:** Treat as unverified; do not open pilot registration until confirmed.  
**Action:** Inspect the two route handler files directly and record the answer in `security-gaps.md` Gap #1.

---

## Q2: Admin Impersonation Migration — Applied or Not?

**Question:** Has `db/migrate_admin_impersonation.sql` been applied to the AuctionMethod production database? And will it be applied to the Live Sale Clerk pilot Postgres instance?

**Blocking PR:** PR-02  
**Decision owner:** Jacquelyn (database operator)  
**Default if unanswered:** Do not apply; treat impersonation as disabled for v0.  
**Action:** Check the pilot Neon database for the existence of the `admin_impersonation_tokens` table (or equivalent). If present, confirm it is not reachable without super-admin session.

---

## Q3: `hs-fields/` Directory — Licensing and Removal

**Question:** Does the `hs-fields/` directory contain AuctionMethod-proprietary HubSpot portal schema definitions that cannot be redistributed? Or are these auto-generated scaffolding files safe to include?

**Blocking PR:** PR-03 (directory will be deleted in this PR)  
**Decision owner:** Jacquelyn  
**Default if unanswered:** Delete the directory. It has no runtime function in Live Sale Clerk v0.  
**Action:** Review directory contents; confirm deletion is safe.

---

## Q4: `terms/` Content — Replace Before Any User Sees the App?

**Question:** The `terms/` directory contains what appears to be AuctionMethod-authored user agreement and privacy policy text. Should this be replaced with Live Sale Clerk-specific legal copy before PR-03 merges, or can placeholder copy be used for the private pilot?

**Blocking PR:** PR-03  
**Decision owner:** Jacquelyn  
**Default if unanswered:** Use clearly marked placeholder text (`[LIVE SALE CLERK LEGAL COPY — TODO]`) for the private alpha; replace before any public or paid access.  
**Action:** Provide replacement legal copy or confirm placeholder is acceptable for private alpha.

---

## Q5: Ably Realtime — Disable Entirely for v0?

**Question:** Ably is used to nudge devices to pull a fresh cloud snapshot when another device pushes. For a solo seller using one device, this nudge is unnecessary. Should the Ably dependency be removed from `package.json` entirely for v0, or left in but disabled via the `NEXT_PUBLIC_ABLY_SYNC` env var (omitted from `.env`)?

**Blocking PR:** PR-02  
**Decision owner:** Jacquelyn  
**Default if unanswered:** Leave in `package.json` but disable by omitting env var. Removing the package saves ~150 KB from the bundle but requires removing the import from `lib/ably/` and `app/api/ably/`.  
**Action:** Decide: omit env var (easy) vs. remove package (cleaner bundle).

---

## Q6: Deployment Target — Vercel or Other?

**Question:** Is the Founder Class v0 pilot deploying to Vercel (where `vercel.json` is already configured and the monthly backup-email cron works natively), or to a different host?

**Blocking PR:** PR-02  
**Decision owner:** Jacquelyn  
**Default if unanswered:** Deploy to Vercel. `vercel.json` is present and the project is Vercel-native.  
**Note:** Per audit scope constraints, Railway is explicitly excluded as a requirement. Any Next.js-compatible host works.

---

## Q7: Existing ClerkBid Users — Migrate or Clean Slate?

**Question:** Are any existing ClerkBid user accounts (if any exist on a shared AuctionMethod instance) expected to have their data migrated to the Live Sale Clerk pilot instance? Or is Founder Class v0 a completely new registration with no data migration?

**Blocking PR:** PR-02  
**Decision owner:** Jacquelyn  
**Default if unanswered:** Clean slate. New Postgres database; new user registrations only. Existing users can export their data from ClerkBid as a JSON file and re-import into Live Sale Clerk after registration.  
**Note:** The export/import path already supports v1–v6 payloads; migrated data will receive v11 defaults via the upgrade hook.

---

## Q8: `@vercel/analytics` — Remove or Disclose?

**Question:** Should `@vercel/analytics` be removed from `app/layout.tsx` before the pilot, or disclosed in the privacy policy and retained for performance monitoring?

**Blocking PR:** PR-03  
**Decision owner:** Jacquelyn  
**Default if unanswered:** Retain and disclose. Add one sentence to the privacy policy placeholder: “We use Vercel Analytics to collect anonymized, aggregated performance data. No personally identifiable information is collected.”

---

## Q9: Consignor — Fully Remove or Hide?

**Question:** The consignor module (`app/(protected)/consignors/`, `lib/services/consignorAttribution.ts`, `lib/services/consignorCommission.ts`) is classified as REMOVE for Founder Class v0. Should these files be deleted from the fork, or hidden via navigation/routing only (leaving the code in place for potential v1 use)?

**Blocking PR:** PR-03  
**Decision owner:** Jacquelyn  
**Default if unanswered:** Hide via navigation (remove from nav menu and default routes). Do not delete code. This preserves the option to re-enable consignor features in v1 without a code restore.  
**Note:** The `consignors` Dexie table is retained in the schema (no data is deleted). Existing export/import paths continue to work.

---

## Q10: Whatnot Channel — Fixed List or Free Text?

**Question:** For the `channel` field on items (PR-08), should the UI present a fixed dropdown (`["", "Whatnot", "Facebook", "Other"]`) or a free-text input?

**Blocking PR:** PR-08  
**Decision owner:** Jacquelyn (product decision)  
**Default if unanswered:** Fixed dropdown with `Other` option. Simpler UX for solo sellers; avoids typo variants of the same channel name in reports.  

---

## Resolution Tracker

| Q# | Question | Resolved? | Answer | Date |
|---|---|---|---|---|
| Q1 | Vendor scoping confirmed | ❌ | | |
| Q2 | Admin impersonation migration status | ❌ | | |
| Q3 | `hs-fields/` safe to delete | ❌ | | |
| Q4 | `terms/` placeholder acceptable for alpha | ❌ | | |
| Q5 | Ably: omit env var vs. remove package | ❌ | | |
| Q6 | Deployment target | ❌ | | |
| Q7 | Existing users: migrate or clean slate | ❌ | | |
| Q8 | Analytics: remove or disclose | ❌ | | |
| Q9 | Consignor: delete or hide | ❌ | | |
| Q10 | Whatnot channel: dropdown or free text | ❌ | | |
