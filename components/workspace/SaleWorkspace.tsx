"use client";

/**
 * SaleWorkspace — UX-1 seller-journey shell.
 *
 * Reads from existing EventProvider + UserDbProvider live queries only.
 * No new service calls. No schema additions.
 * Domain behavior is unchanged.
 */

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Package, Users, ListChecks, Gavel, FileText, ArrowRight, LayoutGrid } from "lucide-react";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import { deriveSaleWorkspace, type WorkspaceCounts } from "@/lib/workspace/saleWorkspaceData";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Shared style tokens (no new Tailwind classes beyond what dashboard uses)
// ---------------------------------------------------------------------------

const btnPrimary =
  "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950";

const btnSecondary =
  "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-navy/15 bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-navy/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:focus-visible:ring-offset-slate-950";

const sectionHeading =
  "mb-3 text-xs font-semibold uppercase tracking-wide text-muted";

// ---------------------------------------------------------------------------
// Phase badge
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
  setup: "Setting up",
  selling: "Selling",
  packing: "Packing",
};

const PHASE_COLORS: Record<string, string> = {
  setup: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  selling: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  packing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
};

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        PHASE_COLORS[phase] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {PHASE_LABELS[phase] ?? phase}
    </span>
  );
}

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
          const [itemCount, buyerCount, bundleCount, unpaidCount] =
            await Promise.all([
              db.lots.where("eventId").equals(eid).count(),
              db.bidders.where("eventId").equals(eid).count(),
              db.invoices.where("eventId").equals(eid).count(),
              db.invoices
                .where("eventId")
                .equals(eid)
                .filter((inv) => inv.status === "unpaid")
                .count(),
            ]);
          return { itemCount, buyerCount, bundleCount, unpaidCount };
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
          description="Select a sale to see your setup, selling, and packing progress."
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
            Choose a sale from the menu above, or create a new one.
          </p>
          <Link href="/events/" className={`mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2`}>
            Go to your sales
          </Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Counts loading (event selected but query not resolved yet)
  // ------------------------------------------------------------------
  const zeroCounts: WorkspaceCounts = {
    itemCount: 0,
    buyerCount: 0,
    bundleCount: 0,
    unpaidCount: 0,
  };
  const workspace = deriveSaleWorkspace(
    currentEvent.name,
    counts ?? zeroCounts
  );

  const { phase, primaryActionLabel, primaryActionHref } = workspace;
  const { itemCount, buyerCount, bundleCount, unpaidCount } =
    counts ?? zeroCounts;

  return (
    <div>
      {/* ---------------------------------------------------------------- */}
      {/* Header */}
      {/* ---------------------------------------------------------------- */}
      <Header
        title={currentEvent.name}
        description={currentEvent.organizationName}
        actions={<PhaseBadge phase={phase} />}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Primary action — always visible, mobile-first */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-8">
        <Link
          href={primaryActionHref}
          className={btnPrimary}
          data-testid="workspace-primary-action"
        >
          {primaryActionLabel}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Three sections — stack on mobile, 3-col grid on md+ */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* -------------------------------------------------------------- */}
        {/* Set up */}
        {/* -------------------------------------------------------------- */}
        <Card data-testid="section-setup">
          <h2 className={sectionHeading}>Set up</h2>
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
            <Link href="/lots/" className={btnSecondary}>
              Manage items
            </Link>
            <Link href="/bidders/" className={btnSecondary}>
              Manage buyers
            </Link>
          </div>
        </Card>

        {/* -------------------------------------------------------------- */}
        {/* Sell */}
        {/* -------------------------------------------------------------- */}
        <Card data-testid="section-sell">
          <h2 className={sectionHeading}>Sell</h2>
          <p className="mb-4 text-sm text-muted">
            Choose how you are taking purchases for this sale.
          </p>
          <div className="space-y-2">
            <Link
              href="/claims/"
              className={btnSecondary}
              data-testid="link-claim-desk"
            >
              <ListChecks className="h-4 w-4 shrink-0" aria-hidden />
              Facebook claims
            </Link>
            <Link
              href="/clerking/"
              className={btnSecondary}
              data-testid="link-clerking"
            >
              <Gavel className="h-4 w-4 shrink-0" aria-hidden />
              Enter a completed purchase
            </Link>
          </div>
        </Card>

        {/* -------------------------------------------------------------- */}
        {/* Pack */}
        {/* -------------------------------------------------------------- */}
        <Card data-testid="section-pack">
          <h2 className={sectionHeading}>Pack</h2>
          <dl className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                Buyer bundles
              </dt>
              <dd
                className="font-mono text-sm font-semibold text-navy dark:text-slate-100"
                data-testid="bundle-count"
              >
                {bundleCount}
              </dd>
            </div>
            {bundleCount > 0 ? (
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted">Unpaid</dt>
                <dd
                  className="font-mono text-sm font-semibold text-navy dark:text-slate-100"
                  data-testid="unpaid-count"
                >
                  {unpaidCount}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="space-y-2">
            <Link
              href="/invoices/"
              className={btnSecondary}
              data-testid="link-bundles"
            >
              Open buyer bundles
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
