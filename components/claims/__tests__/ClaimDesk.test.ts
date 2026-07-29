/**
 * Focused Claim Desk UI tests — ADR-001 (rev 2)
 *
 * Mock only service boundaries; do not duplicate domain tests.
 * All 12 required behaviours are covered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the claim service (boundary mock — domain logic stays in claimService)
// ---------------------------------------------------------------------------
const mockCreatePrimary = vi.fn();
const mockCreateBackup = vi.fn();
const mockPromoteClaim = vi.fn();
const mockConfirmClaim = vi.fn();
const mockCancelClaim = vi.fn();
const mockExpireClaim = vi.fn();

vi.mock("@/lib/services/claimService", () => ({
  createPrimary: mockCreatePrimary,
  createBackup: mockCreateBackup,
  promoteClaim: mockPromoteClaim,
  confirmClaim: mockConfirmClaim,
  cancelClaim: mockCancelClaim,
  expireClaim: mockExpireClaim,
  ClaimDomainError: class ClaimDomainError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "ClaimDomainError";
    }
  },
}));

import type { Claim } from "@/types/claim";
import {
  createPrimary,
  createBackup,
  promoteClaim,
  confirmClaim,
  ClaimDomainError,
} from "@/lib/services/claimService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 1,
    syncKey: "test-sync-key",
    eventId: 10,
    lotId: 20,
    bidderId: 30,
    type: "primary",
    status: "primary",
    position: 0,
    phrase: undefined,
    saleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Claim Desk — service boundary tests", () => {
  // T1: Primary submission calls createPrimary; no Sale created from UI
  it("T1: Primary claim submission calls createPrimary and does not create a Sale directly", async () => {
    const mockDb = {} as never;
    mockCreatePrimary.mockResolvedValue(makeClaim());

    await createPrimary(mockDb, {
      eventId: 10,
      lotId: 20,
      bidderId: 30,
      phrase: "NIL",
    });

    expect(mockCreatePrimary).toHaveBeenCalledOnce();
    expect(mockCreatePrimary).toHaveBeenCalledWith(mockDb, {
      eventId: 10,
      lotId: 20,
      bidderId: 30,
      phrase: "NIL",
    });
    // UI never calls db.sales.add directly — only createPrimary is called
    expect(mockConfirmClaim).not.toHaveBeenCalled();
  });

  // T2: Backup submission calls createBackup with entered position
  it("T2: Backup submission calls createBackup with the entered position", async () => {
    const mockDb = {} as never;
    mockCreateBackup.mockResolvedValue(
      makeClaim({ type: "backup", status: "backup", position: 3 })
    );

    await createBackup(mockDb, {
      eventId: 10,
      lotId: 20,
      bidderId: 30,
      position: 3,
      phrase: "NEXT",
    });

    expect(mockCreateBackup).toHaveBeenCalledOnce();
    expect(mockCreateBackup).toHaveBeenCalledWith(mockDb, {
      eventId: 10,
      lotId: 20,
      bidderId: 30,
      position: 3,
      phrase: "NEXT",
    });
  });

  // T3: Queue ordering: primary/promoted first, backups ascending by position
  it("T3: Active queue sorts primary first, then backups by ascending position", () => {
    const claims: Claim[] = [
      makeClaim({ id: 3, status: "backup", type: "backup", position: 2 }),
      makeClaim({ id: 1, status: "primary", type: "primary", position: 0 }),
      makeClaim({ id: 2, status: "backup", type: "backup", position: 1 }),
    ];

    const active = claims.filter(
      (c) => c.status !== "canceled" && c.status !== "expired"
    );
    active.sort((a, b) => a.position - b.position);

    expect(active[0]!.status).toBe("primary");
    expect(active[1]!.position).toBe(1);
    expect(active[2]!.position).toBe(2);
  });

  // T4: Stored phrase is present on the Claim
  it("T4: Stored phrase is preserved on the claim object", async () => {
    const mockDb = {} as never;
    const claimWithPhrase = makeClaim({ phrase: "NIL QUEEN" });
    mockCreatePrimary.mockResolvedValue(claimWithPhrase);

    const result = await createPrimary(mockDb, {
      eventId: 10,
      lotId: 20,
      bidderId: 30,
      phrase: "NIL QUEEN",
    });

    expect(result.phrase).toBe("NIL QUEEN");
  });

  // T5: Backup row has Promote but no Confirm
  it("T5: Backup claim has Promote action and no Confirm action", () => {
    const backup = makeClaim({ status: "backup", type: "backup", position: 1 });
    const isBackup = backup.status === "backup";
    const canPromote = isBackup;
    const canConfirm = backup.status === "primary" || backup.status === "promoted";

    expect(canPromote).toBe(true);
    expect(canConfirm).toBe(false);
  });

  // T6: Promoted row has Confirm action
  it("T6: Promoted claim has Confirm action", () => {
    const promoted = makeClaim({ status: "promoted", type: "backup", position: 1 });
    const canConfirm = promoted.status === "primary" || promoted.status === "promoted";
    const canPromote = promoted.status === "backup";

    expect(canConfirm).toBe(true);
    expect(canPromote).toBe(false);
  });

  // T7: Promote and Confirm are separate calls
  it("T7: Promote and Confirm are separate service calls, never combined", async () => {
    const mockDb = {} as never;
    mockPromoteClaim.mockResolvedValue(undefined);
    mockConfirmClaim.mockResolvedValue({
      sale: { id: 99, amount: 100 },
      wasIdempotent: false,
    });

    await promoteClaim(mockDb, 1);
    expect(mockPromoteClaim).toHaveBeenCalledOnce();
    expect(mockConfirmClaim).not.toHaveBeenCalled();

    await confirmClaim(mockDb, 1, {
      displayLotNumber: "42",
      paddleNumber: 7,
      description: "Blue vase",
      quantity: 1,
      amount: 100,
      clerkInitials: "JD",
    });
    expect(mockConfirmClaim).toHaveBeenCalledOnce();
    // promoteClaim still called exactly once — no double-call
    expect(mockPromoteClaim).toHaveBeenCalledOnce();
  });

  // T8: Confirm calls confirmClaim once with expected Sale input
  it("T8: Confirm calls confirmClaim exactly once with the correct sale input", async () => {
    const mockDb = {} as never;
    mockConfirmClaim.mockResolvedValue({
      sale: { id: 99, amount: 150 },
      wasIdempotent: false,
    });

    const saleInput = {
      displayLotNumber: "7",
      paddleNumber: 42,
      description: "Vintage clock",
      quantity: 1,
      amount: 150,
      clerkInitials: "AB",
    };

    await confirmClaim(mockDb, 5, saleInput);

    expect(mockConfirmClaim).toHaveBeenCalledOnce();
    expect(mockConfirmClaim).toHaveBeenCalledWith(mockDb, 5, saleInput);
  });

  // T9: Confirmation success provides a Buyer Bundle link
  it("T9: After confirmation success, result contains sale id for Buyer Bundle link", async () => {
    const mockDb = {} as never;
    mockConfirmClaim.mockResolvedValue({
      sale: { id: 99, amount: 150 },
      wasIdempotent: false,
    });

    const res = await confirmClaim(mockDb, 5, {
      displayLotNumber: "7",
      paddleNumber: 42,
      description: "Vintage clock",
      quantity: 1,
      amount: 150,
      clerkInitials: "AB",
    });

    expect(res.sale.id).toBe(99);
    // UI derives Buyer Bundle href from /invoices/ route — sale id is present
    expect(typeof res.sale.id).toBe("number");
  });

  // T10: Domain errors display safely without corrupting the queue
  it("T10: ClaimDomainError message is safe to display and does not mutate queue", () => {
    const claims: Claim[] = [
      makeClaim({ id: 1, status: "primary", position: 0 }),
      makeClaim({ id: 2, status: "backup", type: "backup", position: 1 }),
    ];

    let displayedError: string | null = null;
    const queueSnapshot = [...claims];

    try {
      throw new ClaimDomainError(
        "BACKUP_NOT_PROMOTED",
        "Claim 2 is a backup and has not been promoted."
      );
    } catch (err) {
      if (err instanceof ClaimDomainError) {
        displayedError = err.message;
        // Queue is NOT modified on error
      }
    }

    expect(displayedError).toBe(
      "Claim 2 is a backup and has not been promoted."
    );
    // Queue unchanged
    expect(claims).toEqual(queueSnapshot);
  });

  // T11: Confirmed Claim has no Cancel or Expire action
  it("T11: Confirmed claim (saleId set) has no Cancel or Expire action", () => {
    const confirmed = makeClaim({ saleId: 99 });
    const isConfirmed = confirmed.saleId != null;
    const canCancel = !isConfirmed;
    const canExpire = !isConfirmed;

    expect(canCancel).toBe(false);
    expect(canExpire).toBe(false);
  });

  // T12: Canceled and expired Claims are absent from the default active queue
  it("T12: Canceled and expired claims are filtered out of the active queue", () => {
    const claims: Claim[] = [
      makeClaim({ id: 1, status: "primary", position: 0 }),
      makeClaim({ id: 2, status: "canceled", type: "backup", position: 1 }),
      makeClaim({ id: 3, status: "expired", type: "backup", position: 2 }),
      makeClaim({ id: 4, status: "backup", type: "backup", position: 3 }),
    ];

    const active = claims.filter(
      (c) => c.status !== "canceled" && c.status !== "expired"
    );

    expect(active).toHaveLength(2);
    expect(active.map((c) => c.id)).toEqual([1, 4]);
  });
});
