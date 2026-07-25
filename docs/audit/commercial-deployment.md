# Commercial Deployment Independence — AuctionMethod/clerkbid

**Inspected commit:** `bf46dd5`  
**Audit date:** 2026-07-25

---

## Question

Can the application be independently deployed without relying on the original creator’s production backend?

## Answer: YES — with conditions

All sync and auth endpoints are served by the deployed Next.js instance itself. No calls to any AuctionMethod-hosted service were found in source.

---

## Required Environment Variables (non-optional)

Source: `.env.example`

| Variable | Purpose | Self-host path |
|---|---|---|
| `DATABASE_URL` | Neon/Postgres connection string | Create free Neon project or any Postgres instance |
| `NEXTAUTH_SECRET` | JWT signing secret | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Canonical app URL | Set to your deployment URL |
| `RESEND_API_KEY` | Transactional email (password reset, invite) | Free Resend account |
| `SUPER_ADMIN_EMAILS` | Comma-separated emails with super-admin access | Set to operator email only |

---

## Optional Environment Variables (can be omitted for v0)

| Variable | Purpose | v0 Decision |
|---|---|---|
| `NEXT_PUBLIC_ABLY_SYNC` | Enable Ably realtime nudge | Omit — not needed for solo seller |
| `ABLY_API_KEY` | Ably server-side auth | Omit |
| `HUBSPOT_ACCESS_TOKEN` | CRM sync on registration | Omit |
| `HUBSPOT_PORTAL_ID` | HubSpot portal | Omit |
| `VERCEL_CRON_SECRET` | Secure Vercel cron endpoint | Omit if not using Vercel cron |

---

## Database Setup

1. Apply `db/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`).
2. Apply migrations in order:
   - `migrate_users_first_last.sql`
   - `migrate_password_reset.sql`
   - `migrate_cloud_sync.sql`
   - `migrate_event_sync_ops.sql`
   - `migrate_multi_user_org.sql`
   - `migrate_global_announcements.sql`
3. **Do not apply** `migrate_admin_impersonation.sql` for Founder Class v0 unless super-admin impersonation is explicitly required. See `security-gaps.md`.

No migration runner is included. Migrations must be applied manually via `psql` or the Neon console.

---

## Deployment Targets

| Target | Compatibility | Notes |
|---|---|---|
| **Vercel** | Native | `vercel.json` present; cron configured |
| **Railway** | Compatible | Standard Next.js Docker or Nixpacks build; set env vars; attach Postgres plugin |
| **Fly.io** | Compatible | Dockerfile needed (not included); standard Next.js |
| **Self-hosted Node** | Compatible | `next start` on Node 20; supply own Postgres |

> Per audit scope constraints, **Railway is not the required deployment target**; it is listed here only as a compatibility note.

---

## External Service Dependencies Map

```
Live Sale Clerk instance
├── Neon Postgres (required) ───────── operators own instance
├── Resend (required for email) ──── operators own API key
├── Vercel Analytics (passive) ───── remove import to disable
├── Ably (optional realtime) ─────── omit env var to disable
└── HubSpot (optional CRM) ───────── omit env var to disable

NO calls to:
  ✕ AuctionMethod API
  ✕ AuctionMethod CDN
  ✕ AuctionMethod auth
  ✕ Any hardcoded external auction service
```

---

## Checklist Before Inviting Pilot Users

- [ ] `DATABASE_URL` points to operator-owned Postgres (not shared with AuctionMethod)
- [ ] `NEXTAUTH_SECRET` is freshly generated (not copied from any AuctionMethod deployment)
- [ ] `NEXTAUTH_URL` matches the Live Sale Clerk domain
- [ ] `SUPER_ADMIN_EMAILS` contains only operator email
- [ ] `migrate_admin_impersonation.sql` **not applied** (or impersonation access confirmed restricted)
- [ ] `terms/` content replaced with Live Sale Clerk legal copy
- [ ] `hs-fields/` directory removed or confirmed non-redistributable content stripped
- [ ] `@vercel/analytics` import removed from `app/layout.tsx` OR telemetry disclosed in privacy policy
- [ ] Resend domain verified and `from` address updated to Live Sale Clerk domain
- [ ] Registration page copy and branding updated (no AuctionMethod logos or copy)
- [ ] `NEXT_PUBLIC_APP_NAME` or equivalent constant updated if present
- [ ] PWA manifest (`public/manifest.json`) updated with Live Sale Clerk name and icons

---

## CI/CD Gap

No `.github/workflows/` directory was found in the repository. There is no automated test pipeline. Before shipping to pilot users:

1. Add a GitHub Actions workflow: `npm ci && npm test && npm run build`.
2. Gate merges to `main` on passing tests.
3. Consider a Vercel preview deployment per PR for manual smoke testing.

---

## Confidence

**High** — Independence confirmed by absence of external API calls in sync routes and `.env.example` documentation. The only unverified item is the vendor-scoping check inside `/api/sync/push/route.ts` (source not inspected in this pass). Verify before pilot launch.
