# Local Photo Storage Plan

## Status

- **Document type:** Documentation-only investigation
- **Implementation status:** NOT AUTHORIZED — this document records findings and proposals only
- **Base SHA (required ancestor):** `e79d74bd4192b5658a28bc39f4cc5c781428eed6`
- **Branch:** `audit/local-photo-storage-plan`
- **Investigation status:** Documentation-only audit; implementation not authorized

---

## Verified Current State

> Facts in this section are derived directly from `lib/db.ts` and `lib/services/dataPorter.ts` (current source authority). Older audit documents are cited only for historical context where noted.

| Area | Verified finding | Source path |
|---|---|---|
| Current Dexie version | **v11 is live.** The `AuctionDB` constructor calls `this.version(11).stores(STORE_DEF_V11)` as its highest registered version. | `lib/db.ts` — `STORE_DEF_V11`, constructor |
| Claims table | Present. `STORE_DEF_V11` adds `claims: "++id, syncKey, eventId, lotId, bidderId, status, [eventId+lotId]"`. `AuctionDB` declares `claims!: Table<Claim>`. | `lib/db.ts` — `STORE_DEF_V11` |
| Current export version | **`EXPORT_VERSION = 7` is live** in `dataPorter.ts`. | `lib/services/dataPorter.ts` — `EXPORT_VERSION` constant |
| Claims exported | Yes. `buildEventExport` queries `db.claims` and maps each row to `ClaimExportShape` in the `claims` array of the payload. | `lib/services/dataPorter.ts` — `buildEventExport` |
| Claims restored | Yes. `insertChildrenForEvent` iterates `payload.claims ?? []` and inserts each claim with remapped foreign keys. | `lib/services/dataPorter.ts` — `insertChildrenForEvent` |
| Backward compatibility (v1–v6 imports) | Older exports accepted. `parseEventExportPayload` accepts versions 1–7; `claims` is typed optional (`claims?`) so v1–v6 imports without a `claims` array default to `undefined` (treated as empty). | `lib/services/dataPorter.ts` — `parseEventExportPayload`, `EventExportPayload` type |
| Existing Blob storage | `AppSettings.invoiceLogoBlob?: Blob` and `EventLocalBranding.invoiceLogoBlob?: Blob` both exist. Existing Blob use proves Dexie can store local binary values. This does **not** prove event export/restore can round-trip item photos. | `lib/db.ts` — `AppSettings`, `EventLocalBranding` interfaces |
| Current Lot type fields | `id?`, `eventId`, `baseLotNumber`, `lotSuffix`, `displayLotNumber`, `description`, `consignor?`, `consignorId?`, `notes?`, `quantity`, `status`, `createdAt`, `updatedAt` | `lib/db.ts` — `Lot` interface |
| Lot — photo fields | **None.** Lot has no `photoBlob`, `photoMimeType`, or any other photo field. | `lib/db.ts` — `Lot` interface |
| Lot — physical-location field | **None.** Lot has no physical-location field. | `lib/db.ts` — `Lot` interface |
| Item/Lot storage table | `lots` table; `++id` primary key; see `STORE_DEF_V5` for current index set. | `lib/db.ts` — `STORE_DEF_V5` (inherited through v11) |
| Migration conventions | Each schema change requires its own version bump and upgrade hook; no batch migrations. | `lib/db.ts` — constructor version chain |
| Browser storage persistence | IndexedDB (via Dexie); survives page refresh and browser restart; does NOT survive explicit browser storage clear. | Historical: `docs/audit/data-ownership-and-sync.md` §Offline Behavior |
| Quota handling | No quota-handling code identified in current bounded source. | UNVERIFIED — requires implementation-stage confirmation |
| Cloud/sync upload paths | No file-upload, object-store, or CDN path identified in bounded source. Sync pushes JSONB snapshots. | Historical: `docs/audit/data-ownership-and-sync.md` §Cloud Sync Architecture |
| Op-log current types | `sale.put`, `sale.delete`, `invoice.put`, `invoice.patch` | Historical: `docs/audit/mvp-extension-points.md` §9 |
| Lots sync method | UNVERIFIED from bounded source — sync trigger and behavior are outside this bounded source pass. See Sync and Privacy section. | Outside bounded source |
| Existing test coverage relevant to storage | `lib/services/dataPorter.test.ts` covers export/import round-trip; `lib/services/snapshotMerge.test.ts` covers snapshot contracts. | Historical: `docs/audit/mvp-extension-points.md` §10 |

---

## Unknowns

1. **`dataPorter.ts` import/export path for binary data** — whether `dataPorter.ts` can round-trip a `Blob` or `ArrayBuffer` stored in IndexedDB without corruption is unverified.
2. **Browser IndexedDB quota limits in target environments** — typical limits (Chrome ~60% of available disk, Safari ~1 GB per origin) are known from web standards but the specific quota-handling behavior in ClerkBid's PWA context is unverified.
3. **`navigator.storage.persist()` call** — whether the PWA currently requests persistent storage (which prevents eviction) is unverified.
4. **Orientation metadata in images captured via mobile camera** — whether EXIF orientation is stripped by the target browser's `ImageCapture` / `<input type=file>` pipeline is unverified.
5. **Current PWA service-worker caching scope** — whether large Blob stores are excluded from service-worker caching is unverified.
6. **Exact file sizes of lot descriptions** — affects total IndexedDB size estimate per event.
7. **Photo relationship key** — whether the separate photo table should key on `lotId` (local numeric key) or a durable sync identity (e.g. `syncKey`) is unresolved. This must be decided before implementation.

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
- No multi-device sync of photos
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

### Proposed Data Model

The proposed model is:

1. Add one optional flexible physical-location string (`location`) to the `Lot` type — a scalar field on the existing lots table.
2. Add a separate one-to-one local photo table — keeps Blob data out of ordinary Lot hot-path reads.
3. Blob data must not be added to the existing `lots` table rows.
4. **Exact relationship key is unresolved:** whether the photo table keys on `lotId` (local numeric key) or a durable sync identity must be decided before implementation.
5. An exact table schema or index contract has not been invented here.

An approximate conceptual record for the photo table is **PROPOSED**:

| Field | Notes |
|---|---|
| `id` | Auto-increment primary key |
| lot relationship key | Either `lotId` or a durable sync identity — **UNRESOLVED** |
| Blob | Compressed JPEG stored in IndexedDB |
| MIME type | e.g. `"image/jpeg"` |
| byte size | For quota management and display |
| `updatedAt` | For cache invalidation |

This shape is **PROPOSED** and subject to change pending the relationship-key decision.

### Item-to-Photo Relationship

One-to-one: one photo per lot. No array, no gallery.

### Migration Requirement

- The optional `location` scalar on `Lot` requires a Lot model/schema update.
- The separate photo table requires a Dexie schema update.
- Existing lot records must remain valid after migration (no-op upgrade for existing rows).
- Any photo migration must use the **next available database version after current `main`**. The current highest version in `main` is v11. Do not prescribe a numeric future version in this document; determine the correct version number at implementation time by reading the then-current `lib/db.ts`.

### Compatibility Behavior

Existing lot rows without photo or location fields continue to work normally. All photo-dependent UI paths must handle missing photo as "no photo" without error.

### Deletion Behavior

On explicit photo delete: delete the row from the separate photo table; revoke the object URL immediately. The lot row is retained.

On lot delete: Dexie transaction must delete the associated photo table row (if any); any active object URL for that lot must be revoked before or during deletion.

### Rollback Concern

Downgrading to a Dexie version that does not know about the photo table will silently ignore it. Photos will not display but data will not be corrupted. An orphaned photo table after downgrade is acceptable and non-destructive.

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
| Replacement behavior | Capture new → compress → write new Blob to photo table → revoke old object URL → release old Blob from memory | Atomic: old photo is not deleted until new write succeeds |
| Deletion behavior | Delete row from separate photo table → revoke object URL | Immediate; no recovery |
| Capture-error behavior | Show error toast with message; preserve existing photo if any; no navigation change; no crash | |
| Quota-error behavior | Catch `DOMException` with name `QuotaExceededError`; show persistent storage warning banner; do not overwrite prior photo; allow user to delete other items' photos to free space | |

---

## Backup Contract

### VERIFIED Current Behavior

- `dataPorter.ts` serialises all own scalar and JSON-serialisable properties of each entity row into a structured JSON payload.
- **Current export version: `EXPORT_VERSION = 7` (live).** Claims are exported and restored in v7. Exports without a `claims` array (v1–v6) remain backward-compatible.
- Export payload is a JSON file (text); no binary format or container format is currently used.
- The existing JSON payload does **not** include a dedicated item-photo table because that table does not yet exist.
- `AppSettings.invoiceLogoBlob` and `EventLocalBranding.invoiceLogoBlob` demonstrate that Dexie can store Blob values, but these fields are not included in the JSON event export. They do **not** prove that binary item-photo round-trip via export/restore is supported.
- **Binary item-photo round-trip is UNVERIFIED.** A proof-of-concept test is required before the backup PR is scoped.

### PROPOSED Behavior

> Photo backup changes must use the **next available export contract after current `main`**. The current live export version is 7. Do not prescribe a numeric future export version in this document; determine the correct version number at implementation time.

| Aspect | Proposal |
|---|---|
| Package format | ZIP archive (`.clerkbid-backup.zip` or similar) — **PROPOSED, not yet an accepted decision** |
| JSON manifest | All existing entity data (as today); `lots` entries include `photoFilename` (e.g. `photos/lot-{syncKey}.jpg`) and `location`; photo Blob is NOT in the JSON |
| Image files | Stored as individual files inside the ZIP (e.g. `photos/lot-{syncKey}.jpg`); named by a durable lot identity to survive re-import to a different device |
| Version marker | Export version bumped to the next available contract after current main; new version signals ZIP format with photos |
| Validation before restore | Verify ZIP structure; verify manifest version; verify each `photoFilename` referenced in manifest exists in ZIP |
| Pre-restore safety copy | UNVERIFIED — whether current restore path takes a safety snapshot before overwriting is unverified |
| Missing-image behavior | If a `photoFilename` is listed in the manifest but not found in the ZIP: import proceeds; lot is restored without photo; warning is shown per missing image |
| Corrupt-image behavior | If a ZIP entry fails to parse as a valid JPEG: import proceeds; lot is restored without photo; warning is shown |
| Backward compatibility | v1–v7 JSON exports continue to import normally; existing import paths unchanged |

---

## Privacy Boundary

| Data class | Local or hosted | Verified behavior |
|---|---|---|
| Authentication / account | Hosted | User rows in Neon Postgres; session managed server-side. Historical: `docs/audit/data-ownership-and-sync.md` |
| Billing / entitlements | Hosted | Stored in Neon Postgres; no local copy verified. Historical source. |
| Operational records (events, lots, sales, invoices, bidders) | Verified: written locally to Dexie first. Sync behavior: UNVERIFIED from bounded source — see below. | `lib/db.ts` confirms local Dexie storage. Sync trigger is outside bounded source. |
| Images / media | Local only (current) | No image upload path exists; no cloud object store configured in bounded source; **proposed photo Blob is local-only in this MVP proposal** |
| Logs / analytics | Hosted | Historical: `docs/audit/open-questions.md` Q8 |
| Support information | UNVERIFIED | No support ticket or error-reporting path was identified in bounded source. |

> **Sync trigger status:** UNVERIFIED — the sync trigger is outside this bounded source pass. Whether operational records are pushed automatically, manually, or by default cannot be stated from the bounded files alone. The existence of `syncOutbox`, `syncState`, and snapshot/export infrastructure is confirmed by `lib/db.ts`, but trigger timing and default behavior are not verified here.

> **Privacy implication:** Because sync trigger behavior is unverified, structured records (lots, sales, etc.) must not be labeled "local only" in this document. Photos under this proposal would be local-only at MVP only if explicitly excluded from any sync path — this exclusion must be verified at implementation time.

---

## UI Touchpoints

| Screen | Required change |
|---|---|
| Item capture / edit | Add camera/file-picker input; add `location` text field; show existing photo thumbnail with Replace and Delete actions |
| Item display | Show photo thumbnail (if present); show `location` label (if present) |
| Packing | Show photo thumbnail and `location` string per lot to assist physical picking |
| Backup / restore | Replace JSON-only export with ZIP export (PROPOSED); update restore UI to accept ZIP; show per-image warning on partial restore |
| Storage warning | Persistent banner or toast when quota failure occurs; link to a "Manage storage" view (deferred) |

---

## Required Tests

- [ ] **Database migration** — v(n-1) database opens successfully after upgrade to v(n); `location` field on Lot defaults to `undefined` on existing rows; photo table does not affect existing lot reads
- [ ] **Existing-record compatibility** — lot rows without photo or location fields render correctly on item display and edit screens
- [ ] **Compression** — captured image is stored as JPEG; stored byte size is below target threshold
- [ ] **Orientation** — image captured in landscape/portrait renders correctly regardless of EXIF orientation tag
- [ ] **Replacement** — replacing a photo revokes the old object URL and stores the new Blob in the photo table; old photo is not retrievable
- [ ] **Deletion** — explicit delete removes the row from the separate photo table; object URL is revoked; no crash
- [ ] **Quota failure** — simulated `QuotaExceededError` on photo table write shows warning banner; prior photo is preserved; no crash
- [ ] **Capture failure** — simulated camera permission denial or file-picker cancel shows error toast; prior photo is preserved; no crash
- [ ] **Export** — backup ZIP contains correct JSON manifest and one JPEG per photo-bearing lot; `photoFilename` matches actual ZIP entry
- [ ] **Restore** — importing a new-version ZIP restores lot data and photos; `location` fields are restored; object URLs are generated correctly
- [ ] **Corrupt package** — a ZIP with an invalid or truncated JPEG entry restores the lot without the photo and shows a per-item warning
- [ ] **Missing image** — a ZIP manifest referencing a `photoFilename` not present in the archive restores the lot without the photo and shows a per-item warning
- [ ] **Object URL cleanup** — object URLs created during a session are revoked on component unmount; no URL leak across route navigations

---

## Implementation PRs

> No PR listed below is authorized for implementation. Each requires separate scope approval.

### PR-Photo-1: Schema, Storage, and Image Pipeline

| Field | Detail |
|---|---|
| Purpose | Add optional `location` field to `Lot` type; introduce separate one-to-one local photo table; implement image capture, compression, orientation correction, replacement, deletion, and object URL lifecycle |
| Likely files or layers | `lib/db.ts` (Dexie version bump to next available version after current `main` + upgrade hook); new `lib/services/lotPhotoService.ts` (compression, orientation, quota handling); item edit component in `app/(protected)/`; item display component |
| Tests | Migration, existing-record compatibility, compression, orientation, replacement, deletion, quota failure, capture failure, object URL cleanup |
| Dependencies | No dependency on a `events.channel` or any other future migration. Use the next available database version after current `main` at implementation time. |
| Explicit exclusions | No backup/restore changes; no packing UI changes; no cloud upload |

### PR-Photo-2: Backup and Restore (ZIP format)

| Field | Detail |
|---|---|
| Purpose | Replace JSON-only export with ZIP export (PROPOSED format); update import path to accept the new export contract version; handle missing and corrupt images gracefully |
| Likely files or layers | `lib/services/dataPorter.ts` (export version bump to next available contract after current `main`, ZIP write/read); backup/restore UI components in `app/(protected)/`; `lib/services/dataPorter.test.ts` |
| Tests | Export, restore, corrupt package, missing image |
| Dependency | Requires PR-Photo-1 (photo table must exist before backup can include photos) |
| Explicit exclusions | No cloud image hosting; no automatic cloud backup of photos |

### PR-Photo-3: Packing View Integration

| Field | Detail |
|---|---|
| Purpose | Surface photo thumbnail and `location` string on the packing screen to assist physical item picking |
| Likely files or layers | Packing route component in `app/(protected)/`; read-only use of photo fields from Dexie |
| Tests | Existing-record compatibility (lots without photos render correctly); display of photo and location on packing screen |
| Dependency | Requires PR-Photo-1 (photo table and location field must exist) |
| Explicit exclusions | No photo editing on packing screen; no location editing on packing screen |

---

## Verdict

**GO WITH BLOCKER**

- The local-first architecture (Dexie IndexedDB) is technically capable of storing compressed JPEG Blobs; existing `invoiceLogoBlob` fields on `AppSettings` and `EventLocalBranding` prove Blob storage works. No new infrastructure is required for the local-storage layer.
- A separate one-to-one photo table is the correct approach; Blob data must not be added to ordinary `lots` rows that are read in hot paths.
- **Blocker 1:** The exact photo relationship key is unresolved — `lotId` (local numeric key) versus a durable sync identity must be decided before implementation.
- **Blocker 2:** Binary backup/restore proof-of-concept is required before PR-Photo-2 is scoped. The existing JSON export at `EXPORT_VERSION = 7` does not include item photos; binary round-trip via ZIP is unverified.
- **Blocker 3:** Sync exclusion and privacy behavior must be verified before claiming photos remain device-local. The sync trigger is outside the bounded source of this audit.
- Implementation is not authorized.
