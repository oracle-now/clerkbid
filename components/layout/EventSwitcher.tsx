"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";

export function EventSwitcher() {
  const { db, ready: dbReady } = useUserDb();
  const { ready, currentEventId, switchEvent } = useCurrentEvent();
  const events = useLiveQuery(
    async () =>
      liveQueryGuard("events.list", async () => {
        if (!ready || !dbReady || !db) return [];
        return db.events.orderBy("createdAt").reverse().toArray();
      }, []),
    [ready, dbReady, db]
  );

  if (!ready || !dbReady || !events) {
    return (
      <div className="rounded-lg border border-navy/10 bg-white px-3 py-2 text-xs text-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        Loading sales…
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="event-switcher" className="sr-only">
        Current sale
      </label>
      <select
        id="event-switcher"
        className="w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm font-medium text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        value={currentEventId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          void switchEvent(v === "" ? null : Number(v));
        }}
      >
        <option value="">No sale selected</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
          </option>
        ))}
      </select>
    </div>
  );
}
