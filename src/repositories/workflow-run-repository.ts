/**
 * What this file does:
 * Owns workflow run, step-run, and audit-event persistence for monitoring and execution.
 * What calls it:
 * src/services/workflow-dispatch-service.ts, src/services/workflow-execution-service.ts, and monitoring queries.
 * What it calls:
 * Prisma transactions via src/lib/db.ts.
 * One thing a junior engineer would likely get wrong:
 * Updating run status without updating step status in the same transaction, leaving orphaned execution state.
 */
import "server-only";
import { AuditActorType, Prisma, WorkflowRunStatus, WorkflowStepStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { JsonValue, WorkflowVisibilityScope } from "@/types/workflow";

function buildRunVisibilityWhere(scope: WorkflowVisibilityScope, actorId?: string): Prisma.WorkflowRunWhereInput {
  if (scope === "own") {
    return {
      workflow: {
        createdByUserId: actorId,
      },
    };
  }

  return {};
}

export const workflowRunRepository = {
  createRunForWorkflow(params: {
    workflowId: string;
    initiatedByUserId?: string | null;
    triggerSource: string;
    triggerPayload: Record<string, JsonValue>;
    firstStep: { id: string; maxRetries: number } | null;
    stepBlueprints: Array<{ id: string; position: number }>;
  }) {
    return prisma.$transaction(async (tx) => {
      // SENIOR NOTE: the run, step-runs, first job, and audit event must be created atomically or monitoring becomes misleading.
      const run = await tx.workflowRun.create({
        data: {
          workflowId: params.workflowId,
          initiatedByUserId: params.initiatedByUserId ?? null,
          triggerSource: params.triggerSource,
          triggerPayload: params.triggerPayload,
          contextSnapshot: {},
          status: WorkflowRunStatus.QUEUED,
        },
      });

      const createdStepRuns = [] as Array<{ id: string; position: number; stepId: string }>;
      for (const blueprint of params.stepBlueprints) {
        const stepRun = await tx.workflowStepRun.create({
          data: {
            runId: run.id,
            stepId: blueprint.id,
            position: blueprint.position,
            status: WorkflowStepStatus.PENDING,
          },
        });

        createdStepRuns.push({ id: stepRun.id, position: stepRun.position, stepId: blueprint.id });
      }

      const firstStepRun = createdStepRuns.find((entry) => entry.stepId === params.firstStep?.id);
      if (firstStepRun && params.firstStep) {
        await tx.workflowJob.create({
          data: {
            runId: run.id,
            stepRunId: firstStepRun.id,
            maxAttempts: params.firstStep.maxRetries + 1,
          },
        });
      }

      await tx.workflowAuditEvent.create({
        data: {
          workflowId: params.workflowId,
          runId: run.id,
          actorType: params.initiatedByUserId ? AuditActorType.USER : AuditActorType.SYSTEM,
          actorId: params.initiatedByUserId ?? null,
          kind: "workflow.run.created",
          message: `Workflow run ${run.id} was queued.`,
          metadata: {
            triggerSource: params.triggerSource,
          },
        },
      });

      return run;
    });
  },

  listRunsForWorkflow(workflowId: string, scope: WorkflowVisibilityScope, actorId?: string) {
    return prisma.workflowRun.findMany({
      where: {
        workflowId,
        ...buildRunVisibilityWhere(scope, actorId),
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  findRunById(runId: string, scope: WorkflowVisibilityScope, actorId?: string) {
    return prisma.workflowRun.findFirst({
      where: {
        id: runId,
        ...buildRunVisibilityWhere(scope, actorId),
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            createdByUserId: true,
          },
        },
        stepRuns: {
          include: {
            step: true,
          },
          orderBy: { position: "asc" },
        },
        auditEvents: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  },

  markRunRunning(runId: string) {
    return prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: WorkflowRunStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  },

  markStepRunning(stepRunId: string, attempts: number, inputSnapshot: Record<string, JsonValue>) {
    return prisma.workflowStepRun.update({
      where: { id: stepRunId },
      data: {
        status: WorkflowStepStatus.RUNNING,
        attempts,
        inputSnapshot,
        startedAt: new Date(),
      },
    });
  },

  async markStepSkipped(runId: string, stepRunId: string, nextStepRunId?: string | null, nextMaxAttempts?: number) {
    return prisma.$transaction(async (tx) => {
      await tx.workflowStepRun.update({
        where: { id: stepRunId },
        data: {
          status: WorkflowStepStatus.SKIPPED,
          conditionMatched: false,
          finishedAt: new Date(),
        },
      });

      if (nextStepRunId && nextMaxAttempts) {
        await tx.workflowJob.create({
          data: {
            runId,
            stepRunId: nextStepRunId,
            maxAttempts: nextMaxAttempts,
          },
        });
      } else {
        await tx.workflowRun.update({
          where: { id: runId },
          data: {
            status: WorkflowRunStatus.SUCCEEDED,
            finishedAt: new Date(),
          },
        });
      }
    });
  },

  async markStepSucceeded(params: {
    runId: string;
    stepRunId: string;
    outputSnapshot?: JsonValue;
    contextSnapshot: Record<string, JsonValue>;
    nextStepRunId?: string | null;
    nextMaxAttempts?: number;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.workflowStepRun.update({
        where: { id: params.stepRunId },
        data: {
          status: WorkflowStepStatus.SUCCEEDED,
          conditionMatched: true,
          outputSnapshot: params.outputSnapshot ?? Prisma.JsonNull,
          finishedAt: new Date(),
        },
      });

      await tx.workflowRun.update({
        where: { id: params.runId },
        data: {
          status: WorkflowRunStatus.RUNNING,
          contextSnapshot: params.contextSnapshot,
          startedAt: new Date(),
        },
      });

      if (params.nextStepRunId && params.nextMaxAttempts) {
        await tx.workflowJob.create({
          data: {
            runId: params.runId,
            stepRunId: params.nextStepRunId,
            maxAttempts: params.nextMaxAttempts,
          },
        });
      } else {
        await tx.workflowRun.update({
          where: { id: params.runId },
          data: {
            status: WorkflowRunStatus.SUCCEEDED,
            finishedAt: new Date(),
          },
        });
      }
    });
  },

  async markStepRetrying(stepRunId: string, runId: string, attempts: number, readyAt: Date, lastError: string) {
    return prisma.$transaction(async (tx) => {
      // Retrying rewrites the same job row so monitors can track one logical step execution across attempts.
      await tx.workflowStepRun.update({
        where: { id: stepRunId },
        data: {
          status: WorkflowStepStatus.RETRYING,
          attempts,
          lastError,
        },
      });

      await tx.workflowJob.update({
        where: { stepRunId },
        data: {
          status: "AVAILABLE",
          attempts,
          readyAt,
          lastError,
          leasedUntil: null,
          leaseToken: null,
        },
      });

      await tx.workflowRun.update({
        where: { id: runId },
        data: {
          status: WorkflowRunStatus.RUNNING,
          startedAt: new Date(),
        },
      });
    });
  },

  async markStepFailed(runId: string, stepRunId: string, attempts: number, lastError: string) {
    return prisma.$transaction(async (tx) => {
      await tx.workflowStepRun.update({
        where: { id: stepRunId },
        data: {
          status: WorkflowStepStatus.FAILED,
          attempts,
          lastError,
          finishedAt: new Date(),
        },
      });

      await tx.workflowRun.update({
        where: { id: runId },
        data: {
          status: WorkflowRunStatus.FAILED,
          finishedAt: new Date(),
        },
      });
    });
  },

  createAuditEvent(params: {
    workflowId?: string | null;
    runId?: string | null;
    actorType: AuditActorType;
    actorId?: string | null;
    kind: string;
    message: string;
    metadata?: JsonValue;
  }) {
    return prisma.workflowAuditEvent.create({
      data: {
        workflowId: params.workflowId ?? null,
        runId: params.runId ?? null,
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        kind: params.kind,
        message: params.message,
        metadata: params.metadata ?? Prisma.JsonNull,
      },
    });
  },
};

