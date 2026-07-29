"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { useToast } from "@/components/providers/ToastProvider";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { useCloudSync } from "@/components/providers/CloudSyncProvider";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import {
  createPrimary,
  createBackup,
  ClaimDomainError,
} from "@/lib/services/claimService";
import { ClaimQueue } from "@/components/claims/ClaimQueue";
import { ConfirmClaimModal } from "@/components/claims/ConfirmClaimModal";
import type { Claim } from "@/types/claim";
import type { AuctionDB } from "@/lib/db";

export default function ClaimsPage() {
  const { db, ready: dbReady } = useUserDb();
  const { currentEvent, currentEventId } = useCurrentEvent();
  const { showToast } = useToast();
  const { scheduleCloudPush } = useCloudSync();

  const [lotId, setLotId] = useState<number | "">("");
  const [bidderId, setBidderId] = useState<number | "">("");
  const [claimType, setClaimType] = useState<"primary" | "backup">("primary");
  const [position, setPosition] = useState("");
  const [phrase, setPhrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmingClaim, setConfirmingClaim] = useState<Claim | null>(null);

  // Lots for selected event
  const lots = useLiveQuery(
    () =>
      liveQueryGuard(
        "claims.lots",
        () => {
          if (currentEventId == null || !dbReady || !db) return Promise.resolve([]);
          return (db as AuctionDB).lots
            .where("eventId")
            .equals(currentEventId)
            .sortBy("displayLotNumber");
        },
        []
      ),
    [currentEventId, dbReady, db]
  );

  // Bidders for selected event
  const bidders = useLiveQuery(
    () =>
      liveQueryGuard(
        "claims.bidders",
        () => {
          if (currentEventId == null || !dbReady || !db) return Promise.resolve([]);
          return (db as AuctionDB).bidders
            .where("eventId")
            .equals(currentEventId)
            .sortBy("paddleNumber");
        },
        []
      ),
    [currentEventId, dbReady, db]
  );

  // Active claims for selected lot
  const claims = useLiveQuery(
    () =>
      liveQueryGuard(
        "claims.queue",
        async () => {
          if (lotId === "" || currentEventId == null || !dbReady || !db)
            return [];
          const all = await (db as AuctionDB).claims
            .where("[eventId+lotId]")
            .equals([currentEventId, lotId])
            .toArray();
          return all.filter(
            (c) => c.status !== "canceled" && c.status !== "expired"
          );
        },
        []
      ),
    [lotId, currentEventId, dbReady, db]
  );

  const selectedLot = useMemo(
    () => lots?.find((l) => l.id === lotId),
    [lots, lotId]
  );
  const selectedBidder = useMemo(
    () => bidders?.find((b) => b.id === bidderId),
    [bidders, bidderId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (currentEventId == null) {
      setFormError("No sale selected.");
      return;
    }
    if (lotId === "") {
      setFormError("Select an item.");
      return;
    }
    if (bidderId === "") {
      setFormError("Select a buyer.");
      return;
    }
    if (!db) return;

    if (claimType === "backup") {
      const pos = parseInt(position, 10);
      if (!position || isNaN(pos) || pos < 1) {
        setFormError("Backup position must be a positive integer.");
        return;
      }
    }

    setSaving(true);
    try {
      if (claimType === "primary") {
        await createPrimary(db as AuctionDB, {
          eventId: currentEventId,
          lotId: lotId as number,
          bidderId: bidderId as number,
          phrase: phrase.trim() || undefined,
        });
      } else {
        await createBackup(db as AuctionDB, {
          eventId: currentEventId,
          lotId: lotId as number,
          bidderId: bidderId as number,
          position: parseInt(position, 10),
          phrase: phrase.trim() || undefined,
        });
      }
      scheduleCloudPush();
      showToast({ kind: "success", message: "Claim recorded." });
      setPhrase("");
      setPosition("");
    } catch (err) {
      const msg =
        err instanceof ClaimDomainError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to record claim.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (currentEventId == null || !currentEvent) {
    return (
      <div>
        <Header
          title="Claim Desk"
          description="Select a sale in the sidebar to manage claims."
        />
        <p className="text-sm text-muted">No sale selected.</p>
      </div>
    );
  }

  const selectClass =
    "w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
  const labelClass = "block text-sm font-medium text-ink dark:text-slate-200 mb-1";

  return (
    <div>
      <Header
        title="Claim Desk"
        description={`Record and manage claims for ${currentEvent.name}.`}
      />

      {/* Claim entry form */}
      <div className="mb-8 rounded-xl border border-navy/10 bg-surface p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-4 text-base font-semibold text-navy dark:text-slate-100">
          Record claim
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Item selector */}
            <div>
              <label htmlFor="cd-lot" className={labelClass}>
                Item
              </label>
              <select
                id="cd-lot"
                className={selectClass}
                value={lotId}
                onChange={(e) =>
                  setLotId(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">— select item —</option>
                {(lots ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    #{l.displayLotNumber}{l.description ? ` · ${l.description}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Buyer selector */}
            <div>
              <label htmlFor="cd-bidder" className={labelClass}>
                Buyer
              </label>
              <select
                id="cd-bidder"
                className={selectClass}
                value={bidderId}
                onChange={(e) =>
                  setBidderId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              >
                <option value="">— select buyer —</option>
                {(bidders ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.paddleNumber} · {b.firstName} {b.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* Claim type */}
            <div>
              <label htmlFor="cd-type" className={labelClass}>
                Claim type
              </label>
              <select
                id="cd-type"
                className={selectClass}
                value={claimType}
                onChange={(e) =>
                  setClaimType(e.target.value as "primary" | "backup")
                }
              >
                <option value="primary">Primary</option>
                <option value="backup">Backup / NIL</option>
              </select>
            </div>

            {/* Backup position */}
            {claimType === "backup" && (
              <div>
                <label htmlFor="cd-position" className={labelClass}>
                  Backup position
                </label>
                <input
                  id="cd-position"
                  type="number"
                  min={1}
                  step={1}
                  className={selectClass}
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. 1"
                />
              </div>
            )}

            {/* Phrase */}
            <div className="sm:col-span-2">
              <label htmlFor="cd-phrase" className={labelClass}>
                Stored phrase{" "}
                <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="cd-phrase"
                type="text"
                className={selectClass}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder='e.g. "NIL", "NEXT", comment text…'
              />
            </div>
          </div>

          {formError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {formError}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create claim"}
            </Button>
          </div>
        </form>
      </div>

      {/* Active queue */}
      {lotId !== "" && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-navy dark:text-slate-100">
            Active queue{selectedLot ? ` — Item #${selectedLot.displayLotNumber}` : ""}
          </h2>
          <ClaimQueue
            claims={claims ?? []}
            bidders={bidders ?? []}
            db={db as AuctionDB}
            onActionDone={() => {
              scheduleCloudPush();
            }}
            onConfirmRequest={(claim) => setConfirmingClaim(claim)}
          />
        </div>
      )}

      {confirmingClaim && (
        <ConfirmClaimModal
          claim={confirmingClaim}
          lot={selectedLot ?? null}
          bidder={
            bidders?.find((b) => b.id === confirmingClaim.bidderId) ?? null
          }
          db={db as AuctionDB}
          onClose={() => setConfirmingClaim(null)}
          onConfirmed={() => {
            setConfirmingClaim(null);
            scheduleCloudPush();
          }}
        />
      )}
    </div>
  );
}
