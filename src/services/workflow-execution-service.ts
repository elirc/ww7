/**
 * What this file does:
 * Runs leased workflow jobs, evaluates conditions, executes step actions, and applies retry rules.
 * What calls it:
 * src/server/worker/worker.ts and the internal drain API route.
 * What it calls:
 * Job/run repositories plus the condition, template, and audit helpers.
 * One thing a junior engineer would likely get wrong:
 * Holding a database transaction open while waiting on an HTTP call, which destroys throughput and can deadlock workers.
 */
import "server-only";
import { AuditActorType } from "@prisma/client";
import { evaluateConditionGroup } from "@/lib/workflow/conditions";
import { resolveTemplateStrings } from "@/lib/workflow/templates";
import { workflowJobRepository } from "@/repositories/workflow-job-repository";
import { workflowRunRepository } from "@/repositories/workflow-run-repository";
import type { JsonValue, WorkflowActionConfig, WorkflowExecutionContext } from "@/types/workflow";

function setAtPath(target: Record<string, JsonValue>, path: string, value: JsonValue) {
  const segments = path.split(".");
  const clone = structuredClone(target);
  let cursor: Record<string, JsonValue> = clone;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextValue = cursor[segment];

    if (!nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, JsonValue>;
  }

  cursor[segments.at(-1) as string] = value;
  return clone;
}

async function executeAction(config: WorkflowActionConfig, executionContext: WorkflowExecutionContext) {
  switch (config.type) {
    case "UPDATE_RUN_CONTEXT": {
      const nextContext = setAtPath(executionContext.context, config.path, resolveTemplateStrings(config.value, executionContext));
      return {
        nextContext,
        output: {
          updatedPath: config.path,
        } satisfies JsonValue,
      };
    }
    case "APPEND_RUN_EVENT": {
      return {
        nextContext: executionContext.context,
        auditEvent: {
          kind: `workflow.step.event.${config.level}`,
          message: resolveTemplateStrings(config.message, executionContext),
          metadata: config.metadata ? resolveTemplateStrings(config.metadata, executionContext) : undefined,
        },
      };
    }
    case "HTTP_REQUEST": {
      const resolvedUrl = resolveTemplateStrings(config.url, executionContext);
      const resolvedBody = config.body ? resolveTemplateStrings(config.body, executionContext) : undefined;
      const response = await fetch(String(resolvedUrl), {
        method: config.method,
        headers: Object.fromEntries((config.headers ?? []).map((header) => [header.key, header.value])),
        body: resolvedBody ? JSON.stringify(resolvedBody) : undefined,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      let nextContext = executionContext.context;
      if (config.storeResponseAs) {
        nextContext = setAtPath(nextContext, config.storeResponseAs, responseText);
      }

      return {
        nextContext,
        output: {
          status: response.status,
          body: responseText,
        } satisfies JsonValue,
      };
    }
  }
}

function getNextStepRun(job: NonNullable<Awaited<ReturnType<typeof workflowJobRepository.leaseNextAvailableJob>>>) {
  return job.run.stepRuns?.find((stepRun) => stepRun.position === job.stepRun.position + 1) ?? null;
}

function getMaxAttemptsForStep(job: NonNullable<Awaited<ReturnType<typeof workflowJobRepository.leaseNextAvailableJob>>>, stepRunId: string) {
  return job.run.workflow.steps.find((step) => step.id === job.run.stepRuns.find((stepRun) => stepRun.id === stepRunId)?.stepId)?.maxRetries;
}

export const workflowExecutionService = {
  async drainOnce(workerId: string) {
    const job = await workflowJobRepository.leaseNextAvailableJob(workerId);
    if (!job) {
      return { processed: false };
    }

    const payload = (job.run.triggerPayload ?? {}) as Record<string, JsonValue>;
    const context = (job.run.contextSnapshot ?? {}) as Record<string, JsonValue>;
    const executionContext: WorkflowExecutionContext = {
      payload,
      context,
      workflow: {
        id: job.run.workflow.id,
        name: job.run.workflow.name,
        status: job.run.workflow.status,
      },
      run: {
        id: job.run.id,
        status: job.run.status,
      },
    };

    const nextStepRun = getNextStepRun(job);

    try {
      if (!evaluateConditionGroup(job.stepRun.step.condition as never, executionContext)) {
        await workflowRunRepository.markStepSkipped(
          job.run.id,
          job.stepRun.id,
          nextStepRun?.id,
          nextStepRun ? getMaxAttemptsForStep(job, nextStepRun.id)! + 1 : undefined,
        );
        await workflowJobRepository.markSucceeded(job.id);
        return { processed: true, jobId: job.id, status: "skipped" };
      }

      await workflowRunRepository.markRunRunning(job.run.id);
      await workflowRunRepository.markStepRunning(job.stepRun.id, job.attempts + 1, payload);

      // SENIOR NOTE: execute the side effect after leasing but outside a long database transaction.
      const result = await executeAction(job.stepRun.step.config as WorkflowActionConfig, executionContext);

      if (result.auditEvent) {
        await workflowRunRepository.createAuditEvent({
          workflowId: job.run.workflow.id,
          runId: job.run.id,
          actorType: AuditActorType.SYSTEM,
          kind: result.auditEvent.kind,
          message: String(result.auditEvent.message),
          metadata: (result.auditEvent.metadata ?? null) as JsonValue | undefined,
        });
      }

      await workflowRunRepository.markStepSucceeded({
        runId: job.run.id,
        stepRunId: job.stepRun.id,
        outputSnapshot: (result.output ?? null) as JsonValue,
        contextSnapshot: result.nextContext,
        nextStepRunId: nextStepRun?.id,
        nextMaxAttempts: nextStepRun ? getMaxAttemptsForStep(job, nextStepRun.id)! + 1 : undefined,
      });
      await workflowJobRepository.markSucceeded(job.id);

      return { processed: true, jobId: job.id, status: "succeeded" };
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message : "Unknown worker error.";

      if (attempts < job.maxAttempts) {
        // Backoff scheduling is persisted so a worker restart does not erase retry intent.
        const readyAt = new Date(Date.now() + attempts * 15_000);
        await workflowRunRepository.markStepRetrying(job.stepRun.id, job.run.id, attempts, readyAt, message);
        return { processed: true, jobId: job.id, status: "retrying" };
      }

      await workflowRunRepository.markStepFailed(job.run.id, job.stepRun.id, attempts, message);
      await workflowJobRepository.markDead(job.id, message);

      return { processed: true, jobId: job.id, status: "failed" };
    }
  },
};

