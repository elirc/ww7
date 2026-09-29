/**
 * What this file does:
 * Encapsulates workflow-definition queries, including ownership scoping and nested step persistence.
 * What calls it:
 * src/services/workflow-definition-service.ts and src/services/workflow-dispatch-service.ts.
 * What it calls:
 * Prisma through src/lib/db.ts and the slug helper in src/lib/utils.ts.
 * One thing a junior engineer would likely get wrong:
 * Forgetting to scope operator queries by createdByUserId, which leaks another operator's workflows.
 */
import "server-only";
import { Prisma, WorkflowStatus, WorkflowTriggerType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import type { WorkflowDefinitionInput, WorkflowVisibilityScope } from "@/types/workflow";

export function buildWorkflowVisibilityWhere(
  scope: WorkflowVisibilityScope,
  actorId?: string,
): Prisma.WorkflowDefinitionWhereInput {
  if (scope === "own") {
    // SENIOR NOTE: this filter is the operator isolation boundary; removing it leaks another operator's workflow catalog.
    // Scoping by creatorId is the current ownership boundary for non-admin workflow management.
    return { createdByUserId: actorId };
  }

  return {};
}

function mapWorkflowSteps(input: WorkflowDefinitionInput) {
  return input.steps.map((step) => ({
    position: step.position,
    name: step.name,
    actionType: step.actionType,
    config: step.config,
    condition: step.condition ?? Prisma.JsonNull,
    maxRetries: step.maxRetries,
    timeoutSeconds: step.timeoutSeconds ?? null,
  }));
}

export const workflowRepository = {
  listWorkflows(scope: WorkflowVisibilityScope, actorId?: string) {
    return prisma.workflowDefinition.findMany({
      where: buildWorkflowVisibilityWhere(scope, actorId),
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        steps: {
          orderBy: { position: "asc" },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        _count: {
          select: {
            runs: true,
            steps: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });
  },

  findById(workflowId: string, scope: WorkflowVisibilityScope, actorId?: string) {
    return prisma.workflowDefinition.findFirst({
      where: {
        id: workflowId,
        ...buildWorkflowVisibilityWhere(scope, actorId),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        steps: {
          orderBy: { position: "asc" },
        },
      },
    });
  },

  findExecutionReadyById(workflowId: string) {
    return prisma.workflowDefinition.findUnique({
      where: { id: workflowId },
      include: {
        steps: {
          orderBy: { position: "asc" },
        },
      },
    });
  },

  createWorkflow(actorId: string, input: WorkflowDefinitionInput, nextScheduledAt: Date | null) {
    return prisma.workflowDefinition.create({
      data: {
        name: input.name,
        slug: slugify(`${input.name}-${Date.now()}`),
        description: input.description ?? null,
        triggerType: input.triggerType,
        eventName: input.eventName ?? null,
        cronExpression: input.cronExpression ?? null,
        nextScheduledAt,
        createdByUserId: actorId,
        updatedByUserId: actorId,
        steps: {
          create: mapWorkflowSteps(input),
        },
      },
      include: {
        steps: { orderBy: { position: "asc" } },
      },
    });
  },

  async updateWorkflow(workflowId: string, actorId: string, input: WorkflowDefinitionInput, nextScheduledAt: Date | null) {
    return prisma.$transaction(async (tx) => {
      // Replacing steps wholesale keeps position ordering and removed-step cleanup explicit.
      await tx.workflowStep.deleteMany({ where: { workflowId } });

      return tx.workflowDefinition.update({
        where: { id: workflowId },
        data: {
          name: input.name,
          description: input.description ?? null,
          triggerType: input.triggerType,
          eventName: input.eventName ?? null,
          cronExpression: input.cronExpression ?? null,
          nextScheduledAt,
          updatedByUserId: actorId,
          steps: {
            create: mapWorkflowSteps(input),
          },
        },
        include: {
          steps: { orderBy: { position: "asc" } },
        },
      });
    });
  },

  updateStatus(workflowId: string, actorId: string, status: WorkflowStatus, nextScheduledAt: Date | null) {
    return prisma.workflowDefinition.update({
      where: { id: workflowId },
      data: {
        status,
        nextScheduledAt,
        updatedByUserId: actorId,
      },
    });
  },

  listActiveEventWorkflows(eventName: string) {
    return prisma.workflowDefinition.findMany({
      where: {
        status: WorkflowStatus.ACTIVE,
        triggerType: WorkflowTriggerType.EVENT,
        eventName,
      },
      include: {
        steps: {
          orderBy: { position: "asc" },
        },
      },
    });
  },

  listDueScheduledWorkflows(now: Date) {
    return prisma.workflowDefinition.findMany({
      where: {
        status: WorkflowStatus.ACTIVE,
        triggerType: WorkflowTriggerType.SCHEDULE,
        nextScheduledAt: {
          lte: now,
        },
      },
      include: {
        steps: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { nextScheduledAt: "asc" },
    });
  },
};

