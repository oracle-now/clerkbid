/**
 * Claim domain service — ADR-001 (rev 2)
 *
 * INVARIANTS (never relaxed without an ADR revision):
 *   DR-1  A backup/NIL Claim is never a Sale.
 *   DR-2  A backup Claim may not enter an Invoice.
 *   DR-3  At most one active (non-voided) Sale per (eventId, lotId).
 *   DR-4  Seller confirmation is authoritative; no automation may confirm.
 *   DR-8  Position is seller-determined.
 *
 * This service is pure domain logic over AuctionDB.
 * It never touches UI, auth, server SQL, CI, payment code,
 * posting queues, Facebook APIs, or op-log sync.
 *
 * Replacement-owner limitation (documented per spec):
 *   If a confirmed Sale for (eventId, lotId) has not been voided,
 *   confirmClaim will throw ACTIVE_SALE_EXISTS rather than silently
 *   overwrite it. A void/correction workflow (ADR-3 / PR-G) is required
 *   before a replacement owner can be confirmed.  The Sale.status=voided
 *   state is managed by calling code that explicitly sets it; this service
 *   reads but does not write Sale.status beyond what createSale already does.
 */
import type { AuctionDB, Sale } from "@/lib/db";
import type { Claim } from "@/types/claim";
import { newEntitySyncKey } from "@/lib/utils/clientSyncKey";
import { upsertInvoiceForBidder } from "@/lib/services/invoiceLogic";

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export type ClaimErrorCode =
  | "BACKUP_NOT_PROMOTED"      // confirmClaim called on backup before promotion
  | "ACTIVE_SALE_EXISTS"       // second owner attempt for same (eventId, lotId)
  | "CLAIM_ALREADY_CONFIRMED" // internal guard (should not reach caller)
  | "CLAIM_NOT_FOUND"
  | "INVALID_TRANSITION";

export class ClaimDomainError extends Error {
  constructor(
    public readonly code: ClaimErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ClaimDomainError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getClaimOrThrow(db: AuctionDB, claimId: number): Promise<Claim> {
  const c = await (db as unknown as { claims: { get(id: number): Promise<Claim | undefined> } }).claims.get(claimId);
  if (!c) throw new ClaimDomainError("CLAIM_NOT_FOUND", `Claim ${claimId} not found`);
  return c;
}

// ---------------------------------------------------------------------------
// Create operations — never create a Sale or Invoice (DR-1, DR-2)
// ---------------------------------------------------------------------------

export interface CreatePrimaryInput {
  eventId: number;
  lotId: number;
  bidderId: number;
  phrase?: string;
}

export async function createPrimary(
  db: AuctionDB,
  input: CreatePrimaryInput
): Promise<Claim> {
  const now = new Date();
  const row: Omit<Claim, "id"> = {
    syncKey: newEntitySyncKey(),
    eventId: input.eventId,
    lotId: input.lotId,
    bidderId: input.bidderId,
    type: "primary",
    status: "primary",
    position: 0,
    phrase: input.phrase,
    saleId: null,
    createdAt: now,
    updatedAt: now,
  };
  const claimsTable = (db as unknown as { claims: import("dexie").Table<Claim> }).claims;
  const id = (await claimsTable.add(row)) as number;
  return { ...row, id };
}

export interface CreateBackupInput {
  eventId: number;
  lotId: number;
  bidderId: number;
  position: number;
  phrase?: string;
}

export async function createBackup(
  db: AuctionDB,
  input: CreateBackupInput
): Promise<Claim> {
  const now = new Date();
  const row: Omit<Claim, "id"> = {
    syncKey: newEntitySyncKey(),
    eventId: input.eventId,
    lotId: input.lotId,
    bidderId: input.bidderId,
    type: "backup",
    status: "backup",
    position: input.position,
    phrase: input.phrase,
    saleId: null,
    createdAt: now,
    updatedAt: now,
  };
  const claimsTable = (db as unknown as { claims: import("dexie").Table<Claim> }).claims;
  const id = (await claimsTable.add(row)) as number;
  return { ...row, id };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export async function cancelClaim(db: AuctionDB, claimId: number): Promise<void> {
  const c = await getClaimOrThrow(db, claimId);
  if (c.status === "canceled" || c.status === "expired") return; // already terminal
  const claimsTable = (db as unknown as { claims: import("dexie").Table<Claim> }).claims;
  await claimsTable.update(claimId, { status: "canceled", updatedAt: new Date() });
}

export async function expireClaim(db: AuctionDB, claimId: number): Promise<void> {
  const c = await getClaimOrThrow(db, claimId);
  if (c.status === "canceled" || c.status === "expired") return;
  const claimsTable = (db as unknown as { claims: import("dexie").Table<Claim> }).claims;
  await claimsTable.update(claimId, { status: "expired", updatedAt: new Date() });
}

/**
 * Promote a backup Claim to primary.
 * Promotion alone never creates a Sale (DR-1, ADR-001 §2.5).
 */
export async function promoteClaim(db: AuctionDB, claimId: number): Promise<void> {
  const c = await getClaimOrThrow(db, claimId);
  if (c.status !== "backup") {
    throw new ClaimDomainError(
      "INVALID_TRANSITION",
      `Cannot promote Claim ${claimId}: status is ${c.status}`
    );
  }
  const claimsTable = (db as unknown as { claims: import("dexie").Table<Claim> }).claims;
  await claimsTable.update(claimId, { status: "promoted", updatedAt: new Date() });
}

// ---------------------------------------------------------------------------
// Confirm — the ONLY path that creates a Sale (DR-4)
// ---------------------------------------------------------------------------

export interface ConfirmClaimResult {
  sale: Sale;
  /** true on a same-Claim retry (idempotent) */
  wasIdempotent: boolean;
}

/**
 * Confirm a primary or promoted Claim as the owner of a lot.
 *
 * Invariants enforced:
 *   - Backup (not promoted) cannot be confirmed (ADR-001 §2.5).
 *   - Idempotent: same Claim already confirmed returns existing Sale (§2.6).
 *   - Uniqueness: a different Claim that would create a second active Sale
 *     for the same (eventId, lotId) is rejected (§2.4).
 *   - Replacement-owner path is blocked when prior Sale is not voided;
 *     callers must void the prior Sale via the corrective workflow (§2.7)
 *     before re-confirming. This service cannot void Sales.
 *
 * LIMITATION (documented per spec task §7):
 *   A void/correction model (ADR-3/PR-G) does not yet exist.
 *   Until it is merged, the replacement-owner path remains blocked:
 *   confirmClaim will throw ACTIVE_SALE_EXISTS if a non-voided Sale
 *   for the same (eventId, lotId) exists from a different Claim.
 *
 * @param saleInput  Required fields to create the Sale row (mirrors
 *   existing SaleInvoice flow; caller provides lot description,
 *   hammer amount, clerk initials, etc.).
 */
export interface ConfirmClaimSaleInput {
  displayLotNumber: string;
  paddleNumber: number;
  description: string;
  consignor?: string;
  consignorId?: number;
  quantity: number;
  amount: number;
  clerkInitials: string;
}

export async function confirmClaim(
  db: AuctionDB,
  claimId: number,
  saleInput: ConfirmClaimSaleInput
): Promise<ConfirmClaimResult> {
  const claimsTable = (db as unknown as { claims: import("dexie").Table<Claim> }).claims;

  const claim = await getClaimOrThrow(db, claimId);

  // --- Backup-before-promotion guard (ADR-001 §2.5)
  if (claim.status === "backup") {
    throw new ClaimDomainError(
      "BACKUP_NOT_PROMOTED",
      `Claim ${claimId} is a backup and has not been promoted. ` +
        "Call promoteClaim before confirmClaim."
    );
  }

  // --- Idempotency (ADR-001 §2.6): same Claim already confirmed
  if (claim.saleId != null) {
    const existing = await db.sales.get(claim.saleId);
    if (existing) {
      return { sale: existing, wasIdempotent: true };
    }
  }

  // --- Uniqueness (ADR-001 §2.4): reject a second active confirmed Sale
  //     for the same (eventId, lotId) from a DIFFERENT Claim.
  const existingSales = await db.sales
    .where("eventId")
    .equals(claim.eventId)
    .filter(
      (s: Sale) =>
        s.lotId === claim.lotId &&
        (s as Sale & { status?: string }).status !== "voided"
    )
    .toArray();

  if (existingSales.length > 0) {
    // Check whether it belongs to THIS claim (edge: saleId was just null but Sale exists)
    const thisClaim = existingSales.find(
      (s) => s.id != null && s.id === claim.saleId
    );
    if (!thisClaim) {
      throw new ClaimDomainError(
        "ACTIVE_SALE_EXISTS",
        `An active Sale already exists for lot ${claim.lotId} in event ${claim.eventId}. ` +
          "Void the prior Sale before confirming a replacement owner (ADR-001 §2.7, PR-G).\n" +
          "LIMITATION: The void/correction model (ADR-3/PR-G) is not yet implemented. " +
          "Replacement-owner confirmation is blocked until that PR merges."
      );
    }
  }

  // --- Create the Sale using existing Sale shape (no new statuses invented)
  const now = new Date();
  const newSale: Omit<Sale, "id"> = {
    eventId: claim.eventId,
    lotId: claim.lotId,
    bidderId: claim.bidderId,
    displayLotNumber: saleInput.displayLotNumber,
    paddleNumber: saleInput.paddleNumber,
    description: saleInput.description,
    consignor: saleInput.consignor,
    consignorId: saleInput.consignorId,
    quantity: saleInput.quantity,
    amount: saleInput.amount,
    clerkInitials: saleInput.clerkInitials,
    createdAt: now,
  };

  let saleId!: number;
  await db.transaction(
    "rw",
    [db.sales, (db as unknown as { claims: import("dexie").Table<Claim> }).claims],
    async () => {
      saleId = (await db.sales.add(newSale)) as number;
      await claimsTable.update(claimId, {
        saleId,
        status: claim.status === "promoted" ? "promoted" : "primary",
        updatedAt: now,
      });
    }
  );

  const sale = (await db.sales.get(saleId))!;

  // --- Allocate to Invoice via existing upsertInvoiceForBidder (DR-5)
  const event = await db.events.get(claim.eventId);
  if (event) {
    await upsertInvoiceForBidder(db, event, claim.bidderId);
  }

  return { sale, wasIdempotent: false };
}
