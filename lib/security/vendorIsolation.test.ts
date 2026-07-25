/**
 * Vendor-isolation integration tests — /api/sync/push, /api/sync/event, /api/sync/list
 *
 * Strategy: unit-style with vi.mock so these run in vitest (node env) without
 * a live DB or running Next.js server. Each test mocks getServerSession and
 * the sql tag, then calls the route POST/GET/DELETE handler directly.
 *
 * "Failing-first" means each test is written to expose a real weakness IF one
 * exists, then asserts the CORRECT behaviour. Tests that currently pass prove
 * the route is already safe. Tests marked EXPECTED-FAIL document gaps where
 * the route does NOT yet enforce the invariant.
 *
 * Two test vendors:
 *   VENDOR_A = { id: 10, userId: 101, syncId: 'aaaaaaaa-…' }
 *   VENDOR_B = { id: 20, userId: 201, syncId: 'bbbbbbbb-…' }
 *
 * No production data. All SQL responses are mocked.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const VENDOR_A = { vendorId: "10", userId: "101" };
const VENDOR_B = { vendorId: "20", userId: "201" };

const SYNC_ID_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const SYNC_ID_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const PAYLOAD_A = {
  exportVersion: 6,
  exportDate: new Date().toISOString(),
  appVersion: "test",
  event: { name: "Vendor A Sale", createdAt: new Date().toISOString() },
  bidders: [],
  consignors: [],
  lots: [],
  sales: [],
  invoices: [],
};

// A payload that belongs to Vendor A but embeds child IDs that could
// reference Vendor B records if the server doesn't validate ownership.
const PAYLOAD_WITH_FOREIGN_CHILD_IDS = {
  ...PAYLOAD_A,
  bidders: [
    {
      // legacyId is a Vendor B local integer — server stores raw JSONB,
      // no ownership check on embedded IDs.
      legacyId: 9999,
      paddleNumber: 1,
      name: "Foreign Bidder",
      syncKey: "foreign-sync-key",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  lots: [
    {
      legacyId: 8888,
      lotNumber: 1,
      title: "Foreign Lot",
      syncKey: "foreign-lot-key",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  sales: [
    {
      // References Vendor B's local lot/bidder IDs — gap: server stores
      // these as raw JSONB without verifying cross-vendor ownership.
      legacyLotId: 8888,
      legacyBidderId: 9999,
      hammerPrice: 100,
      quantity: 1,
      syncKey: "foreign-sale-key",
      createdAt: new Date().toISOString(),
    },
  ],
};

// ---------------------------------------------------------------------------
// Module mocks (must be declared before imports that use them)
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/db/postgres", () => ({ sql: vi.fn() }));
vi.mock("@/lib/ably/publishEventSync", () => ({
  publishEventSyncNudge: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { sql } from "@/lib/db/postgres";

// Route handlers — imported after mocks are registered.
import { POST as syncPush } from "@/app/api/sync/push/route";
import {
  GET as syncEventGet,
  DELETE as syncEventDelete,
} from "@/app/api/sync/event/route";
import { GET as syncList } from "@/app/api/sync/list/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sessionFor(vendor: typeof VENDOR_A) {
  return { user: { id: vendor.userId, vendorId: vendor.vendorId } };
}

function mockSession(vendor: typeof VENDOR_A | null) {
  (getServerSession as Mock).mockResolvedValue(
    vendor ? sessionFor(vendor) : null
  );
}

function mockSqlEmpty() {
  (sql as unknown as Mock).mockResolvedValue({ rows: [] });
}

function mockSqlRows<T>(rows: T[]) {
  (sql as unknown as Mock).mockResolvedValue({ rows });
}

function makePushRequest(
  body: Record<string, unknown>,
  url = "http://localhost/api/sync/push"
) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params: Record<string, string>, path: string) {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

function makeDeleteRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/sync/event");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "DELETE" });
}

async function status(res: Response | NextResponse) {
  return res.status;
}

async function json(res: Response | NextResponse) {
  return res.json();
}

// ---------------------------------------------------------------------------
// SUITE 1: Unauthenticated requests
// ---------------------------------------------------------------------------

describe("Unauthenticated requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(null);
  });

  it("POST /api/sync/push → 401 with no session", async () => {
    const res = await syncPush(
      makePushRequest({
        eventSyncId: SYNC_ID_A,
        payload: PAYLOAD_A,
        clientExportedAt: new Date().toISOString(),
      })
    );
    expect(await status(res)).toBe(401);
    const body = await json(res);
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("GET /api/sync/event → 401 with no session", async () => {
    const res = await syncEventGet(
      makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event")
    );
    expect(await status(res)).toBe(401);
  });

  it("DELETE /api/sync/event → 401 with no session", async () => {
    const res = await syncEventDelete(
      makeDeleteRequest({ syncId: SYNC_ID_B })
    );
    expect(await status(res)).toBe(401);
  });

  it("GET /api/sync/list → 401 with no session", async () => {
    const res = await syncList(new Request("http://localhost/api/sync/list"));
    expect(await status(res)).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// SUITE 2: Expired / invalid session (vendorId missing or non-numeric)
// ---------------------------------------------------------------------------

describe("Expired / malformed session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /api/sync/push → 401 when vendorId is not a number", async () => {
    (getServerSession as Mock).mockResolvedValue({
      user: { id: "101", vendorId: "not-a-number" },
    });
    const res = await syncPush(
      makePushRequest({
        eventSyncId: SYNC_ID_A,
        payload: PAYLOAD_A,
        clientExportedAt: new Date().toISOString(),
      })
    );
    expect(await status(res)).toBe(401);
  });

  it("GET /api/sync/event → 401 when vendorId is missing", async () => {
    (getServerSession as Mock).mockResolvedValue({
      user: { id: "101", vendorId: undefined },
    });
    const res = await syncEventGet(
      makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event")
    );
    expect(await status(res)).toBe(401);
  });

  it("DELETE /api/sync/event → 401 when vendorId is missing", async () => {
    (getServerSession as Mock).mockResolvedValue({
      user: { id: "101", vendorId: undefined },
    });
    const res = await syncEventDelete(makeDeleteRequest({ syncId: SYNC_ID_B }));
    expect(await status(res)).toBe(401);
  });

  it("GET /api/sync/list → 401 when vendorId is missing", async () => {
    (getServerSession as Mock).mockResolvedValue({
      user: { id: "101", vendorId: undefined },
    });
    const res = await syncList(new Request("http://localhost/api/sync/list"));
    expect(await status(res)).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// SUITE 3: Vendor A cannot read Vendor B events (GET /api/sync/event)
// ---------------------------------------------------------------------------

describe("Vendor A cannot read Vendor B events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
  });

  it("returns 404 when Vendor A requests Vendor B syncId (DB returns empty)", async () => {
    mockSqlEmpty();
    const res = await syncEventGet(
      makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event")
    );
    expect(await status(res)).toBe(404);
    const body = await json(res);
    expect(body.error).toMatch(/not found/i);
  });

  it("SQL called with Vendor A vendorId (10), not Vendor B vendorId (20)", async () => {
    mockSqlEmpty();
    await syncEventGet(
      makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event")
    );
    const calls = (sql as unknown as Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const allValues = calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
});

// ---------------------------------------------------------------------------
// SUITE 4: Vendor A cannot overwrite Vendor B events (POST /api/sync/push)
// ---------------------------------------------------------------------------

describe("Vendor A cannot overwrite Vendor B events via push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
  });

  it("push with Vendor B syncId inserts under Vendor A vendorId (10), not Vendor B (20)", async () => {
    (sql as unknown as Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] });

    const res = await syncPush(
      makePushRequest({
        eventSyncId: SYNC_ID_B,
        payload: PAYLOAD_A,
        clientExportedAt: new Date().toISOString(),
      })
    );
    expect(await status(res)).toBe(200);

    const allValues = (sql as unknown as Mock).mock.calls.flatMap(
      ([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals
    );
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });

  it("push with force:true and Vendor B syncId still scopes to Vendor A only", async () => {
    (sql as unknown as Mock).mockResolvedValue({
      rows: [{ updated_at: new Date() }],
    });
    const res = await syncPush(
      makePushRequest({
        eventSyncId: SYNC_ID_B,
        payload: PAYLOAD_A,
        clientExportedAt: new Date().toISOString(),
        force: true,
      })
    );
    expect(await status(res)).toBe(200);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(
      ([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals
    );
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
});

// ---------------------------------------------------------------------------
// SUITE 5: Vendor A cannot delete Vendor B events (DELETE /api/sync/event)
// ---------------------------------------------------------------------------

describe("Vendor A cannot delete Vendor B events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
  });

  it("DELETE with Vendor B syncId scopes DELETE to Vendor A vendorId only", async () => {
    mockSqlEmpty();
    const res = await syncEventDelete(
      makeDeleteRequest({ syncId: SYNC_ID_B })
    );
    expect(await status(res)).toBe(200);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(
      ([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals
    );
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
});

// ---------------------------------------------------------------------------
// SUITE 6: Vendor A list does not expose Vendor B events
// ---------------------------------------------------------------------------

describe("GET /api/sync/list scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
  });

  it("list returns only rows WHERE vendor_id = Vendor A (10)", async () => {
    mockSqlRows([{ event_sync_id: SYNC_ID_A, updated_at: new Date() }]);
    const res = await syncList(new Request("http://localhost/api/sync/list"));
    expect(await status(res)).toBe(200);
    const body = await json(res);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventSyncId).toBe(SYNC_ID_A);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(
      ([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals
    );
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });

  it("Vendor B syncId is never returned in Vendor A list", async () => {
    mockSqlRows([{ event_sync_id: SYNC_ID_A, updated_at: new Date() }]);
    const res = await syncList(new Request("http://localhost/api/sync/list"));
    const body = await json(res);
    const syncIds = body.events.map((e: { eventSyncId: string }) => e.eventSyncId);
    expect(syncIds).not.toContain(SYNC_ID_B);
  });
});

// ---------------------------------------------------------------------------
// SUITE 7: Foreign child IDs in push payload (GAP — expected to fail)
// ---------------------------------------------------------------------------

describe("Foreign child IDs in push payload (GAP — expected to fail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
    (sql as unknown as Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] });
  });

  it(
    "[GAP] push with foreign bidder/lot/sale IDs in payload should be rejected (currently accepted)",
    async () => {
      const res = await syncPush(
        makePushRequest({
          eventSyncId: SYNC_ID_A,
          payload: PAYLOAD_WITH_FOREIGN_CHILD_IDS,
          clientExportedAt: new Date().toISOString(),
        })
      );
      expect(await status(res)).toBe(400); // EXPECTED TO FAIL until gap is fixed
    }
  );
});

// ---------------------------------------------------------------------------
// SUITE 8: Cursor / timestamp manipulation
// ---------------------------------------------------------------------------

describe("Timestamp manipulation via clientExportedAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
  });

  it("without force, stale clientExportedAt is rejected with 409", async () => {
    const newerServerTime = new Date(Date.now() + 60_000);
    mockSqlRows([{ updated_at: newerServerTime }]);
    const res = await syncPush(
      makePushRequest({
        eventSyncId: SYNC_ID_A,
        payload: PAYLOAD_A,
        clientExportedAt: new Date(Date.now() - 60_000).toISOString(),
        force: false,
      })
    );
    expect(await status(res)).toBe(409);
    const body = await json(res);
    expect(body.code).toBe("sync_conflict");
  });

  it(
    "[GAP] force:true allows overwriting a newer server snapshot (no auth restriction)",
    async () => {
      (sql as unknown as Mock).mockResolvedValue({
        rows: [{ updated_at: new Date() }],
      });
      const res = await syncPush(
        makePushRequest({
          eventSyncId: SYNC_ID_A,
          payload: PAYLOAD_A,
          clientExportedAt: new Date(Date.now() - 60_000).toISOString(),
          force: true,
        })
      );
      expect(await status(res)).toBe(200); // confirms gap exists
    }
  );
});

// ---------------------------------------------------------------------------
// SUITE 9: Valid cross-vendor session
// ---------------------------------------------------------------------------

describe("Valid cross-vendor session (Vendor B cannot see Vendor A data)", () => {
  it("GET /api/sync/event with Vendor B session and Vendor A syncId returns 404", async () => {
    vi.clearAllMocks();
    mockSession(VENDOR_B);
    mockSqlEmpty();
    const res = await syncEventGet(
      makeGetRequest({ syncId: SYNC_ID_A }, "/api/sync/event")
    );
    expect(await status(res)).toBe(404);
  });

  it("GET /api/sync/list with Vendor B session returns only Vendor B events", async () => {
    vi.clearAllMocks();
    mockSession(VENDOR_B);
    mockSqlRows([{ event_sync_id: SYNC_ID_B, updated_at: new Date() }]);
    const res = await syncList(new Request("http://localhost/api/sync/list"));
    const body = await json(res);
    const ids = body.events.map((e: { eventSyncId: string }) => e.eventSyncId);
    expect(ids).not.toContain(SYNC_ID_A);
    expect(ids).toContain(SYNC_ID_B);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(
      ([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals
    );
    expect(allValues).toContain(20);
    expect(allValues).not.toContain(10);
  });

  it("DELETE /api/sync/event with Vendor B session and Vendor A syncId scopes to Vendor B only", async () => {
    vi.clearAllMocks();
    mockSession(VENDOR_B);
    mockSqlEmpty();
    const res = await syncEventDelete(
      makeDeleteRequest({ syncId: SYNC_ID_A })
    );
    expect(await status(res)).toBe(200);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(
      ([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals
    );
    expect(allValues).toContain(20);
    expect(allValues).not.toContain(10);
  });
});

// ---------------------------------------------------------------------------
// SUITE 10: HTTP behavior — invalid syncId format
// ---------------------------------------------------------------------------

describe("HTTP behavior — invalid syncId format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
  });

  it("GET /api/sync/event with non-UUID syncId returns 400", async () => {
    const res = await syncEventGet(
      makeGetRequest({ syncId: "not-a-uuid" }, "/api/sync/event")
    );
    expect(await status(res)).toBe(400);
  });

  it("DELETE /api/sync/event with non-UUID syncId returns 400", async () => {
    const res = await syncEventDelete(
      makeDeleteRequest({ syncId: "not-a-uuid" })
    );
    expect(await status(res)).toBe(400);
  });

  it("POST /api/sync/push with non-UUID eventSyncId returns 400", async () => {
    const res = await syncPush(
      makePushRequest({
        eventSyncId: "not-a-uuid",
        payload: PAYLOAD_A,
        clientExportedAt: new Date().toISOString(),
      })
    );
    expect(await status(res)).toBe(400);
  });

  it("POST /api/sync/push with missing payload returns 400", async () => {
    const res = await syncPush(
      makePushRequest({
        eventSyncId: SYNC_ID_A,
        clientExportedAt: new Date().toISOString(),
      })
    );
    expect(await status(res)).toBe(400);
  });

  it("POST /api/sync/push with missing clientExportedAt returns 400", async () => {
    const res = await syncPush(
      makePushRequest({
        eventSyncId: SYNC_ID_A,
        payload: PAYLOAD_A,
      })
    );
    expect(await status(res)).toBe(400);
  });
});
