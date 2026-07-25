# License Review — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25

---

## Repository License

| Item | Value |
|---|---|
| File | `LICENSE` (root) |
| SHA | `b8405d41fe2fb5a8c8962cbf3a9543f162950cac` |
| Type | MIT License |
| Copyright | Copyright (c) 2026 AuctionMethod, Inc. |
| Confirmed | Yes — file inspected directly |

**The MIT license permits:** use, copy, modify, merge, publish, distribute, sublicense, and sell copies, provided the copyright notice and permission notice are included in all copies or substantial portions of the software.

**Obligation for fork:** Retain the original `LICENSE` file and copyright notice. Do not remove or alter the AuctionMethod copyright line. You may add your own copyright line for new code.

---

## Runtime Dependency License Audit

Source: `package.json` at `bf46dd5`.

| Package | Version | License | Notes |
|---|---|---|---|
| `next` | 14.2.21 | MIT | |
| `react` / `react-dom` | 18.3.1 | MIT | |
| `typescript` | 5.7.2 | Apache-2.0 | |
| `dexie` | 4.0.10 | Apache-2.0 | Permissive; patent grant included |
| `dexie-react-hooks` | 1.1.7 | Apache-2.0 | |
| `next-auth` | 4.24.11 | ISC | Permissive |
| `@vercel/postgres` | 0.10.0 | MIT | |
| `@vercel/analytics` | 2.0.1 | Vercel ToS | ⚠ Sends telemetry to Vercel servers — not a code license issue but a data flow concern |
| `ably` | 2.21.0 | Apache-2.0 | Optional |
| `bcryptjs` | 2.4.3 | MIT | |
| `jspdf` | 2.5.2 | MIT | |
| `jspdf-autotable` | 3.8.4 | MIT | |
| `next-pwa` | 5.6.0 | MIT | |
| `tailwindcss` | 3.4.16 | MIT | |
| `vitest` | 2.1.8 | MIT | Dev dependency |
| `fake-indexeddb` | 6.0.0 | MIT | Dev dependency |
| `@types/node` | ^20 | MIT | Dev dependency |

**No GPL, AGPL, LGPL, SSPL, or Commons Clause dependencies detected.**

---

## Assets and Content With Separate Licensing Concerns

### `hs-fields/` directory

- Contains HubSpot field definition files (JSON/YAML schema definitions for HubSpot CRM properties).
- These were likely auto-generated or copied from a HubSpot portal.
- **HubSpot’s developer terms** restrict redistribution of portal-specific metadata.
- **Recommendation:** Remove this directory entirely from the fork before any public repository or deployment. It has no runtime function in Live Sale Clerk v0.

### `terms/` directory

- Contains legal copy (user agreement, privacy policy) authored by or for AuctionMethod, Inc.
- This content is **not covered by the MIT license** — legal documents are typically copyright of the authoring entity.
- **Recommendation:** Replace all files in `terms/` with Live Sale Clerk-specific legal copy before any user-facing deployment. Do not redistribute AuctionMethod’s legal text.

### `public/` directory

- Contains PWA icons, `manifest.json`, `offline.html`, and favicon assets.
- These are likely AuctionMethod-branded assets.
- **Recommendation:** Replace all brand assets (icons, name in `manifest.json`) with Live Sale Clerk assets before deployment.

### `AUCTION_MANAGER_PWA_SPEC.md`

- 38 KB product specification document.
- Copyright belongs to AuctionMethod, Inc. (covered by MIT for source use but not for redistribution as a standalone document).
- **Recommendation:** Keep for internal reference; do not redistribute or publish externally.

---

## License Obligations for the Fork

1. **Retain** `LICENSE` file in the fork repository.
2. **Retain** the AuctionMethod copyright notice in the `LICENSE` file.
3. **Add** a Live Sale Clerk copyright line in `LICENSE` for new contributions.
4. **Replace** `terms/` content with original legal copy.
5. **Remove** `hs-fields/` directory.
6. **Replace** brand assets in `public/`.
7. **Do not** claim the codebase is entirely original without attribution.

---

## Verdict

**No legal blocker.** MIT license is maximally permissive. The only obligations are attribution (keep the `LICENSE` file) and replacement of non-code content (`terms/`, brand assets) before user-facing deployment.
