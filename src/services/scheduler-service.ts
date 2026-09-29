/**
 * What this file does:
 * Runs the schedule-dispatch loop that turns due cron workflows into queued workflow runs.
 * What calls it:
 * src/server/worker/scheduler.ts and src/app/api/internal/scheduler/dispatch/route.ts.
 * What it calls:
 * src/services/workflow-dispatch-service.ts.
 * One thing a junior engineer would likely get wrong:
 * Combining scheduling and step execution in one loop, which makes failures harder to isolate operationally.
 */
import "server-only";
import { workflowDispatchService } from "@/services/workflow-dispatch-service";

export const schedulerService = {
  async dispatchDueWorkflows(now = new Date()) {
    // SENIOR NOTE: the scheduler only enqueues runs; step execution stays in the worker so cron pressure cannot block API traffic.
    return workflowDispatchService.dispatchScheduledRuns(now);
  },
};

