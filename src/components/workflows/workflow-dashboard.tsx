"use client";

/**
 * What this file does:
 * Renders the dashboard summary, workflow list, and recent run monitor using dashboard API data.
 * What calls it:
 * src/app/page.tsx.
 * What it calls:
 * src/hooks/use-dashboard.ts and the reusable UI shell/panel components.
 * One thing a junior engineer would likely get wrong:
 * Packing data fetching, transformation, and mutation logic into the page file instead of a focused component plus hook.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { useDashboard } from "@/hooks/use-dashboard";

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PAUSED: "bg-amber-50 text-amber-700 border-amber-200",
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  ARCHIVED: "bg-rose-50 text-rose-700 border-rose-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RUNNING: "bg-sky-50 text-sky-700 border-sky-200",
  QUEUED: "bg-violet-50 text-violet-700 border-violet-200",
};

export function WorkflowDashboard() {
  const dashboardQuery = useDashboard();

  if (dashboardQuery.isLoading) {
    return <Panel>Loading dashboard...</Panel>;
  }

  if (dashboardQuery.error) {
    return <Panel>Dashboard failed to load: {dashboardQuery.error.message}</Panel>;
  }

  const dashboard = dashboardQuery.data!;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Workflows", dashboard.stats.totalWorkflows],
          ["Active", dashboard.stats.activeWorkflows],
          ["Paused", dashboard.stats.pausedWorkflows],
          ["Recent Failures", dashboard.stats.failedRuns],
        ].map(([label, value]) => (
          <Panel key={label} className="bg-slate-950 text-white">
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-400">{label}</p>
            <p className="mt-4 text-4xl font-semibold">{value}</p>
          </Panel>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">Workflow Catalog</p>
              <h2 className="text-2xl font-semibold text-slate-950">Definitions and ownership</h2>
            </div>
            <Link href="/workflows/new" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              Build Workflow
            </Link>
          </div>
          <div className="space-y-4">
            {dashboard.workflows.map((workflow) => (
              <Link key={workflow.id} href={`/workflows/${workflow.id}`} className="block rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{workflow.name}</h3>
                    <p className="text-sm text-slate-600">{workflow.description || "No description yet."}</p>
                  </div>
                  <Badge className={statusStyles[workflow.status]}>{workflow.status}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
                  <span>{workflow.triggerType}</span>
                  <span>{workflow._count.steps} steps</span>
                  <span>{workflow._count.runs} runs</span>
                  <span>Owner: {workflow.createdBy.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">Run Monitor</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Recent executions</h2>
          <div className="mt-4 space-y-4">
            {dashboard.recentRuns.map((run) => (
              <div key={run.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{run.workflow.name}</p>
                    <p className="text-sm text-slate-500">{new Date(run.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge className={statusStyles[run.status]}>{run.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

