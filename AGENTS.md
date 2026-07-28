# AGENTS.md — Live Sale Clerk · Founder Class v0

> **Precedence:** This file takes precedence over all candidate proposals,
> extension-point audits, and implementation suggestions recorded elsewhere
> in this repository. No implementation PR may begin without an
> `AGENTS.md`-compliant scope declaration.

---

## Application Foundation

**ClerkBid is the system of record.**

All persistent state lives in ClerkBid's Dexie database and cloud-sync
backend. No external automation tool, messaging platform, or workflow
orchestrator is a system of record.

---

## Primary Users

| User | Context |
|---|---|
| Facebook group claim-sale sellers | Run live-video sales in Facebook groups; buyers claim items by commenting; seller confirms owner manually |
| Whatnot sellers | Run live drops on Whatnot; completed purchases are available in Whatnot's seller dashboard |

The MVP serves founders operating solo or with one assistant. No multi-staff
workflow complexity is in scope for v0.

---

## Scoped Pain — What This MVP Solves

1. **Ownership confirmation** — ensure each sold item has exactly one
   seller-confirmed owner per sale event.
2. **Ordered backup preservation** — preserve the ordered Facebook NIL/NEXT
   backup queue so the seller can promote the correct next buyer if the
   primary claim falls through.
3. **Buyer Bundle grouping** — group all confirmed purchases for a single
   buyer into one Invoice (Buyer Bundle) that drives fulfillment.

---

## Domain Rules

These rules are invariants. They are not guidelines. Any implementation that
violates them must be rejected regardless of convenience.

| # | Rule |
|---|---|
| DR-1 | A backup or NIL claim is **not** a Sale. |
| DR-2 | A backup claim **cannot** enter an Invoice. |
| DR-3 | One unique item has **at most one confirmed owner** per sale event. |
| DR-4 | **Seller confirmation is authoritative.** No automation may confirm ownership on the seller's behalf. |
| DR-5 | Invoice is the **Buyer Bundle foundation**. All confirmed sales for a buyer are grouped into an Invoice before fulfillment. |
| DR-6 | **Facebook and Whatnot use separate intake workflows.** They share the downstream Buyer Bundle and fulfillment core but have distinct pre-confirmation paths. |
| DR-7 | **n8n is not a system of record.** Workflow automation may trigger, notify, or read — it must not write or mutate ClerkBid data. |
| DR-8 | **Claim position is seller-determined.** The seller assigns or confirms backup position. First entered in the system is not automatically first commenter; entry order must not be used as a proxy for comment order without explicit seller confirmation. |

---

## Do Not Build for MVP

The following are explicitly **out of scope** for Founder Class v0. Any PR
that introduces these must be rejected at review.

- Facebook scraping or autonomous posting
- Whatnot browser automation
- Whatnot CSV import (conditional: blocked until a real redacted Whatnot
  livestream-report CSV is inspected and an import-contract ADR is accepted
  — see `docs/audit/copilot-reuse-matrix.md §3.1`)
- PayPal or Venmo integration
- n8n dependency (n8n must not be a required runtime component)
- AI claim parsing (claims are entered manually by the seller or assistant)
- Repost automation
- Cost basis or profit reporting
- Shipping label generation
- Cross-listing to other platforms
- Public signup / self-serve registration
- Storage, authentication, or sync rewrites
- Complete inventory management

---

## Permitted Scope for Implementation PRs

Implementation PRs may only touch the areas listed in `docs/MVP.md §4`
(MVP States) and the PR sequence in `docs/audit/implementation-plan.md`,
subject to the exclusions above.

**Documentation-only PRs** (no source changes) may be opened at any time.

**Schema changes** require a design ADR to be accepted before the
implementation PR is opened. Each schema-changing PR carries its own Dexie
version bump; version numbers are not pre-reserved.

---

## Stop Conditions

An agent or reviewer must **stop all work and escalate** if any of the
following conditions is proven (not suspected):

| Condition | Action |
|---|---|
| Proven data loss | Halt. Do not merge. File incident report. |
| Proven cross-vendor data exposure | Halt. Do not merge. File security report. |
| Authentication bypass | Halt. Do not merge. File security report. |
| Failed build or failed deployment | Halt. Do not merge. Fix or revert. |
| Inability to export or restore operational records | Halt. Do not merge. |

All other issues — UI imperfection, missing features, suboptimal UX,
non-critical bugs — are addressed in subsequent PRs and do **not** halt
work.

---

## What Agents May Not Do

- Modify application source code, tests, dependencies, schemas, CI
  configuration, authentication, synchronization, or deployment files
  without an accepted scope declaration in the opening PR description.
- Confirm item ownership on behalf of a seller.
- Write to ClerkBid's database from an external automation tool.
- Merge a PR that violates a domain rule (DR-1 through DR-8).
- Proceed past a Stop Condition.

---

## Reference Documents

| Document | Role |
|---|---|
| `docs/MVP.md` | MVP scope, intake workflows, success criteria, release gates, open ADRs |
| `docs/audit/executive-verdict.md` | Fork decision, pilot timeline, confidence levels |
| `docs/audit/domain-fit.md` | Entity mapping, new fields required, invariant gap table |
| `docs/audit/reuse-matrix.md` | Module-level KEEP/ADAPT/WRAP/EXTRACT/REPLACE/REMOVE decisions |
| `docs/audit/copilot-reuse-matrix.md` | Copilot → ClerkBid reuse matrix; Whatnot import contract blocker (§3.1); Facebook claim-sale gap (§6); buyer model recommendation (§7) |
| `docs/audit/mvp-extension-points.md` | Candidate extension points (not implementation authorization) |
| `docs/audit/implementation-plan.md` | PR sequence, file ownership, accepted risks |
| `docs/audit/open-questions.md` | Blocking questions, decision owners, resolution tracker |
| `docs/audit/security-gaps.md` | 3 Critical / 2 High / 3 Medium / 2 Low gaps; veto risks |
