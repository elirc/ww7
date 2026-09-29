/**
 * What this file does:
 * Owns workflow definition CRUD plus status transitions and activation preconditions.
 * What calls it:
 * Workflow REST handlers under src/app/api/workflows/**.
 * What it calls:
 * Repositories in src/repositories, RBAC helpers in src/lib/auth/permissions.ts, and state/schedule helpers in src/lib/workflow/**.
 * One thing a junior engineer would likely get wrong:
 * Letting route handlers mutate workflow status directly without checking readiness or ownership.
 */
import "server-only";
import { WorkflowStatus, WorkflowTriggerType } from "@prisma/client";
import { assertCanManageWorkflow, getWorkflowVisibilityScope } from "@/lib/auth/permissions";
import { AppError } from "@/lib/http/errors";
import { getNextScheduledAt } from "@/lib/workflow/schedule";
import { assertReadyForActivation, assertValidWorkflowTransition } from "@/lib/workflow/status-machine";
import type { WorkflowDefinitionInput } from "@/lib/validation/workflow-schemas";
import { workflowRepository } from "@/repositories/workflow-repository";
import { workflowRunRepository } from "@/repositories/workflow-run-repository";
import type { RouteActor } from "@/types/workflow";

function getActivationTimestamp(workflow: Pick<WorkflowDefinitionInput, "triggerType" | "cronExpression">) {
  if (workflow.triggerType !== WorkflowTriggerType.SCHEDULE || !workflow.cronExpression) {
    return null;
  }

  return getNextScheduledAt(workflow.cronExpression);
}

function toDefinitionInput(workflow: Awaited<ReturnType<typeof workflowRepository.findById>>) {
  if (!workflow) {
    return null;
  }

  return {
    name: workflow.name,
    description: workflow.description,
    triggerType: workflow.triggerType,
    eventName: workflow.eventName,
    cronExpression: workflow.cronExpression,
    steps: workflow.steps.map((step) => ({
      id: step.id,
      position: step.position,
      name: step.name,
      actionType: step.actionType,
      config: step.config as never,
      condition: step.condition as never,
      maxRetries: step.maxRetries,
      timeoutSeconds: step.timeoutSeconds,
    })),
  } satisfies WorkflowDefinitionInput;
}

export const workflowDefinitionService = {
  listWorkflows(actor: RouteActor) {
    const scope = getWorkflowVisibilityScope(actor);
    return workflowRepository.listWorkflows(scope, actor.userId);
  },

  async getWorkflow(actor: RouteActor, workflowId: string) {
    const scope = getWorkflowVisibilityScope(actor);
    const workflow = await workflowRepository.findById(workflowId, scope, actor.userId);

    if (!workflow) {
      throw new AppError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    }

    return workflow;
  },

  async createWorkflow(actor: RouteActor, input: WorkflowDefinitionInput) {
    return workflowRepository.createWorkflow(actor.userId, input, null);
  },

  async updateWorkflow(actor: RouteActor, workflowId: string, input: WorkflowDefinitionInput) {
    const workflow = await workflowRepository.findById(workflowId, "all");

    if (!workflow) {
      throw new AppError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    }

    assertCanManageWorkflow(actor, workflow);

    const nextScheduledAt = workflow.status === WorkflowStatus.ACTIVE ? getActivationTimestamp(input) : null;
    if (workflow.status === WorkflowStatus.ACTIVE) {
      // SENIOR NOTE: editing an active workflow can silently invalidate future dispatches unless activation rules are re-checked here.
      assertReadyForActivation(input);
    }

    return workflowRepository.updateWorkflow(workflowId, actor.userId, input, nextScheduledAt);
  },

  async transitionWorkflowStatus(actor: RouteActor, workflowId: string, nextStatus: WorkflowStatus) {
    const workflow = await workflowRepository.findById(workflowId, "all");

    if (!workflow) {
      throw new AppError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    }

    assertCanManageWorkflow(actor, workflow);
    assertValidWorkflowTransition(workflow.status, nextStatus);

    if (workflow.status === nextStatus) {
      return workflow;
    }

    const definitionInput = toDefinitionInput(workflow);
    if (!definitionInput) {
      throw new AppError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    }

    let nextScheduledAt: Date | null = null;
    if (nextStatus === WorkflowStatus.ACTIVE) {
      assertReadyForActivation(definitionInput);
      nextScheduledAt = getActivationTimestamp(definitionInput);
    }

    const updatedWorkflow = await workflowRepository.updateStatus(workflowId, actor.userId, nextStatus, nextScheduledAt);

    await workflowRunRepository.createAuditEvent({
      workflowId,
      actorType: "USER",
      actorId: actor.userId,
      kind: "workflow.status.changed",
      message: `Workflow moved from ${workflow.status} to ${nextStatus}.`,
      metadata: {
        previousStatus: workflow.status,
        nextStatus,
      },
    });

    return updatedWorkflow;
  },
};

