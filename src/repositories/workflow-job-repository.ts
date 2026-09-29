/**
 * What this file does:
 * Encapsulates worker job leasing and job-status persistence for async execution.
 * What calls it:
 * src/services/workflow-execution-service.ts and src/server/worker/worker.ts.
 * What it calls:
 * Prisma, including a Postgres FOR UPDATE SKIP LOCKED query for safe concurrent leasing.
 * One thing a junior engineer would likely get wrong:
 * Using findFirst + update outside a lock, which lets multiple workers grab the same job.
 */
import "server-only";
import { WorkflowJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export const workflowJobRepository = {
  async leaseNextAvailableJob(workerId: string) {
    const leaseToken = `${workerId}:${crypto.randomUUID()}`;
    const leasedUntil = new Date(Date.now() + 30_000);

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH candidate AS (
        SELECT id
        FROM "WorkflowJob"
        WHERE status = 'AVAILABLE' AND "readyAt" <= NOW()
        ORDER BY "readyAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "WorkflowJob"
      SET status = 'LEASED',
          "leaseToken" = ${leaseToken},
          "leasedUntil" = ${leasedUntil},
          "updatedAt" = NOW()
      WHERE id IN (SELECT id FROM candidate)
      RETURNING id
    `;

    if (rows.length === 0) {
      return null;
    }

    // SENIOR NOTE: re-read with includes after leasing so the worker executes from a stable, fully-loaded view.
    return prisma.workflowJob.findUnique({
      where: { id: rows[0].id },
      include: {
        run: {
          include: {
            stepRuns: {
              orderBy: { position: "asc" },
            },
            workflow: {
              include: {
                steps: {
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        },
        stepRun: {
          include: {
            step: true,
          },
        },
      },
    });
  },

  markSucceeded(jobId: string) {
    return prisma.workflowJob.update({
      where: { id: jobId },
      data: {
        status: WorkflowJobStatus.SUCCEEDED,
        leasedUntil: null,
        leaseToken: null,
      },
    });
  },

  markDead(jobId: string, lastError: string) {
    return prisma.workflowJob.update({
      where: { id: jobId },
      data: {
        status: WorkflowJobStatus.DEAD,
        lastError,
        leasedUntil: null,
        leaseToken: null,
      },
    });
  },
};

