"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import {
  promoteClaim,
  cancelClaim,
  expireClaim,
  confirmClaim,
  ClaimDomainError,
} from "@/lib/services/claimService";
import type { Claim } from "@/types/claim";
import type { Lot } from "@/lib/db";
import { ConfirmClaimPanel } from "./ConfirmClaimPanel";

interface Props {
  eventId: number;
  lotId: number;
  lot?: Lot;
  onRefresh: () => void;
}

export function ClaimQueue({ eventId, lotId, lot, onRefresh }: Props) {
  const { db } = useUserDb();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingClaimId, setConfirmingClaimId] = useState<number | null>(null);

  const claims = useLiveQuery(
    async () =>
      liveQueryGuard("claim.queue", async () => {
        if (!db) return [];
        const rows = await (db as unknown as { claims: import("dexie").Table<Claim> }).claims
          .where("[eventId+lotId]")
          .equals([eventId, lotId])
          .toArray();
        // Active queue: exclude canceled and expired
        const active = rows.filter(
          (c) => c.status !== "canceled" && c.status !== "expired"
        );
        // Sort: primary/promoted first (position 0), then backups ascending by position
        active.sort((a, b) => a.position - b.position);
        return active;
      }, []),
    [db, eventId, lotId]
  );

  async function doAction(
    action: "promote" | "cancel" | "expire",
    claimId: number
  ) {
    if (!db) return;
    setActionError(null);
    try {
      if (action === "promote") await promoteClaim(db, claimId);
      else if (action === "cancel") await cancelClaim(db, claimId);
      else await expireClaim(db, claimId);
      onRefresh();
    } catch (err) {
      setActionError(
        err instanceof ClaimDomainError || err instanceof Error
          ? err.message
          : "Action failed."
      );
    }
  }

  if (!claims) return <p className="text-sm text-muted">Loading queue…</p>;
  if (claims.length === 0)
    return <p className="text-sm text-muted">No active claims for this item.</p>;

  const confirmingClaim = confirmingClaimId != null
    ? claims.find((c) => c.id === confirmingClaimId) ?? null
    : null;

  return (
    <div className="space-y-3">
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {confirmingClaim && db && lot ? (
        <ConfirmClaimPanel
          db={db}
          claim={confirmingClaim}
          lot={lot}
          onDone={() => {
            setConfirmingClaimId(null);
            onRefresh();
          }}
          onCancel={() => setConfirmingClaimId(null)}
        />
      ) : (
        <ul className="space-y-2">
          {claims.map((claim) => (
            <ClaimRow
              key={claim.id}
              claim={claim}
              eventId={eventId}
              onPromote={() => void doAction("promote", claim.id!)}
              onConfirm={() => setConfirmingClaimId(claim.id!)}
              onCancel={() => void doAction("cancel", claim.id!)}
              onExpire={() => void doAction("expire", claim.id!)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ClaimRowProps {
  claim: Claim;
  eventId: number;
  onPromote: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onExpire: () => void;
}

function ClaimRow({
  claim,
  eventId,
  onPromote,
  onConfirm,
  onCancel,
  onExpire,
}: ClaimRowProps) {
  const { db } = useUserDb();

  const bidder = useLiveQuery(
    async () => {
      if (!db) return null;
      return db.bidders.get(claim.bidderId);
    },
    [db, claim.bidderId]
  );

  const sale = useLiveQuery(
    async () => {
      if (!db || claim.saleId == null) return null;
      return db.sales.get(claim.saleId);
    },
    [db, claim.saleId]
  );

  const invoice = useLiveQuery(
    async () => {
      if (!db || claim.saleId == null || !sale) return null;
      return db.invoices
        .where("eventId")
        .equals(eventId)
        .filter((inv) => inv.bidderId === claim.bidderId)
        .first();
    },
    [db, eventId, claim.bidderId, claim.saleId, sale]
  );

  const isConfirmed = claim.saleId != null;
  const isPromoted = claim.status === "promoted";
  const isPrimary = claim.status === "primary";
  const isBackup = claim.status === "backup";

  const statusLabel = isConfirmed
    ? "Confirmed — owns item"
    : isPromoted
    ? "Promoted"
    : isPrimary
    ? "Primary"
    : `Backup #${claim.position}`;

  return (
    <li className="rounded-lg border border-navy/10 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-ink dark:text-slate-100">
            {bidder
              ? `${bidder.firstName} ${bidder.lastName}`
              : `Buyer #${claim.bidderId}`}
            {bidder && (
              <span className="ml-2 text-xs text-muted">
                code: {bidder.paddleNumber}
              </span>
            )}
          </p>
          <p className="text-xs text-muted">
            <span
              className={`font-medium ${
                isConfirmed
                  ? "text-green-700 dark:text-green-400"
                  : isPromoted
                  ? "text-blue-700 dark:text-blue-400"
                  : ""
              }`}
            >
              {statusLabel}
            </span>
            {claim.phrase && (
              <span className="ml-2 italic">&ldquo;{claim.phrase}&rdquo;</span>
            )}
          </p>
          {isConfirmed && sale && (
            <p className="text-xs text-green-700 dark:text-green-400">
              Sale price: {sale.amount}
              {invoice?.id != null && (
                <>
                  {" · "}
                  <Link
                    href={`/invoices/`}
                    className="underline hover:no-underline"
                  >
                    View Buyer Bundle
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        {!isConfirmed && (
          <div className="flex shrink-0 flex-wrap gap-1">
            {isBackup && (
              <Button
                type="button"
                variant="secondary"
                className="text-xs py-1 px-2"
                onClick={onPromote}
              >
                Promote
              </Button>
            )}
            {(isPrimary || isPromoted) && (
              <Button
                type="button"
                className="text-xs py-1 px-2"
                onClick={onConfirm}
              >
                Confirm
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className="text-xs py-1 px-2"
              onClick={onCancel}
            >
              Cancel
            </Button>
            {isBackup && (
              <Button
                type="button"
                variant="secondary"
                className="text-xs py-1 px-2"
                onClick={onExpire}
              >
                Expire
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
