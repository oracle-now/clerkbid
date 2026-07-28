# Copilot → ClerkBid Reuse Matrix

> **STATUS: REUSE AUDIT — NOT IMPLEMENTATION AUTHORIZATION**
>
> ClerkBid is the application foundation.
> Repositories will not be merged wholesale.
> `docs/MVP.md` and accepted ADRs control product scope.
> Candidate reuse findings require separate approval before any code moves.

**Audit date:** 2026-07-28
**Auditor:** AI-assisted inspection — no code modified in either repository
**Source repos:**
- `oracle-now/whatnot-ops-copilot` (Showrunner) — Python / FastAPI / Playwright
- `oracle-now/clerkbid` — Next.js 14 / React 18 / TypeScript

**Scoped MVP pain point:** Help Facebook claim-sale sellers and Whatnot sellers resolve item ownership, group purchases by buyer, track payment where applicable, and move buyer bundles through fulfillment.

---

## 1. Repository Framework & Storage Architecture

### 1.1 whatnot-ops-copilot (Showrunner)

| Layer | Technology |
|---|---|
| Language | Python 3 |
| HTTP framework | FastAPI (`app.py`) |
| Background jobs | `worker.py` — in-process long-poll tasks, shared in-memory state |
| Browser automation | Playwright (primary, `agent_master_staff_hardened.py`); Skyvern vision-loop (`skyvern_client.py`) as fallback |
| Storage | Single-file SQLite (`data/showrunner.db`); file-based session state (`data/sessions/`); Playwright auth JSON (`.playwright/whatnot-auth.json`) at runtime only — see §8 |
| Auth | Custom magic-link; in-memory token dict; session cookie |
| Email | `resend` SDK |
| Error tracking | Sentry SDK (FastAPI integration) |
| Deploy | Railway (`railway.json` + `docker-compose.yml`) |
| Frontend | Two self-contained static HTML files (`dashboard.html`, `index.html`) served by `app.py` |
| Test framework | `pytest` (pure-logic suite, zero network/browser dependencies) |

Storage model is **single-user, single-process, single-file**. There is no multi-tenancy; all data lives in one SQLite DB scoped to the running process. Sessions are stored as JSON files on disk.

### 1.2 clerkbid

| Layer | Technology |
|---|---|
| Language | TypeScript (strict) |
| Framework | Next.js 14 (App Router), React 18 |
| Auth | `next-auth` v4 — password-based, `bcryptjs`, invite-token org onboarding |
| Server-side DB | Neon (Vercel Postgres) — users, vendors, invites, cloud snapshots, op-log |
| Client-side DB | Dexie v4 (IndexedDB, per-user DB `ClerkBid_u_<userId>`) — events, bidders, lots, sales, invoices, consignors, sync outbox |
| Realtime | Ably v2 (pub/sub for cross-device sync) |
| Offline-first | Dexie + `dexie-react-hooks` (`useLiveQuery`); local-first with cloud push/pull via `event_cloud_snapshots` + `event_sync_ops` op-log |
| PDF | `jspdf` + `jspdf-autotable` |
| Styling | Tailwind CSS v3 |
| Deploy | Vercel |
| Test framework | Vitest + jsdom + `fake-indexeddb` |

Storage is **multi-tenant (vendor/org-scoped)** on the server side and **per-user local-first** on the client via Dexie IndexedDB. The `event_sync_ops` op-log enables multi-device / multi-user collaborative sync.

---

## 2. Module Classification Matrix

### 2.1 Core Logic

| Module | File | Verdict |
|---|---|---|
| Order parsing & field extraction | `parser.py` — `parse_row`, `ParsedOrder` | **CANDIDATE FOR SELECTIVE PORT** — see §3.1 |
| Buyer grouping | `parser.py` — `group_buyers` | **CANDIDATE FOR SELECTIVE PORT** — see §3.2 |
| Bundle detection with time-window clustering | `agent_master_staff_hardened.py` — `detect_bundles` et al. | **KEEP AS RESEARCH — NOT AUTHORITATIVE FOR MVP** — see §3.3 |
| Price normalization (`_parse_price_to_cents`) | `agent_master_staff_hardened.py` | **CANDIDATE FOR SELECTIVE PORT** — see §3.4 |
| Buyer key derivation (`_make_buyer_key`) | `agent_master_staff_hardened.py` | **CANDIDATE FOR SELECTIVE PORT** — see §3.5 |
| Order normalization (`normalize_orders`, `RawOrder`, `Order`) | `agent_master_staff_hardened.py` | **CANDIDATE FOR SELECTIVE PORT** — see §3.6 |

### 2.2 Automation / Scraping

| Module | File | Verdict |
|---|---|---|
| Whatnot session login (Playwright) | `agent_master_staff_hardened.py` — `_auth_via_*`, `_fill_*`, `_submit_login` | **KEEP FOR POST-MVP** |
| Whatnot order pagination & scraping | `agent_master_staff_hardened.py` — `paginate_and_collect`, `extract_order_rows`, `_go_to_next_page` | **KEEP FOR POST-MVP** |
| Skyvern vision-loop client | `skyvern_client.py` | **KEEP FOR POST-MVP** |
| worker.py (Skyvern-delegating job runner) | `worker.py` | **KEEP FOR POST-MVP** |

### 2.3 Infrastructure & Auth

| Module | File | Verdict |
|---|---|---|
| Magic-link auth (in-memory token store) | `app.py` — `/auth/magic-link`, `/auth/verify`, `_magic_tokens` dict | **DISCARD** |
| Rate limiting (IP + email, in-memory buckets) | `app.py` — `_check_rate_limit`, `_rate_buckets` | **DISCARD** |
| SQLite DB initialization + job table | `app.py` — `init_db`, job CRUD helpers | **DISCARD** |
| Session file management (`SESSIONS_DIR`) | `app.py` | **DISCARD** |
| Sentry integration | `app.py` — `sentry_sdk.init` with FastAPI/Starlette integrations | **REQUIRES HUMAN DECISION** |
| Kill switch (`KILL_SWITCH` env) | `app.py` | **REQUIRES HUMAN DECISION** |
| Railway deploy config | `railway.json`, `docker-compose.yml` | **DISCARD** |

### 2.4 Label Printing

| Module | File | Verdict |
|---|---|---|
| `LabelPrinter` (ZPL generation, USB/BT print) | `label_printer.py` | **KEEP FOR POST-MVP** |
| `auto_print_labels_for_buyers` | `label_printer.py` | **KEEP FOR POST-MVP** |

### 2.5 Agent Versions (Legacy)

| Module | File | Verdict |
|---|---|---|
| Original single-agent | `agent.py` | **ARCHIVE** |
| Multi-agent orchestrator v2 | `agent_master.py` | **ARCHIVE** |

### 2.6 Static Dashboards

| Module | File | Verdict |
|---|---|---|
| `dashboard.html` | `dashboard.html` | **DISCARD** |
| `index.html` | `index.html` | **DISCARD** |

### 2.7 Documentation

| Module | File | Verdict |
|---|---|---|
| PRD | `PRD.md` | **CANDIDATE FOR SELECTIVE PORT** — see §3.7 |
| User stories | `docs/user-stories.md` | **CANDIDATE FOR SELECTIVE PORT** — see §3.8 |
| Agent/architecture guide | `AGENTS.md` | **KEEP FOR POST-MVP** |

### 2.8 Tests

| Module | File | Verdict |
|---|---|---|
| Parser unit tests | `tests/test_parser.py` | **CANDIDATE FOR SELECTIVE PORT** — see §3.9 |
| Tombstone | `tests/test_logic.py` | **DISCARD** |

---

## 3. Candidate Detail Sheets

All entries in this section are **candidates requiring separate approval** before any code moves. The detail sheets record what was found, not what is authorized.

### 3.1 `parser.py` — `parse_row` + `ParsedOrder`

**Putative MVP requirement:** Parsing raw Whatnot order rows into typed records for ownership resolution.

**Blocker — import contract not yet defined.** No Whatnot parser of any kind should be implemented until an actual redacted Whatnot livestream-report CSV has been inspected and an import contract approved. The regex extraction in `parse_row` was written against scraped DOM text, not an official export format. Field positions, formats, and encoding may differ entirely in the real CSV. Port candidates are parked here until the import contract ADR is accepted.

| Field | Value |
|---|---|
| Candidate destination | `lib/whatnot/parser.ts` (new file) |
| Rewrite language | TypeScript |
| Dependencies | None (pure functions) |
| Conflicts | None — ClerkBid has no Whatnot-order parsing today |

### 3.2 `parser.py` — `group_buyers`

**Putative MVP requirement:** Group purchases by buyer identity for bundle/fulfillment view.

**Blocker — same as §3.1.** Additionally, buyer identity strategy must be resolved before a grouping key is chosen (see §7 — buyer model recommendation).

| Field | Value |
|---|---|
| Candidate destination | Merge into buyer-bundle view logic once import contract is approved |
| Conflicts | The Copilot buyer identity key is derived from scraped DOM text; the ClerkBid bidder identity is paddle-number-based. These are additive, not conflicting, but the mapping must be explicit. |

### 3.3 Bundle Detection — `detect_bundles`, `_cluster_to_bundle_flag`, `_within_bundle_window`

**Verdict: KEEP AS RESEARCH — NOT AUTHORITATIVE FOR MVP.**

ClerkBid's per-buyer invoice grouping (bidder → invoice → sale lines) is the foundation for buyer bundles. ClerkBid currently lacks explicit fulfillment-oriented bundle states and reconciliation with Whatnot shipment groups. That gap is real and must be addressed.

However, **do not infer a shipment bundle solely from buyer identity and purchase timing.** The time-window clustering algorithm in `detect_bundles` is a heuristic built for scraped data where no official grouping is available. When an official Whatnot export provides order and shipment grouping, that grouping is authoritative and must be preserved as-is. The Copilot time-window algorithm is a last-resort fallback, not a primary method.

This module is retained in the copilot repository as research. Its patterns may inform the fallback path of a future import service, but it must not be ported until the import contract is established and its role is explicitly authorized.

### 3.4 `_parse_price_to_cents`

**Putative MVP requirement:** Normalize price strings at the import boundary.

Price parsing is an **import-boundary concern only.** ClerkBid's money convention (float dollar amounts in `Sale.amount`, `Invoice.subtotal`, etc.) is the MVP standard and will not be changed in this audit cycle. Any import adapter must convert external price strings to ClerkBid's float-dollar convention at the boundary. A partial cents migration is not recommended here and is out of scope for this audit.

| Field | Value |
|---|---|
| Candidate destination | Import adapter utility only — not a shared library function |
| Blocker | Import contract must be defined first (§3.1) |

### 3.5 `_make_buyer_key`

**Putative MVP requirement:** Stable deduplication key for a buyer across rows with inconsistent identity signals.

The three-tier fallback (`user:` → `name:` → `ship:`) is a sound approach for scraped data. Its usefulness for CSV import depends on which identity fields the official export provides. Candidate for the import adapter.

| Field | Value |
|---|---|
| Blocker | Import contract (§3.1); buyer model decision (§7) |

### 3.6 `RawOrder`, `Order`, `normalize_orders`

Typed data contract between raw import rows and the processing pipeline. Parked pending import contract approval. The TypeScript equivalents should be defined as part of the import ADR, not in advance of it.

### 3.7 `PRD.md`

| Field | Value |
|---|---|
| Candidate destination | `docs/product/whatnot-import-prd.md` |
| Action | Copy, then annotate with ClerkBid-specific delta: `next-auth` replaces magic-link; Vercel/Neon replaces Railway/SQLite; Ably replaces long-poll. Remove non-goals that conflict with ClerkBid's existing architecture. |
| Note | The Facebook claim-sale model described in §6 is absent from this PRD. That gap must be filled before the PRD is considered complete for MVP. |

### 3.8 `docs/user-stories.md`

| Field | Value |
|---|---|
| Candidate destination | `docs/product/whatnot-user-stories.md` |
| Action | Copy; rewrite US-01/US-02 (magic-link auth) against ClerkBid's existing `next-auth` session system; update endpoint paths to ClerkBid `/api/` conventions |

### 3.9 `tests/test_parser.py`

| Field | Value |
|---|---|
| Candidate destination | Vitest ports of the 7 `TestGroupBuyers` cases and 5 `TestPriceExtraction` cases once parser is authorized and the import contract is defined |
| Rewrite framework | Vitest (already in `devDependencies`) |
| Note | Tests are pure logic, zero browser/DB dependencies — they translate directly to Vitest `it.each` |

---

## 4. Overlapping Functionality

| Concern | Copilot | ClerkBid | Assessment |
|---|---|---|---|
| Authentication | Custom magic-link, in-memory token dict, session cookie | `next-auth` v4, bcrypt, Postgres-backed sessions, invite-token onboarding | **Incompatible** — ClerkBid's is superior |
| Per-buyer grouping | `group_buyers` — groups by Whatnot username/name | `BidderTable`, `BidderForm` — groups by paddle number | **Different domain** — additive, not conflicting |
| Payment tracking | Not implemented (CSV export only) | `PaymentModal.tsx`, `Invoice.status` (`unpaid`/`paid`), `Invoice.paymentMethod` | **ClerkBid's is directly usable** for Whatnot buyer bundles once import is wired up |
| Item line items | Flat `ParsedOrder.item_title` | Structured `Lot` + `Sale` tables | **Different granularity** — Whatnot orders should map to `Sale`-like records under a synthetic event |
| CSV export | 7-field CSV from `/api/orders/export` | `jspdf` invoices; no CSV export | **Copilot pattern is useful** — the field selection and `Content-Disposition` pattern should inform a future ClerkBid CSV export, authorized separately |
| Bundle flagging | `is_bundle` + time-window clustering | No explicit bundle state | **Copilot has a pattern; ClerkBid's invoice model is the foundation** — see §3.3 |
| Error tracking | Sentry (FastAPI integration) | Not present | **Copilot pattern is portable** — requires separate authorization |

---

## 5. Incompatible Assumptions

| Assumption in Copilot | ClerkBid reality | Severity |
|---|---|---|
| Single-user, single-process deployment | Multi-user, multi-vendor, Vercel serverless | **Critical** — in-memory state cannot survive across invocations |
| File-system persistence (`SESSIONS_DIR`, `AUTH_FILE`, `artifacts/`) | Vercel ephemeral filesystem | **Critical** — all file-based storage must be replaced |
| SQLite as primary store | Neon Postgres + Dexie IndexedDB | **Critical** — no SQLite in the ClerkBid stack |
| Playwright automation runs in-process | Vercel max 60–300s function timeout | **High** — full Playwright sessions can run 5+ minutes |
| Python runtime | Node.js / TypeScript | **Critical** — all ported logic must be rewritten |
| `asyncio.Lock` single-page serialization | Stateless serverless; no shared process state | **High** — concurrency requires DB-level locking or idempotency tokens |
| Static HTML frontend | React App Router, Tailwind, Dexie live queries | **Low** — UI patterns are design reference only, not portable code |
| Price stored as formatted string (`"$12.99"`) | ClerkBid stores `Sale.amount` as float dollars | **Medium** — conversion at import boundary; no internal migration |

---

## 6. Facebook Claim-Sale Gap

The Copilot repository does not provide the required Facebook claim-sale model. The following workflow is absent from both repositories and must be built on ClerkBid's existing architecture:

- **Seller-confirmed primary claimant** — a single buyer is confirmed as the winner of a claimed item; that confirmation is explicit, not inferred from order timing
- **Ordered NIL/NEXT backup list** — a ranked sequence of backup claimants per item, maintained until the primary claim is fulfilled or expires
- **Claim expiration** — a configurable window after which an unconfirmed or unpaid claim is released to the next backup
- **Manual promotion** — the seller or operator manually promotes a backup claimant to primary when the previous claimant fails to complete

This workflow must be implemented using ClerkBid's existing `event`, `buyer`/`bidder`, `sale`, `invoice`, `payment`, and offline-first architecture. It is not a Copilot reuse candidate — it is a net-new feature for ClerkBid scoped to the Facebook platform context.

---

## 7. Buyer Model Recommendation

**Do not create a separate persistent `WhatnotBuyer` model for MVP.**

Prefer extending the existing buyer/bidder entity with optional platform identity fields (e.g., `platformType`, `platformUsername`) unless repository constraints prove that approach unsafe. A second persistent aggregate adds migration risk, sync complexity, and UI surface area that is not justified for MVP. Document any proven blocker before proposing a new aggregate.

---

## 8. Bundle / Invoice Model Recommendation

**Do not create a second persistent bundle aggregate by default.**

ClerkBid's existing `Invoice` ↔ `Sale` relationship already models the concept of "a buyer's grouped purchases." The gap is not aggregate structure — it is the absence of explicit fulfillment and exception states on the invoice (e.g., `awaiting_shipment`, `partially_shipped`, `exception`). Adapt the existing invoice relationship into an operational Buyer Bundle view with payment, fulfillment, and exception states. Document any proven blocker before proposing a new aggregate.

---

## 9. Sensitive Data Audit

Inspection scope: `oracle-now/whatnot-ops-copilot` default branch (`58e4c2a`).

| Path | Tracked in git | Finding | Remediation required |
|---|---|---|---|
| `.playwright/whatnot-auth.json` | **No** — not present in tree | No auth state committed | None |
| `data/sessions/` | **No** — directory not present in tree | No session files committed | None |
| `data/showrunner.db` (or any `.db`, `.sqlite`, `.sqlite3`) | **No** — no database files in tree | No SQLite DB committed | None |
| `artifacts/` | **No** — directory not present in tree | No scraped order data or screenshots committed | None |
| `.env` | **No** — not present in tree | Real env file not committed | None |
| `.env.example` | **Yes** — tracked intentionally | Contains only placeholder values (`change-me-*`, empty fields); no real credentials | None |
| Buyer PII (names, emails, addresses, order data) in JSON files | **No** — no matching files found | No buyer data committed | None |
| Railway token or service credentials | **No** — not found | No Railway credentials in tree | None |
| Resend API key | **No** — not found in tree (`.env.example` has empty `SMTP_PASSWORD`) | Not committed | None |
| Sentry DSN | **No** — `.env.example` has empty `SENTRY_DSN=` | Not committed | None |
| Whatnot credentials (`WHATNOT_EMAIL`, `WHATNOT_PASSWORD`) | **No** — referenced only as env-var names in Python code | Not committed | None |
| OpenAI / Gemini API keys | **No** — `.env.example` has empty fields; not found in tree | Not committed | None |

**Overall finding:** No authentication material, PII, credentials, session state, or live database files were found in the tracked tree. The `.env.example` contains only safe placeholder values and is appropriate to track. No remediation is required at this time.

**Standing instruction:** If `.playwright/whatnot-auth.json`, any `.env` with real values, any `.db` file, or any `artifacts/` content is ever accidentally committed, the required remediation sequence is: **revoke/rotate the credential first**, then remove the file from git history separately (e.g., `git filter-repo`). Do not reverse this order.

---

## 10. Copilot Patterns Warranting Attention (Not Authorization)

The following Copilot patterns have no direct equivalent in ClerkBid and warrant attention in future planning cycles. None are authorized for implementation by this audit.

1. **CSV export for shipping-tool handoff** — the 7-field flat CSV optimized for Pirateship/Shippo ingestion is a better fulfillment artifact for Whatnot sellers than an invoice PDF at MVP. The field selection and `Content-Disposition` filename pattern should inform a future ClerkBid CSV export feature.

2. **Sentry error tracking** — the Copilot `sentry_sdk.init` pattern (env-var DSN guard, `send_default_pii=False`, graceful no-op when DSN is absent) is operationally sound. ClerkBid has no error tracking. Adding `@sentry/nextjs` is a separate decision.

3. **Kill switch pattern** — a single `KILL_SWITCH` environment variable that disables destructive or external-facing operations is simple and useful. Re-implementing it in Next.js middleware is trivial and worth considering independently of this audit.

4. **`test_parser.py` fixture design** — the test structure (one class per behavior, acceptance-criteria-mapped names, parametrized status cases) is the right template for the eventual Vitest port once the import contract is approved.

---

## 11. Summary Decision Table

| File | Verdict |
|---|---|
| `parser.py` | CANDIDATE FOR SELECTIVE PORT |
| `agent_master_staff_hardened.py` (logic methods) | CANDIDATE FOR SELECTIVE PORT (rewrite in TS) |
| `tests/test_parser.py` | CANDIDATE FOR SELECTIVE PORT (rewrite in Vitest) |
| `PRD.md` | CANDIDATE FOR SELECTIVE PORT |
| `docs/user-stories.md` | CANDIDATE FOR SELECTIVE PORT (with edits) |
| `agent_master_staff_hardened.py` (bundle detection) | KEEP AS RESEARCH — NOT AUTHORITATIVE FOR MVP |
| `skyvern_client.py` | KEEP FOR POST-MVP |
| `worker.py` | KEEP FOR POST-MVP |
| `agent_master_staff_hardened.py` (Playwright auth/scraping) | KEEP FOR POST-MVP |
| `label_printer.py` | KEEP FOR POST-MVP |
| `AGENTS.md` | KEEP FOR POST-MVP |
| `agent.py` | ARCHIVE |
| `agent_master.py` | ARCHIVE |
| `app.py` (magic-link, rate limiter, SQLite, file sessions) | DISCARD |
| `dashboard.html` | DISCARD |
| `index.html` | DISCARD |
| `railway.json`, `docker-compose.yml` | DISCARD |
| `tests/test_logic.py` | DISCARD |
| Sentry init pattern | REQUIRES HUMAN DECISION |
| Kill switch pattern | REQUIRES HUMAN DECISION |
| Facebook claim-sale model | NET-NEW — not a reuse candidate |
