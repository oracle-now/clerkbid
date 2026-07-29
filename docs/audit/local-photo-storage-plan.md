# Local Photo Storage Plan

## Status

- **Document type:** Documentation-only investigation
- **Implementation status:** NOT AUTHORIZED — this document records findings and proposals only
- **Base SHA (required ancestor):** `e79d74bd4192b5658a28bc39f4cc5c781428eed6`
- **Branch:** `audit/local-photo-storage-plan`
- **Investigation status:** Part 1 complete — findings recorded; file ready for Part 2 review

---

## Verified Current State

| Area | Verified finding | Source path |
|---|---|---|
| Item/Lot storage table | `lots` table; `++id` primary key; indexes `[eventId+lotNumber]`, `syncKey` | `docs/audit/data-ownership-and-sync.md` §Local Database Schema |
| Current Dexie version | v10 (migrations v1–v10 inline in upgrade chain) | `docs/audit/data-ownership-and-sync.md` §Local Database Schema; `docs/audit/mvp-extension-points.md` §8 |
| Migration conventions | Each schema change requires its own version bump and upgrade hook; no batch migrations; no pre-reserved version numbers | `docs/audit/mvp-extension-points.md` §8 |
| Existing Blob storage | No Blob/binary column exists on any current Dexie table; all stored values are scalars, strings, numbers, or JSON-serialisable objects | `docs/audit/data-ownership-and-sync.md` §Local Database Schema |
| Export format / version | `dataPorter.ts` serialises all own properties of each entity row; current export version is **v6**; versions v1–v6 accepted on import; unknown versions throw | `docs/audit/data-ownership-and-sync.md` §Export Versioning |
| Cloud snapshot payload | JSONB snapshot in `event_cloud_snapshots` (Neon Postgres); snapshot is a serialised payload of all entity rows; binary types are not present in any current entity | `docs/audit/data-ownership-and-sync.md` §Cloud Sync Architecture |
| Browser storage persistence | IndexedDB (via Dexie); survives page refresh and browser restart; does NOT survive explicit browser storage clear | `docs/audit/data-ownership-and-sync.md` §Offline Behavior |
| Quota handling | No quota-handling code identified in current audit evidence; IndexedDB quota behaviour is browser-managed | UNVERIFIED — requires implementation-stage confirmation |
| Cloud/sync upload paths | Sync pushes JSONB snapshots to `/api/sync/push/` (Neon Postgres); no file-upload, object-store, or CDN path exists in any verified route | `docs/audit/data-ownership-and-sync.md` §Cloud Sync Architecture |
| Op-log current types | `sale.put`, `sale.delete`, `invoice.put`, `invoice.patch` | `docs/audit/mvp-extension-points.md` §9 |
| Lots sync method | Lots sync via full snapshot only (no lot op-log type); `syncKey` UUID is the stable cross-device identity | `docs/audit/data-ownership-and-sync.md` §Record ID Generation; `docs/audit/mvp-extension-points.md` §9 |
| Existing test coverage relevant to storage | `lib/services/dataPorter.test.ts` covers export/import round-trip; `lib/services/snapshotMerge.test.ts` covers snapshot contracts | `docs/audit/mvp-extension-points.md` §10 |
| Next proposed Dexie version | v11 (reserved for `events.channel`); photo table would be v12 or later depending on PR sequencing | `docs/audit/mvp-extension-points.md` §8 |

---

## Unknowns

1. **Exact `lib/db.ts` lot schema fields** — field names, types, and any nullable columns on the `lots` table beyond the indexes listed in the audit are unverified. Required before writing a migration hook.
2. **`dataPorter.ts` import/export path for binary data** — whether `dataPorter.ts` can round-trip a `Blob` or `ArrayBuffer` stored in IndexedDB without corruption is unverified.
3. **Browser IndexedDB quota limits in target environments** — typical limits (Chrome ~60% of available disk, Safari ~1 GB per origin) are known from web standards but the specific quota-handling behavior in ClerkBid's PWA context is unverified.
4. **`navigator.storage.persist()` call** — whether the PWA currently requests persistent storage (which prevents eviction) is unverified.
5. **Orientation metadata in images captured via mobile camera** — whether EXIF orientation is stripped by the target browser's `ImageCapture` / `<input type=file>` pipeline is unverified.
6. **`lib/services/dataPorter.ts` export version bump policy** — whether the existing `v6 → v7` bump slot is already reserved for the `claims` table (per `mvp-extension-points.md` §9) or remains available for photo export is unverified.
7. **Current PWA service-worker caching scope** — whether large Blob stores are excluded from service-worker caching is unverified.
8. **Exact file sizes of lot descriptions** — affects total IndexedDB size estimate per event.

---

## Minimal Proposal

> **PROPOSED** — not authorized for implementation

The smallest MVP supporting one compressed local photo per item, one flexible physical-location string, photo replacement, photo deletion, object URL cleanup, graceful capture failure, and graceful quota failure with local-first default and backup/restore support.

### Scope

- One photo per lot/item (not per sale, not per event)
- One free-text `location` string per lot/item (shelf, bin, box label — operator-defined)
- Local-first: photo lives in IndexedDB as a compressed JPEG Blob
- No cloud image hosting in this proposal
- No AI recognition
- No multi-device sync of photos (photos are local only until backup/restore is added)
- No video

### Features Required

1. Capture photo from camera or file picker on item edit screen
2. Compress and store in IndexedDB
3. Display photo on item view
4. Replace photo (capture new → delete old Blob → revoke old object URL → store new)
5. Delete photo explicitly (operator action)
6. Revoke object URLs on component unmount
7. Graceful capture failure: show error toast, preserve prior photo if any, no crash
8. Graceful quota failure: show storage warning, preserve prior photo if any, no crash
9. Input `location` string on item edit screen (free text, nullable)
10. Display `location` on item view and packing view
11. Include photo and location in backup export
12. Restore photo and location from backup

---

## Data And Migration

> **PROPOSED** — not authorized for implementation

### Proposed Fields

Add to the existing `lots` table (no new table required for MVP):

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `photoBlob` | `Blob` or `ArrayBuffer` | Yes | Compressed JPEG stored directly in IndexedDB |
| `photoMimeType` | `string` | Yes | e.g. `"image/jpeg"`; required to reconstruct object URL |
| `location` | `string` | Yes | Free-text physical location; no validation |

Alternative: a separate `lot_photos` table (one row per lot, FK `lotId`) isolates binary data from scalar reads and avoids loading large Blobs on every lot query. This is the **preferred approach** if `lots` table queries are used in hot paths that do not need photo data.

### Item-to-Photo Relationship

One-to-one: one photo per lot. Enforced by storing the photo directly on (or FK-linked to) the lot row. No array, no gallery.

### Migration Requirement

Dexie version bump required (v11 is reserved for `events.channel`; photo migration would be v12 or higher, depending on PR-C sequencing). Upgrade hook must:
- Add `photoBlob`, `photoMimeType`, `location` fields with `undefined` defaults on existing lot rows (no-op upgrade for existing records)
- Not touch any existing lot data

### Compatibility Behavior

Existing lot rows without photo fields continue to work normally. All photo-dependent UI paths must handle `photoBlob === undefined` as "no photo" without error.

### Deletion Behavior

On explicit photo delete: set `photoBlob = undefined`, `photoMimeType = undefined` on the lot row; revoke the object URL immediately. The lot row is retained.

On lot delete: Dexie transaction must delete the lot row; any active object URL for that lot must be revoked before or during deletion.

### Rollback Concern

Downgrading to a Dexie version that does not know about `photoBlob` will silently ignore the field. Photos will not display but data will not be corrupted. If the separate `lot_photos` table approach is chosen, a downgrade would leave an orphaned table — this is acceptable and non-destructive.

---

## Image Contract

> **PROPOSED** — not authorized for implementation

| Parameter | Proposed value | Notes |
|---|---|---|
| Accepted source types | Camera capture (`environment` facingMode) and file picker (`image/*`) | Both via `<input type="file" accept="image/*" capture="environment">` |
| Orientation correction | Apply EXIF orientation before compression | UNVERIFIED — requires implementation-stage confirmation that browser pipeline does not auto-correct |
| Target output format | `image/jpeg` | Broad browser support; good compression ratio for typical auction item photos |
| Maximum dimensions | 1200 × 1200 px (longest edge) | UNVERIFIED — exact value requires implementation testing against target photo quality |
| Approximate byte target | ≤ 150 KB per photo after compression | UNVERIFIED — exact value requires implementation testing; target is aggressive enough to keep a 100-item event under ~15 MB |
| Compression quality | 0.75 JPEG quality via `canvas.toBlob` or `OffscreenCanvas` | UNVERIFIED — exact value requires implementation testing |
| Replacement behavior | Capture new → compress → write new Blob to IndexedDB → revoke old object URL → release old Blob from memory | Atomic: old photo is not deleted until new write succeeds |
| Deletion behavior | Set `photoBlob = undefined` on lot row → revoke object URL | Immediate; no recovery |
| Capture-error behavior | Show error toast with message; preserve existing photo if any; no navigation change; no crash | |
| Quota-error behavior | Catch `DOMException` with name `QuotaExceededError`; show persistent storage warning banner; do not overwrite prior photo; allow user to delete other items' photos to free space | |

---

## Backup Contract

### VERIFIED Current Behavior

- `dataPorter.ts` serialises all own scalar and JSON-serialisable properties of each entity row into a structured JSON payload.
- Current export version: **v6**.
- Export payload is a JSON file (text); no binary format or container format is used.
- The existing payload does **not** include binary data; no Blob, ArrayBuffer, or base64 image field exists in any current entity.
- **Conclusion: existing backup does not support binary images.** Photo data would be lost in a v6 or earlier export.

### PROPOSED Behavior

| Aspect | Proposal |
|---|---|
| Package format | ZIP archive (`.clerkbid-backup.zip` or similar); contains one JSON manifest + one image file per lot that has a photo |
| JSON manifest | All existing entity data (as today); `lots` entries include `photoFilename` (e.g. `photos/lot-{syncKey}.jpg`) and `location`; `photoBlob` field is NOT in the JSON |
| Image files | Stored as individual files inside the ZIP (e.g. `photos/lot-{syncKey}.jpg`); named by `syncKey` to survive re-import to a different device |
| Version marker | Export version bumped to **v7** (or higher if claims table ships first); v7 manifest signals ZIP format with photos |
| Validation before restore | Verify ZIP structure; verify manifest version; verify each `photoFilename` referenced in manifest exists in ZIP |
| Pre-restore safety copy | UNVERIFIED — whether current restore path takes a safety snapshot before overwriting is unverified; proposed behavior: export current state to ZIP before any import overwrites local data |
| Missing-image behavior | If a `photoFilename` is listed in the manifest but not found in the ZIP: import proceeds; lot is restored without photo; warning is shown per missing image |
| Corrupt-image behavior | If a ZIP entry fails to parse as a valid JPEG: import proceeds; lot is restored without photo; warning is shown |
| Backward compatibility | v1–v6 exports continue to import normally (JSON only, no photos); existing import paths unchanged |

---

## Privacy Boundary

| Data class | Local or hosted | Verified behavior |
|---|---|---|
| Authentication / account | Hosted | User rows in Neon Postgres (`users`, `vendors` tables); session managed server-side via `getServerSession()` |
| Billing / entitlements | Hosted | Stored in Neon Postgres; no local copy verified |
| Operational records (events, lots, sales, invoices, bidders) | Both | Written locally to Dexie (IndexedDB) first; automatically synced to Neon Postgres JSONB snapshot on push |
| Images / media | Local only (current) | No image upload path exists; no cloud object store configured; **proposed photo Blob is local-only in this MVP proposal** |
| Logs / analytics | Hosted | `@vercel/analytics` sends passive telemetry to Vercel; disclosed in `docs/audit/open-questions.md` Q8 |
| Support information | UNVERIFIED | No support ticket or error-reporting path was identified in audit evidence |

> **Note:** Operational records (lots, sales, invoices) are **not** local-only — they are automatically pushed to the cloud snapshot. The application is local-first but not local-only for structured data. Photos under this proposal would be the only data class that is genuinely local-only at MVP.

---

## UI Touchpoints

| Screen | Required change |
|---|---|
| Item capture / edit | Add camera/file-picker input; add `location` text field; show existing photo thumbnail with Replace and Delete actions |
| Item display | Show photo thumbnail (if present); show `location` label (if present) |
| Packing | Show photo thumbnail and `location` string per lot to assist physical picking |
| Backup / restore | Replace JSON-only export with ZIP export; update restore UI to accept ZIP; show per-image warning on partial restore |
| Storage warning | Persistent banner or toast when quota failure occurs; link to a "Manage storage" view (deferred) |

---

## Required Tests

- [ ] **Database migration** — v(n-1) database opens successfully after upgrade to v(n); `photoBlob`, `photoMimeType`, `location` fields default to `undefined` on existing rows
- [ ] **Existing-record compatibility** — lot rows without photo fields render correctly on item display and edit screens
- [ ] **Compression** — captured image is stored as JPEG; stored byte size is below target threshold
- [ ] **Orientation** — image captured in landscape/portrait renders correctly regardless of EXIF orientation tag
- [ ] **Replacement** — replacing a photo revokes the old object URL and stores the new Blob; old photo is not retrievable
- [ ] **Deletion** — explicit delete clears `photoBlob` and `photoMimeType`; object URL is revoked; no crash
- [ ] **Quota failure** — simulated `QuotaExceededError` on `db.lots.put()` shows warning banner; prior photo is preserved; no crash
- [ ] **Capture failure** — simulated camera permission denial or file-picker cancel shows error toast; prior photo is preserved; no crash
- [ ] **Export** — backup ZIP contains correct JSON manifest and one JPEG per photo-bearing lot; `photoFilename` matches actual ZIP entry
- [ ] **Restore** — importing a v7 ZIP restores lot data and photos; `location` fields are restored; object URLs are generated correctly
- [ ] **Corrupt package** — a ZIP with an invalid or truncated JPEG entry restores the lot without the photo and shows a per-item warning
- [ ] **Missing image** — a ZIP manifest referencing a `photoFilename` not present in the archive restores the lot without the photo and shows a per-item warning
- [ ] **Object URL cleanup** — object URLs created during a session are revoked on component unmount; no URL leak across route navigations

---

## Implementation PRs

> No PR listed below is authorized for implementation. Each requires separate scope approval.

### PR-Photo-1: Schema, Storage, and Image Pipeline

| Field | Detail |
|---|---|
| Purpose | Add `photoBlob`, `photoMimeType`, `location` fields to `lots` table (or introduce `lot_photos` table); implement image capture, compression, orientation correction, replacement, deletion, and object URL lifecycle |
| Likely files or layers | `lib/db.ts` (Dexie version bump + upgrade hook); new `lib/services/lotPhotoService.ts` (compression, orientation, quota handling); item edit component in `app/(protected)/`; item display component |
| Tests | Migration, existing-record compatibility, compression, orientation, replacement, deletion, quota failure, capture failure, object URL cleanup |
| Dependency | Must follow PR-C (`events.channel` / v11 bump) to avoid version collision |
| Explicit exclusions | No backup/restore changes; no packing UI changes; no cloud upload |

### PR-Photo-2: Backup and Restore (ZIP format)

| Field | Detail |
|---|---|
| Purpose | Replace JSON-only export with ZIP export; update import path to accept v7 ZIP; handle missing and corrupt images gracefully |
| Likely files or layers | `lib/services/dataPorter.ts` (export version bump to v7+, ZIP write/read); backup/restore UI components in `app/(protected)/`; `lib/services/dataPorter.test.ts` |
| Tests | Export, restore, corrupt package, missing image |
| Dependency | Requires PR-Photo-1 (photo fields must exist before backup can include them) |
| Explicit exclusions | No cloud image hosting; no automatic cloud backup of photos |

### PR-Photo-3: Packing View Integration

| Field | Detail |
|---|---|
| Purpose | Surface photo thumbnail and `location` string on the packing screen to assist physical item picking |
| Likely files or layers | Packing route component in `app/(protected)/`; read-only use of photo fields from Dexie |
| Tests | Existing-record compatibility (lots without photos render correctly); display of photo and location on packing screen |
| Dependency | Requires PR-Photo-1 (fields must exist) |
| Explicit exclusions | No photo editing on packing screen; no location editing on packing screen |

---

## Verdict

**GO WITH BLOCKER**

- The local-first architecture (Dexie IndexedDB) is technically capable of storing compressed JPEG Blobs; no new infrastructure is required for the local-storage layer.
- The existing `dataPorter.ts` export/restore path must be extended to a ZIP format to support photo backup — this is a non-trivial change that touches the export version contract and must be sequenced carefully with the `claims` table v7 export bump.
- **Blocker:** The Dexie version number for the photo migration must be coordinated with PR-C (`events.channel` → v11) and the claims table PR (which also requires an export version bump); shipping photo schema out of order risks a version collision that is difficult to recover from in production IndexedDB.
- The `dataPorter.ts` binary round-trip (Blob → ZIP → Blob on restore) is unverified; a proof-of-concept test is required before PR-Photo-2 is scoped.
- Implementation is low risk for PR-Photo-1 and PR-Photo-3; PR-Photo-2 (backup ZIP) carries the highest implementation risk and must not be rushed.
