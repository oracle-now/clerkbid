"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { useToast } from "@/components/providers/ToastProvider";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { useCloudSync } from "@/components/providers/CloudSyncProvider";
import { downloadCsv } from "@/lib/services/csvExporter";
import { parseLotCsv } from "@/lib/services/csvImportLots";
import { mutateWithEventTables } from "@/lib/db/mutateWithParentEventTouch";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import { compareLotsForReport } from "@/lib/services/reportCalculator";
import type { Lot } from "@/lib/db";

const linkSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-navy/15 bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-navy/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:focus-visible:ring-offset-slate-950";

const LOT_CSV_HEADERS = [
  "lot",
  "suffix",
  "description",
  "consignor",
  "consignor number",
  "quantity",
  "notes",
] as const;

function statusTone(
  status: Lot["status"]
): "success" | "neutral" | "warning" {
  if (status === "sold") return "success";
  if (status === "unsold") return "neutral";
  return "warning";
}

export default function LotsPage() {
  const { db, ready } = useUserDb();
  const { scheduleCloudPush } = useCloudSync();
  const { currentEvent, currentEventId } = useCurrentEvent();
  const { showToast } = useToast();
  const csvRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  const lots = useLiveQuery(
    async () =>
      liveQueryGuard("lotsPage.allLots", async () => {
        if (!ready || !db || currentEventId == null) return [];
        const rows = await db.lots
          .where("eventId")
          .equals(currentEventId)
          .toArray();
        return [...rows].sort(compareLotsForReport);
      }, []),
    [ready, db, currentEventId]
  );

  const consignors = useLiveQuery(
    async () =>
      liveQueryGuard("lotsPage.consignors", async () => {
        if (!ready || !db || currentEventId == null) return [];
        return db.consignors.where("eventId").equals(currentEventId).toArray();
      }, []),
    [ready, db, currentEventId]
  );

  const consignorNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of consignors ?? []) {
      if (c.id != null) m.set(c.id, c.name);
    }
    return m;
  }, [consignors]);

  const filtered = useMemo(() => {
    if (!lots) return [];
    const q = search.trim().toLowerCase();
    if (!q) return lots;
    return lots.filter((l) => {
      const blob = `${l.displayLotNumber} ${l.description} ${l.consignor ?? ""} ${l.notes ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [lots, search]);

  if (currentEventId == null || !currentEvent) {
    return (
      <div>
        <Header
          title="Items"
          description="Select a sale in the sidebar to manage the catalog."
          actions={
            <Link href="/events/" className={linkSecondary}>
              Sales
            </Link>
          }
        />
        <p className="text-sm text-muted">No sale selected.</p>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Items"
        description={`Catalog for ${currentEvent.name}. Import items from CSV or add them when clerking sells.`}
        actions={
          <>
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !db || currentEventId == null) return;
                try {
                  const text = await file.text();
                  const { rows, issues } = parseLotCsv(text);
                  const existing = await db.lots
                    .where("eventId")
                    .equals(currentEventId)
                    .toArray();
                  const takenDisplays = new Set(
                    existing.map((l) => l.displayLotNumber)
                  );
                  const consignorRows = await db.consignors
                    .where("eventId")
                    .equals(currentEventId)
                    .toArray();
                  const consignorIdByNumber = new Map(
                    consignorRows
                      .filter((c) => c.id != null)
                      .map((c) => [c.consignorNumber, c.id!])
                  );

                  const conflicts: string[] = [];
                  const badConsignorRows: string[] = [];
                  const toAdd = rows.filter((r) => {
                    if (takenDisplays.has(r.displayLotNumber)) {
                      conflicts.push(r.displayLotNumber);
                      return false;
                    }
                    if (r.consignorNumber != null) {
                      const cid = consignorIdByNumber.get(r.consignorNumber);
                      if (cid == null) {
                        badConsignorRows.push(
                          `${r.displayLotNumber} (consignor #${r.consignorNumber})`
                        );
                        return false;
                      }
                    }
                    takenDisplays.add(r.displayLotNumber);
                    return true;
                  });

                  const now = new Date();
                  await mutateWithEventTables(
                    db,
                    currentEventId,
                    [db.lots],
                    async () => {
                      for (const r of toAdd) {
                        const row: Omit<Lot, "id"> = {
                          eventId: currentEventId,
                          baseLotNumber: r.baseLotNumber,
                          lotSuffix: r.lotSuffix,
                          displayLotNumber: r.displayLotNumber,
                          description: r.description,
                          quantity: r.quantity,
                          status: "unsold",
                          createdAt: now,
                          updatedAt: now,
                        };
                        if (r.consignor) row.consignor = r.consignor;
                        if (r.notes) row.notes = r.notes;
                        if (r.consignorNumber != null) {
                          const cid = consignorIdByNumber.get(
                            r.consignorNumber
                          );
                          if (cid != null) row.consignorId = cid;
                        }
                        await db.lots.add(row);
                      }
                    }
                  );
                  if (toAdd.length > 0) scheduleCloudPush();
                  const parts: string[] = [];
                  if (toAdd.length)
                    parts.push(`Imported ${toAdd.length} item(s).`);
                  if (issues.length)
                    parts.push(`${issues.length} row issue(s) in file.`);
                  if (conflicts.length)
                    parts.push(
                      `Skipped ${conflicts.length} item(s) already in this sale.`
                    );
                  if (badConsignorRows.length)
                    parts.push(
                      `Skipped ${badConsignorRows.length} row(s) with unknown consignor number.`
                    );
                  const ok =
                    toAdd.length > 0 &&
                    issues.length === 0 &&
                    conflicts.length === 0 &&
                    badConsignorRows.length === 0;
                  showToast({
                    kind: ok ? "success" : toAdd.length > 0 ? "info" : "error",
                    message: parts.join(" ") || "Nothing imported.",
                  });
                } catch (err) {
                  showToast({
                    kind: "error",
                    message:
                      err instanceof Error ? err.message : "CSV import failed.",
                  });
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  "clerkbid-lots-template.csv",
                  [...LOT_CSV_HEADERS],
                  [
                    [
                      12,
                      "",
                      "Example item description",
                      "",
                      "",
                      1,
                      "",
                    ],
                  ]
                )
              }
            >
              Item CSV template
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => csvRef.current?.click()}
            >
              Import items (CSV)
            </Button>
          </>
        }
      />

      <p className="mb-4 max-w-2xl text-sm text-muted">
        Required columns: <span className="font-mono">baseLotNumber</span>,{" "}
        <span className="font-mono">description</span>. Optional:{" "}
        <span className="font-mono">lotSuffix</span>,{" "}
        <span className="font-mono">consignor</span>,{" "}
        <span className="font-mono">consignorNumber</span> (must match a
        registered consignor), <span className="font-mono">quantity</span>,{" "}
        <span className="font-mono">notes</span>. Header aliases such as{" "}
        <span className="font-mono">base</span> and{" "}
        <span className="font-mono">suffix</span> are accepted.
      </p>

      <div className="mb-6 max-w-md">
        <Input
          id="lots-search"
          label="Search items"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Item #, description, consignor…"
        />
      </div>

      {!lots ? (
        <p className="text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">
          {lots.length === 0
            ? "No items yet. Import a CSV or record sales on the Sale clerking page."
            : "No items match your search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-navy/10 dark:border-slate-700">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface dark:bg-slate-800/80">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">
                  Item #
                </th>
                <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">
                  Description
                </th>
                <th className="px-3 py-2 text-right font-semibold text-navy dark:text-slate-200">
                  Qty
                </th>
                <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">
                  Consignor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10 dark:divide-slate-700">
              {filtered.map((l) => (
                <tr key={l.id ?? l.displayLotNumber}>
                  <td className="px-3 py-2 font-mono">{l.displayLotNumber}</td>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.quantity}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-muted">
                    {l.consignor ??
                      (l.consignorId != null
                        ? consignorNameById.get(l.consignorId) ?? "—"
                        : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
