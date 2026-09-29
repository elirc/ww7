/**
 * What this file does:
 * Guards workflow status transitions and the preconditions required before activation.
 * What calls it:
 * src/services/workflow-definition-service.ts and tests.
 * What it calls:
 * AppError from src/lib/http/errors.ts.
 * One thing a junior engineer would likely get wrong:
 * Treating status as a free-form field update instead of a state transition with business rules.
 */
import { WorkflowStatus, WorkflowTriggerType } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import type { WorkflowDefinitionInput } from "@/lib/validation/workflow-schemas";

const allowedTransitions: Record<WorkflowStatus, WorkflowStatus[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

export function assertValidWorkflowTransition(currentStatus: WorkflowStatus, nextStatus: WorkflowStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  // SENIOR NOTE: permissive transitions become irreversible data-quality bugs once real operations depend on workflow state.
  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new AppError(
      `Workflow cannot transition from ${currentStatus} to ${nextStatus}.`,
      409,
      "INVALID_WORKFLOW_TRANSITION",
    );
  }
}

export function assertReadyForActivation(
  workflow: Pick<WorkflowDefinitionInput, "steps" | "triggerType" | "eventName" | "cronExpression">,
) {
  if (workflow.steps.length === 0) {
    throw new AppError("An active workflow must have at least one step.", 422, "WORKFLOW_STEP_REQUIRED");
  }

  if (workflow.triggerType === WorkflowTriggerType.EVENT && !workflow.eventName) {
    throw new AppError("Event-based workflows must define an event name.", 422, "EVENT_NAME_REQUIRED");
  }

  if (workflow.triggerType === WorkflowTriggerType.SCHEDULE && !workflow.cronExpression) {
    throw new AppError(
      "Scheduled workflows must define a cron expression.",
      422,
      "CRON_EXPRESSION_REQUIRED",
    );
  }
}

