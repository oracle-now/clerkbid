"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AuctionEvent, Lot, Bidder } from "@/lib/db";
import type { Claim } from "@/types/claim";
import {
  createPrimary,
  createBackup,
  cancelClaim,
  expireClaim,
  promoteClaim,
  ClaimDomainError,
} from "@/lib/services/claimService";
import { ClaimQueueItem } from "./ClaimQueueItem";
import { ConfirmClaimModal } from "./ConfirmClaimModal";

interface Props {
  eventId: number;
  event: AuctionEvent;
}

export function ClaimDesk({ eventId, event }: Props) {
  const { db } = useUserDb();
  const { showToast } = useToast();

  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [selectedBidderId, setSelectedBidderId] = useState<number | null>(null);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClaim, setConfirmClaim] = useState<Claim | null>(null);

  const lots = useLiveQuery(
    () =>
      liveQueryGuard(
        "lots.byEvent",
        async () => {
          if (!db) return [];
          return db.lots.where("eventId").equals(eventId).sortBy("displayLotNumber");
        },
        [] as Lot[]
      ),
    [db, eventId]
  );

  const bidders = useLiveQuery(
    () =>
      liveQueryGuard(
        "bidders.byEvent",
        async () => {
          if (!db) return [];
          return db.bidders.where("eventId").equals(eventId).sortBy("paddleNumber");
        },
        [] as Bidder[]
      ),
    [db, eventId]
  );

  const queue = useLiveQuery(
    () =>
      liveQueryGuard(
        "claims.byLot",
        async () => {
          if (!db || selectedLotId == null) return [];
          const rows = await db.claims
            .where("[eventId+lotId]")
            .equals([eventId, selectedLotId])
            .toArray();
          return rows.sort((a, b) => {
            const rank = (c: Claim) =>
              c.status === "primary" || c.status === "promoted" ? 0 : 1;
            const r = rank(a) - rank(b);
            if (r !== 0) return r;
            return a.position - b.position;
          });
        },
        [] as Claim[]
      ),
    [db, eventId, selectedLotId]
  );

  const selectedLot = lots?.find((l) => l.id === selectedLotId) ?? null;
  const selectedBidder = bidders?.find((b) => b.id === selectedBidderId) ?? null;

  const nextBackupPosition = useCallback(() => {
    if (!queue) return 1;
    const positions = queue
      .filter((c) => c.type === "backup")
      .map((c) => c.position);
    return positions.length === 0 ? 1 : Math.max(...positions) + 1;
  }, [queue]);

  const wrap = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        const msg =
          err instanceof ClaimDomainError
            ? err.message
            : err instanceof Error
            ? err.message
            : "An unexpected error occurred.";
        showToast({ kind: "error", message: msg });
      } finally {
        setBusy(false);
      }
    },
    [showToast]
  );

  const handleRecordPrimary = () =>
    wrap(async () => {
      if (!db || selectedLotId == null || selectedBidderId == null) return;
      await createPrimary(db, {
        eventId,
        lotId: selectedLotId,
        bidderId: selectedBidderId,
        phrase: phrase.trim() || undefined,
      });
      setPhrase("");
      showToast({ kind: "success", message: "Primary claim recorded." });
    });

  const handleRecordBackup = () =>
    wrap(async () => {
      if (!db || selectedLotId == null || selectedBidderId == null) return;
      await createBackup(db, {
        eventId,
        lotId: selectedLotId,
        bidderId: selectedBidderId,
        position: nextBackupPosition(),
        phrase: phrase.trim() || undefined,
      });
      setPhrase("");
      showToast({ kind: "success", message: "Backup claim recorded." });
    });

  const handleCancel = (claimId: number) =>
    wrap(async () => {
      if (!db) return;
      await cancelClaim(db, claimId);
      showToast({ kind: "success", message: "Claim canceled." });
    });

  const handleExpire = (claimId: number) =>
    wrap(async () => {
      if (!db) return;
      await expireClaim(db, claimId);
      showToast({ kind: "success", message: "Claim expired." });
    });

  const handlePromote = (claimId: number) =>
    wrap(async () => {
      if (!db) return;
      await promoteClaim(db, claimId);
      showToast({ kind: "success", message: "Backup promoted to primary." });
    });

  const canRecord = selectedLotId != null && selectedBidderId != null && !busy;

  const activeQueue = (queue ?? []).filter(
    (c) => c.status !== "canceled" && c.status !== "expired"
  );
  const terminalQueue = (queue ?? []).filter(
    (c) => c.status === "canceled" || c.status === "expired"
  );

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Left: selection + record */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-navy dark:text-slate-100">
            Select item &amp; buyer
          </h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink dark:text-slate-200">
                Item
              </label>
              <select
                className="w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={selectedLotId ?? ""}
                onChange={(e) =>
                  setSelectedLotId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">— choose item —</option>
                {(lots ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.displayLotNumber} — {l.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink dark:text-slate-200">
                Buyer
              </label>
              <select
                className="w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={selectedBidderId ?? ""}
                onChange={(e) =>
                  setSelectedBidderId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">— choose buyer —</option>
                {(bidders ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    Buyer code: {b.paddleNumber} — {b.firstName} {b.lastName}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="claim-phrase"
              label="Phrase (optional)"
              placeholder="e.g. NIL, NEXT, bid text…"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
            />

            <div className="flex gap-3">
              <Button
                variant="primary"
                disabled={!canRecord}
                onClick={handleRecordPrimary}
              >
                Record Primary
              </Button>
              <Button
                variant="secondary"
                disabled={!canRecord}
                onClick={handleRecordBackup}
              >
                Record Backup / NIL
              </Button>
            </div>
          </div>
        </Card>

        {selectedLot && (
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-navy dark:text-slate-100">
              Selected item
            </h3>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted w-24 shrink-0">Item #</dt>
                <dd className="text-ink dark:text-slate-200">{selectedLot.displayLotNumber}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted w-24 shrink-0">Description</dt>
                <dd className="text-ink dark:text-slate-200">{selectedLot.description}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted w-24 shrink-0">Qty</dt>
                <dd className="text-ink dark:text-slate-200">{selectedLot.quantity}</dd>
              </div>
              {selectedLot.consignor && (
                <div className="flex gap-2">
                  <dt className="text-muted w-24 shrink-0">Consignor</dt>
                  <dd className="text-ink dark:text-slate-200">{selectedLot.consignor}</dd>
                </div>
              )}
            </dl>
          </Card>
        )}
      </div>

      {/* Right: queue */}
      <div className="lg:col-span-3">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-navy dark:text-slate-100">
            Active queue
            {selectedLot
              ? ` — Item ${selectedLot.displayLotNumber}`
              : " — no item selected"}
          </h2>

          {selectedLotId == null ? (
            <p className="text-sm text-muted">Select an item to see its claim queue.</p>
          ) : activeQueue.length === 0 ? (
            <p className="text-sm text-muted">No active claims for this item.</p>
          ) : (
            <ul className="space-y-3" aria-label="Active claim queue">
              {activeQueue.map((claim) => {
                const bidder = (bidders ?? []).find(
                  (b) => b.id === claim.bidderId
                );
                return (
                  <ClaimQueueItem
                    key={claim.id}
                    claim={claim}
                    bidder={bidder}
                    currencySymbol={event.currencySymbol}
                    onPromote={() => handlePromote(claim.id!)}
                    onConfirm={() => setConfirmClaim(claim)}
                    onCancel={() => handleCancel(claim.id!)}
                    onExpire={() => handleExpire(claim.id!)}
                    busy={busy}
                  />
                );
              })}
            </ul>
          )}

          {terminalQueue.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted hover:text-ink dark:hover:text-slate-200">
                {terminalQueue.length} terminal claim
                {terminalQueue.length !== 1 ? "s" : ""} (canceled / expired)
              </summary>
              <ul className="mt-3 space-y-2">
                {terminalQueue.map((claim) => {
                  const bidder = (bidders ?? []).find(
                    (b) => b.id === claim.bidderId
                  );
                  return (
                    <ClaimQueueItem
                      key={claim.id}
                      claim={claim}
                      bidder={bidder}
                      currencySymbol={event.currencySymbol}
                      onPromote={() => {}}
                      onConfirm={() => {}}
                      onCancel={() => {}}
                      onExpire={() => {}}
                      busy={busy}
                    />
                  );
                })}
              </ul>
            </details>
          )}
        </Card>
      </div>

      {confirmClaim && selectedLot && (
        <ConfirmClaimModal
          open
          claim={confirmClaim}
          lot={selectedLot}
          bidder={
            (bidders ?? []).find((b) => b.id === confirmClaim.bidderId) ?? null
          }
          currencySymbol={event.currencySymbol}
          onClose={() => setConfirmClaim(null)}
          onConfirmed={(invoiceId) => {
            setConfirmClaim(null);
            showToast({
              kind: "success",
              message: invoiceId
                ? `Claim confirmed. Buyer Bundle #${String(invoiceId)} updated.`
                : "Claim confirmed.",
            });
          }}
        />
      )}
    </div>
  );
}
