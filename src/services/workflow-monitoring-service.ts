/**
 * What this file does:
 * Provides read-only monitoring queries for workflow dashboards and run detail pages.
 * What calls it:
 * src/app/page.tsx, src/app/workflows/[workflowId]/page.tsx, and related REST handlers.
 * What it calls:
 * Workflow and run repositories.
 * One thing a junior engineer would likely get wrong:
 * Letting UI components query repositories directly, which couples presentation to database shape.
 */
import "server-only";
import { getWorkflowVisibilityScope } from "@/lib/auth/permissions";
import { AppError } from "@/lib/http/errors";
import { workflowRepository } from "@/repositories/workflow-repository";
import { workflowRunRepository } from "@/repositories/workflow-run-repository";
import type { RouteActor } from "@/types/workflow";

export const workflowMonitoringService = {
  async getDashboard(actor: RouteActor) {
    const workflows = await workflowRepository.listWorkflows(getWorkflowVisibilityScope(actor), actor.userId);
    // SENIOR NOTE: dashboards are tempting places to bypass scope checks for convenience; keep the same repository boundaries here.
    const recentRuns = (
      await Promise.all(
        workflows.slice(0, 4).map((workflow) =>
          workflowRunRepository.listRunsForWorkflow(workflow.id, getWorkflowVisibilityScope(actor), actor.userId),
        ),
      )
    )
      .flat()
      .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)))
      .slice(0, 8);

    return {
      workflows,
      recentRuns,
      stats: {
        totalWorkflows: workflows.length,
        activeWorkflows: workflows.filter((workflow) => workflow.status === "ACTIVE").length,
        pausedWorkflows: workflows.filter((workflow) => workflow.status === "PAUSED").length,
        failedRuns: recentRuns.filter((run) => run.status === "FAILED").length,
      },
    };
  },

  async getRun(actor: RouteActor, runId: string) {
    const run = await workflowRunRepository.findRunById(runId, getWorkflowVisibilityScope(actor), actor.userId);

    if (!run) {
      throw new AppError("Workflow run not found.", 404, "WORKFLOW_RUN_NOT_FOUND");
    }

    return run;
  },
};

