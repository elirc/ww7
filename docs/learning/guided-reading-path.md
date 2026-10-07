# Guided Reading Path

## Step 1 — src/app/api/workflows/route.ts
**Why read this:** It shows the thin-route pattern for authenticated create/list endpoints.
**What to look for:** `executeRoute()` is the only route wrapper, and the handler immediately hands off to the service layer.
**What to trace:** Called by the workflow builder in `src/components/workflows/workflow-builder.tsx` through `src/lib/http/api-client.ts`; calls `src/services/workflow-definition-service.ts`.
**What a junior would likely miss:** The route does not own business rules; it only owns transport concerns.

## Step 2 — src/lib/http/route-helpers.ts
**Why read this:** This is the HTTP control point for auth, permission checks, validation, and error mapping.
**What to look for:** `executeRoute()` composes `getSessionActor()`, `assertPermission()`, and Zod parsing.
**What to trace:** Called by every one of the 13 route files in `src/app/api/**`, including login, logout, session, and the two internal routes, which pass `{}` as options. It calls `src/lib/auth/session.ts`, `src/lib/auth/permissions.ts`, and `src/lib/http/errors.ts`.
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
**Verified defect to spot while reading:** lines 97 and 102 use `z.nullish()` as a standalone factory. Zod 3 only has `.nullish()` as a method. Against zod 3.25.76, `typeof z.nullish` is `"undefined"`, and building the union throws `TypeError` (run with `node --test`; see `testing-rationale.md`). As written, the module cannot load. The intent was "the other trigger's field must be null or absent", which `z.null().optional()` expresses.

## Step 6 — src/services/workflow-definition-service.ts
**Why read this:** This file owns definition CRUD and status transitions.
**What to look for:** `updateWorkflow()` vs `transitionWorkflowStatus()` and where ownership is enforced.
**What to trace:** Called by `src/app/api/workflows/route.ts`, `src/app/api/workflows/[workflowId]/route.ts`, and `src/app/api/workflows/[workflowId]/publish/route.ts`; calls `src/repositories/workflow-repository.ts`, `src/lib/workflow/status-machine.ts`, and `src/lib/workflow/schedule.ts`.
**What a junior would likely miss:** Activation logic is not “just another PATCH.” Also note the order at lines 100-105: ownership and transition checks run first, then a same-status request returns early. A foreign operator still gets 403 instead of a silent no-op.

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
**Also look at:** the `switch (config.type)` at line 40 has no `default`. A config without a recognised `type` returns `undefined`, and the crash happens later at line 141. The retry arithmetic sits at lines 164-169: `maxAttempts = maxRetries + 1`, with a linear 15 s backoff.

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
**Also look at:** the `onDelete` choices. `WorkflowStepRun.step` is `Restrict` (line 160), which collides with the delete-and-recreate step update in `src/repositories/workflow-repository.ts:136`. See `docs/architecture/domain-model.md`.

## Where each step lives (line ranges verified)

| Step | Anchor |
| --- | --- |
| 1 | `src/app/api/workflows/route.ts:6-18` |
| 2 | `executeRoute()` at `src/lib/http/route-helpers.ts:30-64` |
| 3 | `getSessionActor()` at `src/lib/auth/session.ts:59-86`; DB reload at line 71 |
| 4 | `permissionMatrix` at `src/lib/auth/permissions.ts:16-27`; `assertCanManageWorkflow()` at 40-52 |
| 5 | `workflowStepSchema` at `src/lib/validation/workflow-schemas.ts:65-85`; `workflowDefinitionSchema` at 93-104 |
| 6 | `updateWorkflow()` at `src/services/workflow-definition-service.ts:75-91`; `transitionWorkflowStatus()` at 93-133 (same-status guard at 103-105) |
| 7 | `buildWorkflowVisibilityWhere()` at `src/repositories/workflow-repository.ts:17-28` |
| 8 | `enqueueRunForWorkflow()` at `src/services/workflow-dispatch-service.ts:20-37` |
| 9 | `createRunForWorkflow()` at `src/repositories/workflow-run-repository.ts:29-91` |
| 10 | lease SQL at `src/repositories/workflow-job-repository.ts:20-36` |
| 11 | `drainOnce()` at `src/services/workflow-execution-service.ts:99-179` |
| 12 | `saveMutation` at `src/components/workflows/workflow-builder.tsx:103-147` |
| 13 | `model WorkflowJob` at `prisma/schema.prisma:168-186` |

## Exercise ladder

Work through these in order. Each one builds on the files above and needs no new infrastructure beyond what the repo declares.

1. **Goal:** Read `permissions.ts` and predict the HTTP status for an analyst calling each of the 15 route/method pairs (route table in `docs/architecture/README.md`). **Check:** your answers match the table: 401 without a cookie, 403 for write, publish, and execute, 200 for reads, and the internal routes are independent of role.
2. **Goal:** Fix `z.nullish()` in `workflow-schemas.ts`. **Check:** `src/tests/workflow-schemas.test.ts` can at least import the module (after you also fix the `@/` alias; see `testing-rationale.md`), and a SCHEDULE payload with `eventName: null` parses.
3. **Goal:** Map `ZodError` to 400 in `route-helpers.ts`. **Check:** login with a 3-character password returns 400 with field details, and an analyst with an invalid body still gets 403. The order must not change.
4. **Goal:** Add a `default:` branch to `executeAction()` that throws `Unsupported action type`. **Check:** the seeded workflow's `lastError` now reads that message instead of a `TypeError` about `auditEvent`.
5. **Goal:** Add lease reclaim to the candidate query. **Check:** a job whose `leasedUntil` is in the past and whose status is `LEASED` is picked up by the next `drainOnce()`.
6. **Goal:** Check `leaseToken` on completion (`markSucceeded`/`markDead` with `where: { id, leaseToken }`). **Check:** a worker whose lease was reclaimed cannot overwrite the new holder's result. Use `updateMany` and assert `count === 1`.
7. **Goal:** Close the event-ingest ownership gap. **Check:** as described in `docs/architecture/auth-and-permissions.md` exercise 2.
8. **Goal:** Make step edits safe after runs exist. **Check:** PATCHing a workflow that has a SUCCEEDED run returns 200, and the old run's step-run rows still join to their original step definitions.
