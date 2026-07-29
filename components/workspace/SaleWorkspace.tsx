"use client";

/**
 * SaleWorkspace — UX-1 seller-journey workspace.
 *
 * Renders three parallel work areas (Set up / Sell / Buyer Bundles) from the
 * WORKSPACE_AREAS configuration exported by saleWorkspaceData.ts.
 *
 * Reads from existing EventProvider + UserDbProvider live queries only.
 * No new service calls. No schema additions. No phase inference.
 * Domain behavior is unchanged.
 */

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Package, Users, FileText, LayoutGrid } from "lucide-react";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import {
  WORKSPACE_AREAS,
  EMPTY_STATE_DESTINATION,
  deriveWorkspaceCounts,
  type WorkspaceCounts,
} from "@/lib/workspace/saleWorkspaceData";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Shared style tokens
// ---------------------------------------------------------------------------

const btnSecondary =
  "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-navy/15 bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-navy/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:focus-visible:ring-offset-slate-950";

const sectionHeading =
  "mb-3 text-xs font-semibold uppercase tracking-wide text-muted";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SaleWorkspace() {
  const { db, ready: dbReady } = useUserDb();
  const { ready, currentEventId, currentEvent } = useCurrentEvent();

  const counts = useLiveQuery(
    async () =>
      liveQueryGuard(
        "workspace.counts",
        async (): Promise<WorkspaceCounts | null> => {
          if (!ready || !dbReady || !db || currentEventId == null) return null;
          const eid = currentEventId;
          const [itemCount, buyerCount, buyerBundleCount] = await Promise.all([
            db.lots.where("eventId").equals(eid).count(),
            db.bidders.where("eventId").equals(eid).count(),
            db.invoices.where("eventId").equals(eid).count(),
          ]);
          return { itemCount, buyerCount, buyerBundleCount };
        },
        null
      ),
    [ready, dbReady, db, currentEventId]
  );

  // ------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------
  if (!ready || !dbReady) {
    return <p className="text-muted">Loading…</p>;
  }

  // ------------------------------------------------------------------
  // Empty state — no sale selected
  // ------------------------------------------------------------------
  if (currentEventId == null || !currentEvent) {
    return (
      <div>
        <Header
          title="Sale workspace"
          description="Select a sale to see your work areas."
        />
        <div className="rounded-xl border border-dashed border-navy/20 bg-surface/50 p-10 text-center dark:border-slate-600 dark:bg-slate-800/40">
          <LayoutGrid
            className="mx-auto mb-4 h-10 w-10 text-navy/30 dark:text-slate-600"
            aria-hidden
          />
          <p className="text-lg font-medium text-navy dark:text-slate-100">
            No sale selected
          </p>
          <p className="mt-2 text-sm text-muted">
            Choose or create a sale to continue.
          </p>
          <Link
            href={EMPTY_STATE_DESTINATION.href}
            className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
            data-testid="empty-state-link"
          >
            {EMPTY_STATE_DESTINATION.label}
          </Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Counts (zero while query is still resolving)
  // ------------------------------------------------------------------
  const zeroCounts: WorkspaceCounts = {
    itemCount: 0,
    buyerCount: 0,
    buyerBundleCount: 0,
  };
  const workspace = deriveWorkspaceCounts(
    currentEvent.name,
    counts ?? zeroCounts
  );
  const { itemCount, buyerCount, buyerBundleCount } =
    workspace.counts;

  // ------------------------------------------------------------------
  // Three parallel work areas
  // ------------------------------------------------------------------
  return (
    <div>
      {/* Header — shows selected sale name */}
      <Header
        title={currentEvent.name}
        description={currentEvent.organizationName}
      />

      {/* Three sections — stack on mobile, 3-col grid on md+ */}
      <div className="grid gap-6 md:grid-cols-3">

        {/* ---- Set up ---- */}
        <Card data-testid="section-setup">
          <h2 className={sectionHeading}>
            {WORKSPACE_AREAS[0]!.label}
          </h2>
          <dl className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Package className="h-4 w-4 shrink-0" aria-hidden />
                Items
              </dt>
              <dd
                className="font-mono text-sm font-semibold text-navy dark:text-slate-100"
                data-testid="item-count"
              >
                {itemCount}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Users className="h-4 w-4 shrink-0" aria-hidden />
                Buyers
              </dt>
              <dd
                className="font-mono text-sm font-semibold text-navy dark:text-slate-100"
                data-testid="buyer-count"
              >
                {buyerCount}
              </dd>
            </div>
          </dl>
          <div className="space-y-2">
            {WORKSPACE_AREAS[0]!.actions.map((action) => (
              <Link key={action.id} href={action.href} className={btnSecondary}>
                {action.label}
              </Link>
            ))}
          </div>
        </Card>

        {/* ---- Sell ---- */}
        <Card data-testid="section-sell">
          <h2 className={sectionHeading}>
            {WORKSPACE_AREAS[1]!.label}
          </h2>
          <p className="mb-4 text-sm text-muted">
            Choose how you are recording purchases for this sale.
          </p>
          <div className="space-y-2">
            {WORKSPACE_AREAS[1]!.actions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className={btnSecondary}
                data-testid={`link-${action.id}`}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </Card>

        {/* ---- Buyer Bundles ---- */}
        <Card data-testid="section-bundles">
          <h2 className={sectionHeading}>
            {WORKSPACE_AREAS[2]!.label}
          </h2>
          <dl className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                Buyer Bundles
              </dt>
              <dd
                className="font-mono text-sm font-semibold text-navy dark:text-slate-100"
                data-testid="bundle-count"
              >
                {buyerBundleCount}
              </dd>
            </div>
          </dl>
          <p className="mb-4 text-sm text-muted">
            Review purchases grouped by buyer.
          </p>
          <div className="space-y-2">
            {WORKSPACE_AREAS[2]!.actions.map((action) => (
              <Link key={action.id} href={action.href} className={btnSecondary}>
                {action.label}
              </Link>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
}
