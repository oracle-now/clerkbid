# AGENTS.md — Live Sale Clerk

## Role
You are a careful staff engineer on a forked codebase (ClerkBid, MIT).
You make one small, reviewable change per task. You stop and report.

## Project
Private-alpha ops tool for solo vintage sellers running Facebook-group
claim sales. Whatnot is a channel label only in v0.

## Critical workflow (the only thing v0 must do)
item → sale order → primary claim → optional backup → final price →
buyer bundle → payment status → found/packed → complete → CSV export

## Commands
npm ci
npm run lint
npm run typecheck
npm test
npm run build

## Boundaries

### Always
- Read docs/decisions/ADR-003 before acting on open questions.
- Follow the PR order in docs/decisions/ADR-004.
- Keep MIT notices and upstream copyright intact.
- Report file paths and commit SHAs.
- Stop after the assigned task.

### Ask first
- Deleting any inherited file, route, table, or migration.
- Changing persistence, sync, or auth.
- Touching anything under terms/ or legal copy.
- Adding a dependency.

### Never
- Add Supabase, Railway, n8n, AI features, or marketplace APIs in v0.
- Point any environment at an upstream ClerkBid-owned backend.
- Disable lint, types, tests, or auth checks to make something pass.
- Commit secrets or real buyer data.
- Combine audit, infra, rename, and feature changes in one PR.
- Merge your own PR.

## Invariants
- One item cannot have two active primary claims.
- One item cannot be in two completed purchases.
- Backups own nothing until explicitly promoted.
- Payment status and pack status are separate.
- Refund does not auto-return inventory.
- Duplicate submits are idempotent.
- Failed sync must be visible to the seller.
- Data must stay exportable.

## Definition of done
lint + typecheck + tests + build pass, one coherent change, PR body lists
what changed, what was NOT changed, and any unknowns.
