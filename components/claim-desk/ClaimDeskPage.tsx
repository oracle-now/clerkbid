"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { useEventContext } from "@/components/providers/EventProvider";
import { ClaimDesk } from "./ClaimDesk";

const linkSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-navy/15 bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-navy/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:focus-visible:ring-offset-slate-950";

export function ClaimDeskPage() {
  const { currentEvent, currentEventId } = useEventContext();

  if (currentEventId == null || !currentEvent) {
    return (
      <div>
        <Header
          title="Claim Desk"
          description="Select a sale before using the Claim Desk."
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
        title="Claim Desk"
        description={`Recording claims for ${currentEvent.name}. Select an item and buyer, then record Primary or Backup claims.`}
      />
      <ClaimDesk eventId={currentEventId} event={currentEvent} />
    </div>
  );
}
