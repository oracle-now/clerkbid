"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Header } from "@/components/layout/Header";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import { ClaimEntryForm } from "@/components/claims/ClaimEntryForm";
import { ClaimQueue } from "@/components/claims/ClaimQueue";
import type { Lot } from "@/lib/db";

export default function ClaimsPage() {
  const { db, ready: dbReady } = useUserDb();
  const { ready, currentEventId } = useCurrentEvent();
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [queueKey, setQueueKey] = useState(0);

  const lots = useLiveQuery(
    async () =>
      liveQueryGuard("claims.page.lots", async () => {
        if (!ready || !dbReady || !db || !currentEventId) return [];
        return db.lots
          .where("eventId")
          .equals(currentEventId)
          .sortBy("displayLotNumber");
      }, []),
    [ready, dbReady, db, currentEventId]
  );

  const selectedLot: Lot | undefined = lots?.find(
    (l) => l.id === selectedLotId
  );

  function refreshQueue() {
    setQueueKey((k) => k + 1);
  }

  if (!ready || !dbReady) {
    return (
      <div>
        <Header title="Claim Desk" description="Manage Facebook live-sale claims." />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  if (!currentEventId) {
    return (
      <div>
        <Header title="Claim Desk" description="Manage Facebook live-sale claims." />
        <p className="text-sm text-muted">
          No sale selected. Choose a sale from the sidebar to start recording claims.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Header
        title="Claim Desk"
        description="Record and manage buyer claims for the current sale."
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left column: entry form */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Record claim
          </h2>
          <ClaimEntryForm
            eventId={currentEventId}
            lots={lots ?? []}
            selectedLotId={selectedLotId}
            onLotChange={(id) => {
              setSelectedLotId(id);
              refreshQueue();
            }}
            onClaimCreated={refreshQueue}
          />
        </section>

        {/* Right column: active queue */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            Active queue{selectedLot ? ` — Item #${selectedLot.displayLotNumber}` : ""}
          </h2>
          {selectedLotId && currentEventId ? (
            <ClaimQueue
              key={queueKey}
              eventId={currentEventId}
              lotId={selectedLotId}
              lot={selectedLot}
              onRefresh={refreshQueue}
            />
          ) : (
            <p className="text-sm text-muted">
              Select an item above to see its claim queue.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
