/**
 * Claim service tests — ADR-001 §6.3 acceptance requirements
 *
 * Uses fake-indexeddb so Dexie runs in Node/Vitest without a browser.
 * Each test gets a fresh in-memory DB.
 */
import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { AuctionDB } from "@/lib/db";
import type { AuctionEvent } from "@/lib/db";
import type { Claim } from "@/types/claim";
import {
  createPrimary,
  createBackup,
  cancelClaim,
  expireClaim,
  promoteClaim,
  confirmClaim,
  ClaimDomainError,
} from "@/lib/services/claimService";
import {
  buildEventExport,
  importEventFromPayload,
  EXPORT_VERSION,
} from "@/lib/services/dataPorter";

// ---------------------------------------------------------------------------
// DB factory
// ---------------------------------------------------------------------------

let _dbCounter = 0;
function freshDb(): AuctionDB {
  _dbCounter++;
  return new AuctionDB(`test-claim-${_dbCounter}`);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedEvent(db: AuctionDB): Promise<AuctionEvent & { id: number }> {
  const now = new Date();
  const id = (await db.events.add({
    name: "Test Event",
    organizationName: "Org",
    taxRate: 0,
    buyersPremiumRate: 0,
    defaultConsignorCommissionRate: 0,
    currencySymbol: "$",
    syncId: `sync-${Date.now()}-${Math.random()}`,
    createdAt: now,
    updatedAt: now,
  })) as number;
  return (await db.events.get(id))! as AuctionEvent & { id: number };
}

async function seedBidder(db: AuctionDB, eventId: number, paddleNumber = 1) {
  const now = new Date();
  return (await db.bidders.add({
    eventId,
    paddleNumber,
    firstName: "Alice",
    lastName: "Smith",
    createdAt: now,
    updatedAt: now,
  })) as number;
}

async function seedLot(db: AuctionDB, eventId: number) {
  const now = new Date();
  return (await db.lots.add({
    eventId,
    baseLotNumber: 1,
    lotSuffix: "",
    displayLotNumber: "1",
    description: "Test Lot",
    quantity: 1,
    status: "unsold",
    createdAt: now,
    updatedAt: now,
  })) as number;
}

const saleInputFor = (lotDisplay = "1", paddleNum = 1) => ({
  displayLotNumber: lotDisplay,
  paddleNumber: paddleNum,
  description: "Test Lot",
  quantity: 1,
  amount: 100,
  clerkInitials: "JQ",
});

type ClaimsTable = Dexie.Table<Claim>;
const ct = (db: AuctionDB) =>
  (db as unknown as { claims: ClaimsTable }).claims;

// ---------------------------------------------------------------------------
// 1. Primary creation — no Sale or Invoice created
// ---------------------------------------------------------------------------

describe("createPrimary", () => {
  it("creates a primary Claim without creating a Sale or Invoice", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });

    expect(claim.status).toBe("primary");
    expect(claim.type).toBe("primary");
    expect(claim.saleId).toBeNull();
    expect(await db.sales.count()).toBe(0);
    expect(await db.invoices.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Backup creation — no Sale or Invoice created
// ---------------------------------------------------------------------------

describe("createBackup", () => {
  it("creates a backup Claim without creating a Sale or Invoice", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createBackup(db, {
      eventId: event.id,
      lotId,
      bidderId,
      position: 1,
    });

    expect(claim.status).toBe("backup");
    expect(claim.type).toBe("backup");
    expect(claim.saleId).toBeNull();
    expect(await db.sales.count()).toBe(0);
    expect(await db.invoices.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Promotion — no Sale created
// ---------------------------------------------------------------------------

describe("promoteClaim", () => {
  it("promotes a backup without creating a Sale", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createBackup(db, {
      eventId: event.id,
      lotId,
      bidderId,
      position: 1,
    });
    await promoteClaim(db, claim.id!);

    const updated = await ct(db).get(claim.id!);
    expect(updated!.status).toBe("promoted");
    expect(await db.sales.count()).toBe(0);
  });

  it("rejects promotion of a non-backup Claim", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    await expect(promoteClaim(db, claim.id!)).rejects.toBeInstanceOf(ClaimDomainError);
  });
});

// ---------------------------------------------------------------------------
// 4. Confirmation — creates exactly one Sale and updates Invoice
// ---------------------------------------------------------------------------

describe("confirmClaim", () => {
  it("confirms a primary Claim and creates one Sale + Invoice", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    const { sale, wasIdempotent } = await confirmClaim(
      db,
      claim.id!,
      saleInputFor()
    );

    expect(wasIdempotent).toBe(false);
    expect(sale.lotId).toBe(lotId);
    expect(sale.bidderId).toBe(bidderId);
    expect(await db.sales.count()).toBe(1);
    expect(await db.invoices.count()).toBe(1);
  });

  it("confirms a promoted Claim and creates one Sale", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createBackup(db, {
      eventId: event.id,
      lotId,
      bidderId,
      position: 1,
    });
    await promoteClaim(db, claim.id!);
    const { sale } = await confirmClaim(db, claim.id!, saleInputFor());

    expect(sale.bidderId).toBe(bidderId);
    expect(await db.sales.count()).toBe(1);
  });

  it("same-Claim retry returns existing Sale (idempotent)", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    const r1 = await confirmClaim(db, claim.id!, saleInputFor());
    const r2 = await confirmClaim(db, claim.id!, saleInputFor());

    expect(r2.wasIdempotent).toBe(true);
    expect(r2.sale.id).toBe(r1.sale.id);
    expect(await db.sales.count()).toBe(1);
  });

  it("rejects confirming a backup before promotion", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createBackup(db, {
      eventId: event.id,
      lotId,
      bidderId,
      position: 1,
    });
    let caught: unknown;
    try {
      await confirmClaim(db, claim.id!, saleInputFor());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClaimDomainError);
    expect((caught as ClaimDomainError).code).toBe("BACKUP_NOT_PROMOTED");
  });

  it("rejects confirming a canceled Claim", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    await cancelClaim(db, claim.id!);

    let caught: unknown;
    try {
      await confirmClaim(db, claim.id!, saleInputFor());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClaimDomainError);
    expect((caught as ClaimDomainError).code).toBe("INVALID_TRANSITION");
    expect(await db.sales.count()).toBe(0);
    expect(await db.invoices.count()).toBe(0);
  });

  it("rejects confirming an expired Claim", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createBackup(db, {
      eventId: event.id,
      lotId,
      bidderId,
      position: 1,
    });
    await expireClaim(db, claim.id!);

    let caught: unknown;
    try {
      await confirmClaim(db, claim.id!, saleInputFor());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClaimDomainError);
    expect((caught as ClaimDomainError).code).toBe("INVALID_TRANSITION");
    expect(await db.sales.count()).toBe(0);
    expect(await db.invoices.count()).toBe(0);
  });

  it("rejects second active owner for the same (eventId, lotId)", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidder1 = await seedBidder(db, event.id, 1);
    const now = new Date();
    const bidder2 = (await db.bidders.add({
      eventId: event.id,
      paddleNumber: 2,
      firstName: "Bob",
      lastName: "Jones",
      createdAt: now,
      updatedAt: now,
    })) as number;
    const lotId = await seedLot(db, event.id);

    const c1 = await createPrimary(db, {
      eventId: event.id,
      lotId,
      bidderId: bidder1,
    });
    await confirmClaim(db, c1.id!, saleInputFor());

    const c2 = await createPrimary(db, {
      eventId: event.id,
      lotId,
      bidderId: bidder2,
    });
    await expect(
      confirmClaim(db, c2.id!, saleInputFor())
    ).rejects.toBeInstanceOf(ClaimDomainError);

    expect(await db.sales.count()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Atomicity rollback test
  // Simulate a failure after Sale insert (during Invoice upsert) by patching
  // the event row to have a null eventId so upsertInvoiceForBidder throws.
  // Dexie's transaction abort must roll back Sale and Claim.saleId.
  // -------------------------------------------------------------------------
  it("rolls back Sale and Claim.saleId when Invoice allocation fails", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);
    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });

    // Delete the event row so upsertInvoiceForBidder's event lookup returns
    // undefined; the service will skip invoice creation in that case.
    // Instead, we monkey-patch db.invoices.add to throw inside the transaction.
    const origAdd = db.invoices.add.bind(db.invoices);
    (db.invoices as unknown as Record<string, unknown>).add = () => {
      throw new Error("Simulated invoice failure");
    };

    let threw = false;
    try {
      await confirmClaim(db, claim.id!, saleInputFor());
    } catch {
      threw = true;
    } finally {
      // Restore
      (db.invoices as unknown as Record<string, unknown>).add = origAdd;
    }

    expect(threw).toBe(true);
    expect(await db.sales.count()).toBe(0);
    expect(await db.invoices.count()).toBe(0);
    const refreshed = await ct(db).get(claim.id!);
    expect(refreshed!.saleId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Cancel / expire transitions
// ---------------------------------------------------------------------------

describe("cancelClaim / expireClaim", () => {
  it("cancel sets status to canceled and creates no Sale", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    await cancelClaim(db, claim.id!);

    const updated = await ct(db).get(claim.id!);
    expect(updated!.status).toBe("canceled");
    expect(await db.sales.count()).toBe(0);
  });

  it("expire sets status to expired and creates no Sale", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createBackup(db, {
      eventId: event.id,
      lotId,
      bidderId,
      position: 1,
    });
    await expireClaim(db, claim.id!);

    const updated = await ct(db).get(claim.id!);
    expect(updated!.status).toBe("expired");
    expect(await db.sales.count()).toBe(0);
  });

  it("cancelClaim on a confirmed Claim throws INVALID_TRANSITION", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    await confirmClaim(db, claim.id!, saleInputFor());

    let caught: unknown;
    try {
      await cancelClaim(db, claim.id!);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClaimDomainError);
    expect((caught as ClaimDomainError).code).toBe("INVALID_TRANSITION");
    // Sale and Invoice remain untouched
    expect(await db.sales.count()).toBe(1);
    expect(await db.invoices.count()).toBe(1);
  });

  it("expireClaim on a confirmed Claim throws INVALID_TRANSITION", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    await confirmClaim(db, claim.id!, saleInputFor());

    let caught: unknown;
    try {
      await expireClaim(db, claim.id!);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClaimDomainError);
    expect((caught as ClaimDomainError).code).toBe("INVALID_TRANSITION");
    expect(await db.sales.count()).toBe(1);
    expect(await db.invoices.count()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Queue-order preservation
// ---------------------------------------------------------------------------

describe("queue-order preservation", () => {
  it("preserves backup position through export/import round trip", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const b1 = await seedBidder(db, event.id, 1);
    const now = new Date();
    const b2 = (await db.bidders.add({
      eventId: event.id,
      paddleNumber: 2,
      firstName: "Carol",
      lastName: "White",
      createdAt: now,
      updatedAt: now,
    })) as number;
    const b3 = (await db.bidders.add({
      eventId: event.id,
      paddleNumber: 3,
      firstName: "Dave",
      lastName: "Brown",
      createdAt: now,
      updatedAt: now,
    })) as number;
    const lotId = await seedLot(db, event.id);

    await createBackup(db, { eventId: event.id, lotId, bidderId: b1, position: 1 });
    await createBackup(db, { eventId: event.id, lotId, bidderId: b2, position: 2 });
    await createBackup(db, { eventId: event.id, lotId, bidderId: b3, position: 3 });

    const payload = await buildEventExport(db, event.id);
    const db2 = freshDb();
    await importEventFromPayload(db2, payload);

    const claims = await ct(db2)
      .where("status")
      .equals("backup")
      .toArray();
    const positions = claims.map((c) => c.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// 7. Export/import round trip and reference remapping
// ---------------------------------------------------------------------------

describe("dataPorter Claim round trip", () => {
  it("exports and re-imports a Claim with all references remapped", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    await createPrimary(db, { eventId: event.id, lotId, bidderId, phrase: "SOLD" });

    const payload = await buildEventExport(db, event.id);
    expect(payload.exportVersion).toBe(EXPORT_VERSION);
    expect(payload.claims).toHaveLength(1);
    expect(payload.claims![0].phrase).toBe("SOLD");

    const db2 = freshDb();
    await importEventFromPayload(db2, payload);

    const claims = await ct(db2).toArray();
    expect(claims).toHaveLength(1);

    const newEvent = (await db2.events.toArray())[0]!;
    const newBidder = (await db2.bidders.toArray())[0]!;
    const newLot = (await db2.lots.toArray())[0]!;

    expect(claims[0].eventId).toBe(newEvent.id);
    expect(claims[0].bidderId).toBe(newBidder.id);
    expect(claims[0].lotId).toBe(newLot.id);
    // Unconfirmed claim: saleId should be null
    expect(claims[0].saleId).toBeNull();
  });

  it("exports and re-imports a confirmed Claim with remapped saleId", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    await confirmClaim(db, claim.id!, saleInputFor());

    const payload = await buildEventExport(db, event.id);
    const db2 = freshDb();
    await importEventFromPayload(db2, payload);

    const importedClaims = await ct(db2).toArray();
    expect(importedClaims).toHaveLength(1);

    const importedSales = await db2.sales.toArray();
    expect(importedSales).toHaveLength(1);

    // saleId must be remapped to the new Sale id in db2
    expect(importedClaims[0].saleId).toBe(importedSales[0].id);
  });

  it("old export (no claims array) imports without error", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    await seedBidder(db, event.id);
    await seedLot(db, event.id);

    const payload = await buildEventExport(db, event.id);
    const oldPayload = { ...payload, exportVersion: 6, claims: undefined };

    const db2 = freshDb();
    await expect(importEventFromPayload(db2, oldPayload as never)).resolves.toBeDefined();
  });

  it("rejects import when Claim references a missing bidder", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    await createPrimary(db, { eventId: event.id, lotId, bidderId });
    const payload = await buildEventExport(db, event.id);

    const corrupt = {
      ...payload,
      claims: payload.claims!.map((c) => ({ ...c, legacyBidderId: 99999 })),
    };

    const db2 = freshDb();
    await expect(importEventFromPayload(db2, corrupt as never)).rejects.toThrow();
  });

  it("rejects import when Claim references a missing lot", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    await createPrimary(db, { eventId: event.id, lotId, bidderId });
    const payload = await buildEventExport(db, event.id);

    const corrupt = {
      ...payload,
      claims: payload.claims!.map((c) => ({ ...c, legacyLotId: 99999 })),
    };

    const db2 = freshDb();
    await expect(importEventFromPayload(db2, corrupt as never)).rejects.toThrow(
      /unknown lot/
    );
  });

  it("rejects import when confirmed Claim references a missing Sale", async () => {
    const db = freshDb();
    const event = await seedEvent(db);
    const bidderId = await seedBidder(db, event.id);
    const lotId = await seedLot(db, event.id);

    const claim = await createPrimary(db, { eventId: event.id, lotId, bidderId });
    await confirmClaim(db, claim.id!, saleInputFor());
    const payload = await buildEventExport(db, event.id);

    // Corrupt: point saleId to a non-existent legacy sale id
    const corrupt = {
      ...payload,
      claims: payload.claims!.map((c) => ({ ...c, legacySaleId: 99999 })),
    };

    const db2 = freshDb();
    await expect(importEventFromPayload(db2, corrupt as never)).rejects.toThrow(
      /Sale legacyId=99999/
    );
  });
});
