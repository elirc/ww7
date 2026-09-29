/**
 * What this file does:
 * Creates workflow runs from manual triggers, event triggers, and scheduled dispatches.
 * What calls it:
 * src/app/api/workflows/[workflowId]/trigger/route.ts, src/app/api/events/ingest/route.ts, and src/services/scheduler-service.ts.
 * What it calls:
 * Workflow and run repositories plus schedule helpers for advancing the next scheduled timestamp.
 * One thing a junior engineer would likely get wrong:
 * Dispatching inactive workflows or forgetting to advance nextScheduledAt for scheduled definitions.
 */
import "server-only";
import { AuditActorType, WorkflowStatus, WorkflowTriggerType } from "@prisma/client";
import { assertCanManageWorkflow, getWorkflowVisibilityScope } from "@/lib/auth/permissions";
import { AppError } from "@/lib/http/errors";
import { getNextScheduledAt } from "@/lib/workflow/schedule";
import { workflowRepository } from "@/repositories/workflow-repository";
import { workflowRunRepository } from "@/repositories/workflow-run-repository";
import type { JsonValue, RouteActor } from "@/types/workflow";

async function enqueueRunForWorkflow(
  workflow: NonNullable<Awaited<ReturnType<typeof workflowRepository.findExecutionReadyById>>>,
  payload: Record<string, JsonValue>,
  triggerSource: string,
  actorId?: string | null,
) {
  const firstStep = workflow.steps[0] ?? null;

  // SENIOR NOTE: dispatch paths must converge here or manual/event/schedule triggers will drift in subtle ways.
  return workflowRunRepository.createRunForWorkflow({
    workflowId: workflow.id,
    initiatedByUserId: actorId ?? null,
    triggerSource,
    triggerPayload: payload,
    firstStep: firstStep ? { id: firstStep.id, maxRetries: firstStep.maxRetries } : null,
    stepBlueprints: workflow.steps.map((step) => ({ id: step.id, position: step.position })),
  });
}

export const workflowDispatchService = {
  async triggerWorkflowManually(actor: RouteActor, workflowId: string, payload: Record<string, JsonValue>) {
    const scope = getWorkflowVisibilityScope(actor);
    const workflow = await workflowRepository.findById(workflowId, scope, actor.userId);

    if (!workflow) {
      throw new AppError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    }

    assertCanManageWorkflow(actor, workflow);

    if (workflow.status !== WorkflowStatus.ACTIVE) {
      throw new AppError("Only active workflows can be triggered manually.", 409, "WORKFLOW_NOT_ACTIVE");
    }

    const executionReadyWorkflow = await workflowRepository.findExecutionReadyById(workflow.id);
    if (!executionReadyWorkflow) {
      throw new AppError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    }

    return enqueueRunForWorkflow(executionReadyWorkflow, payload, "manual", actor.userId);
  },

  async ingestEvent(eventName: string, payload: Record<string, JsonValue>, actor?: RouteActor | null) {
    const workflows = await workflowRepository.listActiveEventWorkflows(eventName);
    const runs = [];

    for (const workflow of workflows) {
      runs.push(await enqueueRunForWorkflow(workflow, payload, `event:${eventName}`, actor?.userId ?? null));

      await workflowRunRepository.createAuditEvent({
        workflowId: workflow.id,
        actorType: actor ? AuditActorType.USER : AuditActorType.SYSTEM,
        actorId: actor?.userId ?? null,
        kind: "workflow.event.dispatched",
        message: `Event ${eventName} matched workflow ${workflow.name}.`,
        metadata: {
          eventName,
        },
      });
    }

    return {
      matchedWorkflowCount: workflows.length,
      createdRunCount: runs.length,
    };
  },

  async dispatchScheduledRuns(now = new Date()) {
    const workflows = await workflowRepository.listDueScheduledWorkflows(now);
    let createdRunCount = 0;

    for (const workflow of workflows) {
      await enqueueRunForWorkflow(workflow, {}, "schedule", null);
      createdRunCount += 1;

      if (workflow.triggerType === WorkflowTriggerType.SCHEDULE && workflow.cronExpression) {
        // Advancing nextScheduledAt after dispatch prevents the scheduler from enqueuing the same workflow repeatedly.
        const nextScheduledAt = getNextScheduledAt(workflow.cronExpression, now);
        await workflowRepository.updateStatus(workflow.id, workflow.updatedByUserId, WorkflowStatus.ACTIVE, nextScheduledAt);
      }
    }

    return {
      dueWorkflowCount: workflows.length,
      createdRunCount,
    };
  },
};

