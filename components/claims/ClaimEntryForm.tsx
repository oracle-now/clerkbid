"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import {
  createPrimary,
  createBackup,
  ClaimDomainError,
} from "@/lib/services/claimService";
import type { Lot } from "@/lib/db";

interface Props {
  eventId: number;
  lots: Lot[];
  selectedLotId: number | null;
  onLotChange: (id: number | null) => void;
  onClaimCreated: () => void;
}

export function ClaimEntryForm({
  eventId,
  lots,
  selectedLotId,
  onLotChange,
  onClaimCreated,
}: Props) {
  const { db } = useUserDb();
  const [bidderId, setBidderId] = useState<string>("");
  const [claimType, setClaimType] = useState<"primary" | "backup">("primary");
  const [position, setPosition] = useState<string>("1");
  const [phrase, setPhrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const bidders = useLiveQuery(
    async () =>
      liveQueryGuard("claim.form.bidders", async () => {
        if (!db || !eventId) return [];
        return db.bidders
          .where("eventId")
          .equals(eventId)
          .sortBy("lastName");
      }, []),
    [db, eventId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!db) { setError("Database not ready."); return; }
    if (!selectedLotId) { setError("Select an item."); return; }
    const bidderIdNum = parseInt(bidderId, 10);
    if (!bidderId || isNaN(bidderIdNum)) { setError("Select a buyer."); return; }
    if (claimType === "backup") {
      const pos = parseInt(position, 10);
      if (!pos || pos < 1) { setError("Backup position must be a positive integer."); return; }
    }

    setSaving(true);
    try {
      if (claimType === "primary") {
        await createPrimary(db, {
          eventId,
          lotId: selectedLotId,
          bidderId: bidderIdNum,
          phrase: phrase.trim() || undefined,
        });
        setSuccess("Primary claim recorded.");
      } else {
        await createBackup(db, {
          eventId,
          lotId: selectedLotId,
          bidderId: bidderIdNum,
          position: parseInt(position, 10),
          phrase: phrase.trim() || undefined,
        });
        setSuccess("Backup claim recorded.");
      }
      setBidderId("");
      setPhrase("");
      setPosition("1");
      onClaimCreated();
    } catch (err) {
      if (err instanceof ClaimDomainError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to record claim.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Item selector */}
      <div>
        <label
          htmlFor="claim-lot"
          className="mb-1 block text-sm font-medium text-ink dark:text-slate-200"
        >
          Item
        </label>
        <select
          id="claim-lot"
          value={selectedLotId ?? ""}
          onChange={(e) =>
            onLotChange(e.target.value ? Number(e.target.value) : null)
          }
          className="w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-navy/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">— Select an item —</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              Item #{l.displayLotNumber} — {l.description}
            </option>
          ))}
        </select>
      </div>

      {/* Buyer selector */}
      <div>
        <label
          htmlFor="claim-bidder"
          className="mb-1 block text-sm font-medium text-ink dark:text-slate-200"
        >
          Buyer
        </label>
        <select
          id="claim-bidder"
          value={bidderId}
          onChange={(e) => setBidderId(e.target.value)}
          className="w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-navy/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">— Select a buyer —</option>
          {(bidders ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.firstName} {b.lastName} (code: {b.paddleNumber})
            </option>
          ))}
        </select>
      </div>

      {/* Claim type */}
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink dark:text-slate-200">
          Claim type
        </legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="claimType"
              value="primary"
              checked={claimType === "primary"}
              onChange={() => setClaimType("primary")}
            />
            Primary
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="claimType"
              value="backup"
              checked={claimType === "backup"}
              onChange={() => setClaimType("backup")}
            />
            Backup / NIL
          </label>
        </div>
      </fieldset>

      {/* Backup position */}
      {claimType === "backup" && (
        <Input
          id="claim-position"
          label="Backup position"
          type="number"
          min={1}
          step={1}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="1"
        />
      )}

      {/* Phrase */}
      <Input
        id="claim-phrase"
        label="Stored phrase (optional)"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder='e.g. "NIL", "NEXT", bid text'
      />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
          {success}
        </p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Create claim"}
      </Button>
    </form>
  );
}
