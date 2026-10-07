# Architecture Overview

FlowForge is a production-style workflow automation engine built around explicit backend boundaries: route handlers in `src/app/api/**`, auth and validation in `src/lib/**`, business rules in `src/services/**`, and query shape in `src/repositories/**`.

Top-level folders:
- `src/app`: Next.js App Router pages plus REST handlers like `src/app/api/workflows/route.ts` and `src/app/workflows/[workflowId]/page.tsx`.
- `src/components`: UI-only composition such as `src/components/workflows/workflow-builder.tsx` and `src/components/workflows/workflow-dashboard.tsx`.
- `src/hooks`: React Query data hooks like `src/hooks/use-dashboard.ts` and `src/hooks/use-workflow.ts`.
- `src/lib`: cross-cutting backend concerns including auth in `src/lib/auth/session.ts`, validation in `src/lib/validation/workflow-schemas.ts`, and domain helpers in `src/lib/workflow/status-machine.ts`.
- `src/services`: orchestration and business logic, especially `src/services/workflow-definition-service.ts`, `src/services/workflow-dispatch-service.ts`, and `src/services/workflow-execution-service.ts`.
- `src/repositories`: database access modules such as `src/repositories/workflow-repository.ts` and `src/repositories/workflow-job-repository.ts`.
- `src/server/worker`: background processes in `src/server/worker/worker.ts` and `src/server/worker/scheduler.ts`.
- `prisma`: schema and seed data in `prisma/schema.prisma` and `prisma/seed.ts`.
- `src/tests`: focused tests for RBAC, validation, transitions, and ownership scoping.

Why Prisma instead of Drizzle:
- `prisma/schema.prisma` expresses the workflow domain clearly, especially the run/step/job relationship tree.
- The repositories in `src/repositories/*.ts` benefit from Prisma's nested includes and transaction API.
- The only raw SQL is the worker lease in `src/repositories/workflow-job-repository.ts`, where Postgres row locking matters more than ORM ergonomics.

Stack summary:
- Next.js + React + TypeScript
- PostgreSQL + Prisma
- Tailwind CSS
- Zod
- TanStack Query
- REST APIs
- A dedicated Node worker and scheduler for asynchronous execution

Versions are pinned in `package.json`: `next` 16.2.3, `react` 19.2.4, `@prisma/client` ^6.6.0, `zod` ^3.24.2, `jose` ^6.0.10, `bcryptjs` ^3.0.2, `cron-parser` ^5.2.0, and `vitest` ^3.1.2. There is no lockfile, so a fresh install picks up the newest version in each range.

## Layer rules (checked against the code)

```
browser (React Query hooks)  ->  src/lib/http/api-client.ts  ->  src/app/api/**/route.ts
                                                                     |
                                              executeRoute() in src/lib/http/route-helpers.ts
                                              (session -> permission -> zod parse -> handler)
                                                                     |
                                                             src/services/*.ts
                                                     (ownership, state machine, audit)
                                                                     |
                                                           src/repositories/*.ts
                                                       (query shape, scope, transactions)
                                                                     |
                                                     src/lib/db.ts -> PostgreSQL (Prisma)
```

What holds in the current source:
- All 13 route handlers under `src/app/api/**` wrap their work in `executeRoute()`. None of them builds its own error response.
- No UI component imports a repository or service. Components only call `apiRequest()` (`src/lib/http/api-client.ts:1-17`) through hooks or `useMutation`.
- One route skips the service layer: `src/app/api/workflows/[workflowId]/runs/route.ts:14` calls `workflowRunRepository.listRunsForWorkflow()` directly. It first calls `workflowDefinitionService.getWorkflow()` at line 13 so the visibility check still runs. Treat it as the one exception to the layering.
- Background processes (`src/server/worker/*.ts`) call services only, never repositories.

## Route table

| Method + path | File | `permission` passed to `executeRoute` | Body schema | Service call |
| --- | --- | --- | --- | --- |
| POST `/api/auth/login` | `src/app/api/auth/login/route.ts:7` | none | `loginSchema` | `authService.login()` |
| POST `/api/auth/logout` | `src/app/api/auth/logout/route.ts:6` | none | none | `clearSessionCookie()` |
| GET `/api/session` | `src/app/api/session/route.ts:5` | none | none | returns `actor` (can be `null`) |
| GET `/api/dashboard` | `src/app/api/dashboard/route.ts:6` | `workflow:read` | none | `workflowMonitoringService.getDashboard()` |
| GET `/api/workflows` | `src/app/api/workflows/route.ts:7` | `workflow:read` | none | `listWorkflows()` |
| POST `/api/workflows` | `src/app/api/workflows/route.ts:14` | `workflow:write` | `workflowDefinitionSchema` | `createWorkflow()` |
| GET `/api/workflows/[id]` | `src/app/api/workflows/[workflowId]/route.ts:10` | `workflow:read` | none | `getWorkflow()` |
| PATCH `/api/workflows/[id]` | `src/app/api/workflows/[workflowId]/route.ts:21` | `workflow:write` | `workflowDefinitionSchema` | `updateWorkflow()` |
| POST `/api/workflows/[id]/publish` | `src/app/api/workflows/[workflowId]/publish/route.ts:10` | `workflow:publish` | `workflowStatusTransitionSchema` | `transitionWorkflowStatus()` |
| POST `/api/workflows/[id]/trigger` | `src/app/api/workflows/[workflowId]/trigger/route.ts:10` | `workflow:execute` | `manualRunSchema` | `triggerWorkflowManually()` |
| GET `/api/workflows/[id]/runs` | `src/app/api/workflows/[workflowId]/runs/route.ts:11` | `workflow:read` | none | `getWorkflow()` then the repository |
| GET `/api/runs/[runId]` | `src/app/api/runs/[runId]/route.ts:9` | `workflow:read` | none | `workflowMonitoringService.getRun()` |
| POST `/api/events/ingest` | `src/app/api/events/ingest/route.ts:7` | `workflow:execute` | `eventIngestionSchema` | `ingestEvent()` |
| POST `/api/internal/scheduler/dispatch` | `src/app/api/internal/scheduler/dispatch/route.ts:7-8` | none, uses `assertInternalToken()` | none | `schedulerService.dispatchDueWorkflows()` |
| POST `/api/internal/worker/drain` | `src/app/api/internal/worker/drain/route.ts:7-8` | none, uses `assertInternalToken()` | none | `workflowExecutionService.drainOnce("api-drain")` |

Observations from this table:
- `workflow:ops` is granted to ADMIN (`src/lib/auth/permissions.ts:23`), but no route requests it. Ops access actually comes from the shared internal token, not from a role.
- There is no DELETE route. Workflows leave service through the `ARCHIVED` status.
- Pages (`src/app/page.tsx`, `src/app/workflows/**/page.tsx`, `src/app/login/page.tsx`) render client components without a server-side session check. Data protection happens entirely at the API layer, so an unauthenticated visitor sees the page shell and then failed queries.

## Process topology and the database as the queue

There is no Redis or broker. `WorkflowJob` (`prisma/schema.prisma:168-186`) is the queue:
- **Enqueue:** `workflowRunRepository.createRunForWorkflow()` inserts the first job in the same transaction as the run (`src/repositories/workflow-run-repository.ts:37-90`). Later jobs are inserted by `markStepSucceeded()` (lines 219-226) and `markStepSkipped()` (lines 171-178).
- **Dequeue:** `leaseNextAvailableJob()` runs a single `WITH candidate AS (... FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE ... RETURNING id` statement (`src/repositories/workflow-job-repository.ts:20-36`). Selecting and claiming happen in one statement, so two workers cannot claim the same row. This is the one raw-SQL query in the codebase (a grep for `$queryRaw`/`$executeRaw` finds only this one).
- **Retry:** the same job row goes back to `AVAILABLE` with a later `readyAt` (`src/repositories/workflow-run-repository.ts:251-261`).
- **Dead letter:** `markDead()` sets `status = DEAD` (`src/repositories/workflow-job-repository.ts:80-90`).

The scheduler only creates runs. It never executes steps (`src/services/scheduler-service.ts:16`). This split lets cron load and step execution scale and fail independently.

## Architectural gaps a senior reviewer would raise

Each item was verified in the source.

| Gap | Evidence | Consequence |
| --- | --- | --- |
| No lease expiry or reclaim | `leasedUntil` is written at `workflow-job-repository.ts:18,32` and cleared at `:74,:86`, but no query reads it. The lease `WHERE` clause only accepts `status = 'AVAILABLE'` (line 24) | A worker crash between lease and `markSucceeded()` leaves the job `LEASED` and the run `RUNNING` forever |
| Scheduler dispatch is not atomic | `dispatchScheduledRuns()` lists due workflows (`workflow-dispatch-service.ts:88`), enqueues them (line 92), and only then advances `nextScheduledAt` (line 98), all as separate statements with no lock | The `npm run scheduler` loop and `POST /api/internal/scheduler/dispatch` running at the same moment can both enqueue a run for the same tick |
| `timeoutSeconds` is stored but never enforced | Validated at `workflow-schemas.ts:74` and persisted at `workflow-repository.ts:38`. The `fetch()` at `workflow-execution-service.ts:63-67` passes no `signal` | A hanging HTTP endpoint blocks that worker indefinitely. The 30 s lease does not help, because nothing reclaims expired leases |
| Outbound HTTP to any URL | `httpActionSchema.url` is only `z.string().url()` (`workflow-schemas.ts:33`), and the URL is template-resolved at run time (`workflow-execution-service.ts:61`) | Any OPERATOR can make the worker call internal network addresses (SSRF) |
| Step and job completion are not one transaction | `markStepSucceeded()` commits (`workflow-execution-service.ts:152`) before `markSucceeded(job.id)` (line 160) | A crash between the two leaves the next step queued while the finished job stays `LEASED`. The run continues, but the old job never closes |
