"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  promoteClaim,
  cancelClaim,
  expireClaim,
  ClaimDomainError,
} from "@/lib/services/claimService";
import type { Claim } from "@/types/claim";
import type { AuctionDB } from "@/lib/db";

type Bidder = { id?: number; firstName: string; lastName: string; paddleNumber: number };

interface Props {
  claims: Claim[];
  bidders: Bidder[];
  db: AuctionDB;
  onActionDone: () => void;
  onConfirmRequest: (claim: Claim) => void;
}

function statusBadge(status: Claim["status"]) {
  const base = "inline-block rounded px-2 py-0.5 text-xs font-semibold";
  switch (status) {
    case "primary":
      return <span className={`${base} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`}>Primary</span>;
    case "promoted":
      return <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}>Promoted ↑</span>;
    case "backup":
      return <span className={`${base} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300`}>Backup #{}</span>;
    default:
      return <span className={`${base} bg-slate-100 text-slate-500`}>{status}</span>;
  }
}

export function ClaimQueue({ claims, bidders, db, onActionDone, onConfirmRequest }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  const bMap = new Map(bidders.map((b) => [b.id!, b]));

  // Sort: primary/promoted first, then backups by position
  const sorted = [...claims].sort((a, b) => {
    const rank = (c: Claim) =>
      c.status === "primary" ? 0 : c.status === "promoted" ? 1 : 2;
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return a.position - b.position;
  });

  async function act(
    claimId: number,
    fn: () => Promise<void>
  ) {
    setBusy(claimId);
    setRowErrors((prev) => { const n = { ...prev }; delete n[claimId]; return n; });
    try {
      await fn();
      onActionDone();
    } catch (err) {
      const msg =
        err instanceof ClaimDomainError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Action failed.";
      setRowErrors((prev) => ({ ...prev, [claimId]: msg }));
    } finally {
      setBusy(null);
    }
  }

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted">
        No active claims for this item.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-navy/10 dark:border-slate-700">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface dark:bg-slate-800/80">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">Buyer</th>
            <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">Buyer code</th>
            <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">Status</th>
            <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">Pos</th>
            <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">Phrase</th>
            <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">Sale / Bundle</th>
            <th className="px-3 py-2 text-right font-semibold text-navy dark:text-slate-200">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy/5 dark:divide-slate-700">
          {sorted.map((c) => {
            const bidder = bMap.get(c.bidderId);
            const isConfirmed = c.saleId != null;
            const isBusy = busy === c.id;
            return (
              <tr
                key={c.id}
                className="bg-white hover:bg-surface/60 dark:bg-slate-900 dark:hover:bg-slate-800/60"
              >
                {/* Buyer name */}
                <td className="px-3 py-2 font-medium text-ink dark:text-slate-100">
                  {bidder ? `${bidder.firstName} ${bidder.lastName}` : `Buyer #${c.bidderId}`}
                </td>
                {/* Buyer code */}
                <td className="px-3 py-2 font-mono text-muted dark:text-slate-400">
                  {bidder?.paddleNumber ?? "—"}
                </td>
                {/* Status badge */}
                <td className="px-3 py-2">
                  {c.status === "backup"
                    ? <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">Backup #{c.position}</span>
                    : statusBadge(c.status)
                  }
                </td>
                {/* Position */}
                <td className="px-3 py-2 text-muted">
                  {c.position > 0 ? c.position : "—"}
                </td>
                {/* Phrase */}
                <td className="px-3 py-2 italic text-muted dark:text-slate-400">
                  {c.phrase ?? "—"}
                </td>
                {/* Confirmed sale / bundle link */}
                <td className="px-3 py-2">
                  {isConfirmed ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                        Confirmed
                      </span>
                      <Link
                        href="/invoices/"
                        className="text-xs text-navy underline hover:text-navy/70 dark:text-blue-400"
                      >
                        Buyer Bundle
                      </Link>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                {/* Actions */}
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2 flex-wrap">
                    {/* Domain error for this row */}
                    {rowErrors[c.id!] && (
                      <span
                        className="w-full text-right text-xs text-red-600 dark:text-red-400"
                        role="alert"
                      >
                        {rowErrors[c.id!]}
                      </span>
                    )}
                    {/* Promote — backup only */}
                    {c.status === "backup" && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs"
                        disabled={isBusy}
                        onClick={() =>
                          void act(c.id!, () => promoteClaim(db, c.id!))
                        }
                      >
                        Promote
                      </Button>
                    )}
                    {/* Confirm — primary or promoted only */}
                    {(c.status === "primary" || c.status === "promoted") &&
                      !isConfirmed && (
                        <Button
                          type="button"
                          className="text-xs"
                          disabled={isBusy}
                          onClick={() => onConfirmRequest(c)}
                        >
                          Confirm
                        </Button>
                      )}
                    {/* Cancel — not confirmed */}
                    {!isConfirmed && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs"
                        disabled={isBusy}
                        onClick={() =>
                          void act(c.id!, () => cancelClaim(db, c.id!))
                        }
                      >
                        Cancel
                      </Button>
                    )}
                    {/* Expire — not confirmed */}
                    {!isConfirmed && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs"
                        disabled={isBusy}
                        onClick={() =>
                          void act(c.id!, () => expireClaim(db, c.id!))
                        }
                      >
                        Expire
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
