/**
 * Vendor-isolation integration tests — /api/sync/push, /api/sync/event, /api/sync/list
 *
 * Strategy: unit-style with vi.mock so these run in vitest (node env) without
 * a live DB or running Next.js server. Each test mocks getServerSession and
 * the sql tag, then calls the route POST/GET/DELETE handler directly.
 *
 * Two test vendors:
 *   VENDOR_A = { id: 10, userId: 101, syncId: 'aaaaaaaa-...' }
 *   VENDOR_B = { id: 20, userId: 201, syncId: 'bbbbbbbb-...' }
 *
 * No production data. All SQL responses are mocked.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextResponse } from "next/server";

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

const PAYLOAD_WITH_FOREIGN_CHILD_IDS = {
  ...PAYLOAD_A,
  bidders: [
    {
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
      legacyLotId: 8888,
      legacyBidderId: 9999,
      hammerPrice: 100,
      quantity: 1,
      syncKey: "foreign-sale-key",
      createdAt: new Date().toISOString(),
    },
  ],
};

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/db/postgres", () => ({ sql: vi.fn() }));
vi.mock("@/lib/ably/publishEventSync", () => ({
  publishEventSyncNudge: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { sql } from "@/lib/db/postgres";
import { POST as syncPush } from "@/app/api/sync/push/route";
import {
  GET as syncEventGet,
  DELETE as syncEventDelete,
} from "@/app/api/sync/event/route";
import { GET as syncList } from "@/app/api/sync/list/route";

function mockSession(vendor: typeof VENDOR_A | null) {
  (getServerSession as Mock).mockResolvedValue(
    vendor ? { user: { id: vendor.userId, vendorId: vendor.vendorId } } : null
  );
}
function mockSqlEmpty() {
  (sql as unknown as Mock).mockResolvedValue({ rows: [] });
}
function mockSqlRows<T>(rows: T[]) {
  (sql as unknown as Mock).mockResolvedValue({ rows });
}
function makePushRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/sync/push", {
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
async function status(res: Response | NextResponse) { return res.status; }
async function json(res: Response | NextResponse) { return res.json(); }

// ---------------------------------------------------------------------------
// SUITE 1: Unauthenticated
// ---------------------------------------------------------------------------
describe("Unauthenticated requests", () => {
  beforeEach(() => { vi.clearAllMocks(); mockSession(null); });

  it("POST /api/sync/push → 401", async () => {
    const res = await syncPush(makePushRequest({ eventSyncId: SYNC_ID_A, payload: PAYLOAD_A, clientExportedAt: new Date().toISOString() }));
    expect(await status(res)).toBe(401);
    expect((await json(res)).error).toMatch(/unauthorized/i);
  });
  it("GET /api/sync/event → 401", async () => {
    expect(await status(await syncEventGet(makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event")))).toBe(401);
  });
  it("DELETE /api/sync/event → 401", async () => {
    expect(await status(await syncEventDelete(makeDeleteRequest({ syncId: SYNC_ID_B })))).toBe(401);
  });
  it("GET /api/sync/list → 401", async () => {
    expect(await status(await syncList(new Request("http://localhost/api/sync/list")))).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// SUITE 2: Expired / malformed session
// ---------------------------------------------------------------------------
describe("Expired / malformed session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /api/sync/push → 401 when vendorId is not a number", async () => {
    (getServerSession as Mock).mockResolvedValue({ user: { id: "101", vendorId: "not-a-number" } });
    expect(await status(await syncPush(makePushRequest({ eventSyncId: SYNC_ID_A, payload: PAYLOAD_A, clientExportedAt: new Date().toISOString() })))).toBe(401);
  });
  it("GET /api/sync/event → 401 when vendorId missing", async () => {
    (getServerSession as Mock).mockResolvedValue({ user: { id: "101", vendorId: undefined } });
    expect(await status(await syncEventGet(makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event")))).toBe(401);
  });
  it("DELETE /api/sync/event → 401 when vendorId missing", async () => {
    (getServerSession as Mock).mockResolvedValue({ user: { id: "101", vendorId: undefined } });
    expect(await status(await syncEventDelete(makeDeleteRequest({ syncId: SYNC_ID_B })))).toBe(401);
  });
  it("GET /api/sync/list → 401 when vendorId missing", async () => {
    (getServerSession as Mock).mockResolvedValue({ user: { id: "101", vendorId: undefined } });
    expect(await status(await syncList(new Request("http://localhost/api/sync/list")))).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// SUITE 3: Vendor A cannot read Vendor B events
// ---------------------------------------------------------------------------
describe("Vendor A cannot read Vendor B events", () => {
  beforeEach(() => { vi.clearAllMocks(); mockSession(VENDOR_A); });

  it("returns 404 when Vendor A requests Vendor B syncId", async () => {
    mockSqlEmpty();
    const res = await syncEventGet(makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event"));
    expect(await status(res)).toBe(404);
    expect((await json(res)).error).toMatch(/not found/i);
  });
  it("SQL uses Vendor A vendorId (10), never Vendor B (20)", async () => {
    mockSqlEmpty();
    await syncEventGet(makeGetRequest({ syncId: SYNC_ID_B }, "/api/sync/event"));
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
});

// ---------------------------------------------------------------------------
// SUITE 4: Vendor A cannot overwrite Vendor B events via push
// ---------------------------------------------------------------------------
describe("Vendor A cannot overwrite Vendor B events via push", () => {
  beforeEach(() => { vi.clearAllMocks(); mockSession(VENDOR_A); });

  it("push with Vendor B syncId writes under Vendor A vendorId only", async () => {
    (sql as unknown as Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] });
    const res = await syncPush(makePushRequest({ eventSyncId: SYNC_ID_B, payload: PAYLOAD_A, clientExportedAt: new Date().toISOString() }));
    expect(await status(res)).toBe(200);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
  it("force:true with Vendor B syncId still scopes to Vendor A only", async () => {
    (sql as unknown as Mock).mockResolvedValue({ rows: [{ updated_at: new Date() }] });
    const res = await syncPush(makePushRequest({ eventSyncId: SYNC_ID_B, payload: PAYLOAD_A, clientExportedAt: new Date().toISOString(), force: true }));
    expect(await status(res)).toBe(200);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
});

// ---------------------------------------------------------------------------
// SUITE 5: Vendor A cannot delete Vendor B events
// ---------------------------------------------------------------------------
describe("Vendor A cannot delete Vendor B events", () => {
  beforeEach(() => { vi.clearAllMocks(); mockSession(VENDOR_A); });

  it("DELETE with Vendor B syncId scopes to Vendor A vendorId only", async () => {
    mockSqlEmpty();
    const res = await syncEventDelete(makeDeleteRequest({ syncId: SYNC_ID_B }));
    expect(await status(res)).toBe(200);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
});

// ---------------------------------------------------------------------------
// SUITE 6: List scoping
// ---------------------------------------------------------------------------
describe("GET /api/sync/list scoping", () => {
  beforeEach(() => { vi.clearAllMocks(); mockSession(VENDOR_A); });

  it("returns only Vendor A events", async () => {
    mockSqlRows([{ event_sync_id: SYNC_ID_A, updated_at: new Date() }]);
    const res = await syncList(new Request("http://localhost/api/sync/list"));
    expect(await status(res)).toBe(200);
    const body = await json(res);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventSyncId).toBe(SYNC_ID_A);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(10);
    expect(allValues).not.toContain(20);
  });
  it("Vendor B syncId never returned in Vendor A list", async () => {
    mockSqlRows([{ event_sync_id: SYNC_ID_A, updated_at: new Date() }]);
    const body = await (await syncList(new Request("http://localhost/api/sync/list"))).json();
    expect(body.events.map((e: { eventSyncId: string }) => e.eventSyncId)).not.toContain(SYNC_ID_B);
  });
});

// ---------------------------------------------------------------------------
// SUITE 7: Foreign child IDs in push payload (documented gap)
// ---------------------------------------------------------------------------
describe("Foreign child IDs in push payload (gap — this test is expected to fail until fixed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(VENDOR_A);
    (sql as unknown as Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] });
  });

  it("[GAP] push with foreign child IDs should be rejected — currently returns 200", async () => {
    const res = await syncPush(makePushRequest({ eventSyncId: SYNC_ID_A, payload: PAYLOAD_WITH_FOREIGN_CHILD_IDS, clientExportedAt: new Date().toISOString() }));
    // Route currently returns 200 (gap). Change to 400 when payload validation is added.
    expect(await status(res)).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// SUITE 8: Timestamp manipulation
// ---------------------------------------------------------------------------
describe("Timestamp manipulation via clientExportedAt", () => {
  beforeEach(() => { vi.clearAllMocks(); mockSession(VENDOR_A); });

  it("stale clientExportedAt without force returns 409", async () => {
    mockSqlRows([{ updated_at: new Date(Date.now() + 60_000) }]);
    const res = await syncPush(makePushRequest({ eventSyncId: SYNC_ID_A, payload: PAYLOAD_A, clientExportedAt: new Date(Date.now() - 60_000).toISOString(), force: false }));
    expect(await status(res)).toBe(409);
    expect((await json(res)).code).toBe("sync_conflict");
  });
  it("[GAP] force:true bypasses conflict check with no permission gate", async () => {
    (sql as unknown as Mock).mockResolvedValue({ rows: [{ updated_at: new Date() }] });
    const res = await syncPush(makePushRequest({ eventSyncId: SYNC_ID_A, payload: PAYLOAD_A, clientExportedAt: new Date(Date.now() - 60_000).toISOString(), force: true }));
    expect(await status(res)).toBe(200); // documents gap; change when restricted
  });
});

// ---------------------------------------------------------------------------
// SUITE 9: Valid cross-vendor session
// ---------------------------------------------------------------------------
describe("Valid cross-vendor session", () => {
  it("GET /api/sync/event: Vendor B session + Vendor A syncId returns 404", async () => {
    vi.clearAllMocks(); mockSession(VENDOR_B); mockSqlEmpty();
    expect(await status(await syncEventGet(makeGetRequest({ syncId: SYNC_ID_A }, "/api/sync/event")))).toBe(404);
  });
  it("GET /api/sync/list: Vendor B session returns only Vendor B events", async () => {
    vi.clearAllMocks(); mockSession(VENDOR_B);
    mockSqlRows([{ event_sync_id: SYNC_ID_B, updated_at: new Date() }]);
    const body = await (await syncList(new Request("http://localhost/api/sync/list"))).json();
    expect(body.events.map((e: { eventSyncId: string }) => e.eventSyncId)).not.toContain(SYNC_ID_A);
    expect(body.events.map((e: { eventSyncId: string }) => e.eventSyncId)).toContain(SYNC_ID_B);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(20);
    expect(allValues).not.toContain(10);
  });
  it("DELETE /api/sync/event: Vendor B session + Vendor A syncId scopes to Vendor B only", async () => {
    vi.clearAllMocks(); mockSession(VENDOR_B); mockSqlEmpty();
    const res = await syncEventDelete(makeDeleteRequest({ syncId: SYNC_ID_A }));
    expect(await status(res)).toBe(200);
    const allValues = (sql as unknown as Mock).mock.calls.flatMap(([, ...vals]: [TemplateStringsArray, ...unknown[]]) => vals);
    expect(allValues).toContain(20);
    expect(allValues).not.toContain(10);
  });
});

// ---------------------------------------------------------------------------
// SUITE 10: Invalid input / HTTP behavior
// ---------------------------------------------------------------------------
describe("HTTP behavior — invalid input", () => {
  beforeEach(() => { vi.clearAllMocks(); mockSession(VENDOR_A); });

  it("GET /api/sync/event with non-UUID syncId returns 400", async () => {
    expect(await status(await syncEventGet(makeGetRequest({ syncId: "not-a-uuid" }, "/api/sync/event")))).toBe(400);
  });
  it("DELETE /api/sync/event with non-UUID syncId returns 400", async () => {
    expect(await status(await syncEventDelete(makeDeleteRequest({ syncId: "not-a-uuid" })))).toBe(400);
  });
  it("POST /api/sync/push with non-UUID eventSyncId returns 400", async () => {
    expect(await status(await syncPush(makePushRequest({ eventSyncId: "not-a-uuid", payload: PAYLOAD_A, clientExportedAt: new Date().toISOString() })))).toBe(400);
  });
  it("POST /api/sync/push with missing payload returns 400", async () => {
    expect(await status(await syncPush(makePushRequest({ eventSyncId: SYNC_ID_A, clientExportedAt: new Date().toISOString() })))).toBe(400);
  });
  it("POST /api/sync/push with missing clientExportedAt returns 400", async () => {
    expect(await status(await syncPush(makePushRequest({ eventSyncId: SYNC_ID_A, payload: PAYLOAD_A })))).toBe(400);
  });
});
