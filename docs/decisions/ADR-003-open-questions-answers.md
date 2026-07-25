# ADR-003: Open Question Answers (2026-07-25)

Q2 Impersonation migration — NOT applied. Clean deployment.
   Do not apply migrate_admin_impersonation.sql. Document as excluded.
   If a schema dependency requires it, stop and report.

Q3 hs-fields/ — Do not delete. If inert docs/artifacts, move to
   docs/archive/inherited/hs-fields/. If executable or imported,
   leave in place and report what it is.

Q4 terms/ — Draft private-alpha placeholder allowed.
   Header: "Private Alpha Notice — Draft".
   Keep [LEGAL REVIEW REQUIRED] markers. Not valid for public or paid launch.

Q6 Deploy — Vercel. Keep only cron jobs still needed after admin/ably/
   announcements removal. Document each remaining job: endpoint, auth,
   schedule, failure behavior.

Q7 Data — Clean slate. No legacy user migration script.
   Provide a deterministic clean-install migration/seed path.

Q8 Analytics — Remove @vercel/analytics for private alpha.
   Remove import and dependency if otherwise unused. No replacement.

Q9 Consignor — Hide from nav and workflow. Do not delete files or schema.
   Mark inherited/unsupported for Founder Class.

## Gap #1 (vendor scoping)
Status: SOURCE-REVIEWED, TESTS PENDING. Not resolved.
Session-derived vendorId is necessary but does not prove that every
child ID in a payload belongs to that vendor.
