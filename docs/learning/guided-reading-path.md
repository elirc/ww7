# Guided Reading Path

## Step 1 — src/app/api/workflows/route.ts
**Why read this:** It shows the thin-route pattern for authenticated create/list endpoints.
**What to look for:** `executeRoute()` is the only route wrapper, and the handler immediately hands off to the service layer.
**What to trace:** Called by the workflow builder in `src/components/workflows/workflow-builder.tsx` through `src/lib/http/api-client.ts`; calls `src/services/workflow-definition-service.ts`.
**What a junior would likely miss:** The route does not own business rules; it only owns transport concerns.

## Step 2 — src/lib/http/route-helpers.ts
**Why read this:** This is the HTTP control point for auth, permission checks, validation, and error mapping.
**What to look for:** `executeRoute()` composes `getSessionActor()`, `assertPermission()`, and Zod parsing.
**What to trace:** Called by nearly every route in `src/app/api/**`; calls `src/lib/auth/session.ts`, `src/lib/auth/permissions.ts`, and `src/lib/http/errors.ts`.
**What a junior would likely miss:** If this file is wrong, every route is wrong in the same way.

## Step 3 — src/lib/auth/session.ts
**Why read this:** It shows how session cookies become authoritative actors.
**What to look for:** `getSessionActor()` verifies JWT and then reloads the user from the repository.
**What to trace:** Called by `src/lib/http/route-helpers.ts`; calls `src/repositories/user-repository.ts`.
**What a junior would likely miss:** The database reload prevents stale role claims from the cookie from becoming the source of truth.

## Step 4 — src/lib/auth/permissions.ts
**Why read this:** This is the centralized RBAC and ownership module.
**What to look for:** `permissionMatrix`, `assertPermission()`, `assertCanManageWorkflow()`, and `getWorkflowVisibilityScope()`.
**What to trace:** Called by `src/lib/http/route-helpers.ts`, `src/services/workflow-definition-service.ts`, and `src/services/workflow-dispatch-service.ts`.
**What a junior would likely miss:** Role checks and ownership checks solve different problems and both are required.

## Step 5 — src/lib/validation/workflow-schemas.ts
**Why read this:** It is the validation boundary for every workflow payload.
**What to look for:** The discriminated unions for trigger config and action config plus the `superRefine()` that ensures `actionType` matches `config.type`.
**What to trace:** Called by workflow routes in `src/app/api/workflows/**` and event routes in `src/app/api/events/ingest/route.ts`.
**What a junior would likely miss:** Nested unions are where most workflow-builder bugs show up.

## Step 6 — src/services/workflow-definition-service.ts
**Why read this:** This file owns definition CRUD and status transitions.
**What to look for:** `updateWorkflow()` vs `transitionWorkflowStatus()` and where ownership is enforced.
**What to trace:** Called by `src/app/api/workflows/route.ts`, `src/app/api/workflows/[workflowId]/route.ts`, and `src/app/api/workflows/[workflowId]/publish/route.ts`; calls `src/repositories/workflow-repository.ts`, `src/lib/workflow/status-machine.ts`, and `src/lib/workflow/schedule.ts`.
**What a junior would likely miss:** Activation logic is not “just another PATCH.”

## Step 7 — src/repositories/workflow-repository.ts
**Why read this:** It holds the workflow query boundary and the ownership filter.
**What to look for:** `buildWorkflowVisibilityWhere()` and the nested `include` shape for list/detail queries.
**What to trace:** Called by `src/services/workflow-definition-service.ts`, `src/services/workflow-dispatch-service.ts`, and tests in `src/tests/workflow-visibility.test.ts`.
**What a junior would likely miss:** A missing `createdByUserId` filter here becomes a data leak, not just a UI bug.

## Step 8 — src/services/workflow-dispatch-service.ts
**Why read this:** It shows how event, schedule, and manual triggers all converge into one run-enqueue path.
**What to look for:** `enqueueRunForWorkflow()`, `triggerWorkflowManually()`, `ingestEvent()`, and `dispatchScheduledRuns()`.
**What to trace:** Called by trigger routes, event routes, and `src/services/scheduler-service.ts`; calls workflow and run repositories.
**What a junior would likely miss:** Trigger handling and step execution are separate concerns.

## Step 9 — src/repositories/workflow-run-repository.ts
**Why read this:** This file owns execution-state persistence and transaction boundaries.
**What to look for:** `createRunForWorkflow()`, `markStepSucceeded()`, `markStepRetrying()`, and `markStepFailed()`.
**What to trace:** Called by `src/services/workflow-dispatch-service.ts`, `src/services/workflow-execution-service.ts`, and `src/services/workflow-monitoring-service.ts`.
**What a junior would likely miss:** Run state and step state must move together transactionally.

## Step 10 — src/repositories/workflow-job-repository.ts
**Why read this:** This is the concurrency-critical queue implementation.
**What to look for:** `leaseNextAvailableJob()` and the `FOR UPDATE SKIP LOCKED` query.
**What to trace:** Called by `src/services/workflow-execution-service.ts`.
**What a junior would likely miss:** `findFirst()` plus `update()` is not a safe queue lease.

## Step 11 — src/services/workflow-execution-service.ts
**Why read this:** It is the async engine core.
**What to look for:** `drainOnce()`, `executeAction()`, conditional execution, retry scheduling, and audit creation.
**What to trace:** Called by `src/server/worker/worker.ts` and `src/app/api/internal/worker/drain/route.ts`; calls repositories plus `src/lib/workflow/conditions.ts` and `src/lib/workflow/templates.ts`.
**What a junior would likely miss:** External HTTP work happens outside the leasing transaction for a reason.

## Step 12 — src/components/workflows/workflow-builder.tsx
**Why read this:** This is the UI that exercises the whole backend shape.
**What to look for:** How the form serializes directly into the workflow schema and how status/run actions call separate endpoints.
**What to trace:** Rendered by `src/app/workflows/new/page.tsx` and `src/app/workflows/[workflowId]/page.tsx`; calls `src/hooks/use-workflow.ts` and `src/lib/http/api-client.ts`.
**What a junior would likely miss:** Builder UI should mirror the backend payload shape instead of inventing a second model.

## Step 13 — prisma/schema.prisma
**Why read this:** The whole domain becomes clearer once you see how definitions, runs, step runs, jobs, and audit events relate.
**What to look for:** The execution hierarchy and where trigger fields live.
**What to trace:** Referenced by every repository and by seed data in `prisma/seed.ts`.
**What a junior would likely miss:** Modeling async execution usually needs separate run, step-run, and job tables.
