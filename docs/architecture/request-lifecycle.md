# Request Lifecycle

Request: Create a workflow definition
1. `src/app/api/workflows/route.ts` — `POST` receives JSON and calls `executeRoute()` with `workflowDefinitionSchema`.
2. `src/lib/http/route-helpers.ts` — `executeRoute()` verifies the session with `getSessionActor()` and checks `workflow:write` permission through `assertPermission()`.
3. `src/lib/validation/workflow-schemas.ts` — `workflowDefinitionSchema.parse()` validates nested trigger and step/action config shape.
4. `src/services/workflow-definition-service.ts:71-73` — `createWorkflow()` owns the creation rule. New workflows start in DRAFT through the schema default (`prisma/schema.prisma:89`), because the repository never sets `status`. `nextScheduledAt` is passed as `null` and computed only on activation.
5. `src/repositories/workflow-repository.ts:111-131` — `createWorkflow()` inserts the workflow and nested steps in one `create` with a nested `steps.create`. The slug is `slugify(name + "-" + Date.now())` (line 115).
6. Returns `201` with the created workflow definition.

Request: Manually trigger an active workflow
1. `src/app/api/workflows/[workflowId]/trigger/route.ts` — `POST` validates the manual payload and calls the dispatch service.
2. `src/lib/http/route-helpers.ts` — `executeRoute()` authenticates the actor and checks `workflow:execute`.
3. `src/lib/validation/workflow-schemas.ts` — `manualRunSchema.parse()` validates the trigger payload shape.
4. `src/services/workflow-dispatch-service.ts:40-60` — `triggerWorkflowManually()` loads the workflow, checks ownership with `assertCanManageWorkflow()` (line 48), rejects inactive workflows with 409 `WORKFLOW_NOT_ACTIVE` (lines 50-52), and builds a run. Any ACTIVE workflow can be triggered manually, whether its trigger type is EVENT or SCHEDULE.
5. `src/repositories/workflow-repository.ts` — `findById()` (line 72) loads the scoped workflow definition, so an operator gets 404 rather than 403 for someone else's workflow. `findExecutionReadyById()` (line 100) then re-reads it unscoped to get ordered steps for the run blueprint.
6. `src/repositories/workflow-run-repository.ts` — `createRunForWorkflow()` creates the run, step runs, first job, and audit event in one transaction.
7. Returns `201` with the queued run.

Request: Worker executes a queued step
1. `src/server/worker/worker.ts:16-24` — the poll loop calls `workflowExecutionService.drainOnce(workerId)`. It sleeps 5 s only when nothing was processed.
2. `src/services/workflow-execution-service.ts:100` — `drainOnce()` asks for a leased job and returns `{ processed: false }` if none is available.
3. `src/repositories/workflow-job-repository.ts:16-67` — `leaseNextAvailableJob()` claims one `AVAILABLE` row whose `readyAt <= NOW()` using `FOR UPDATE SKIP LOCKED`, then re-reads it with the run, step runs, workflow steps, and current step included.
4. `src/lib/workflow/conditions.ts:50-66` — `evaluateConditionGroup()` (called at `workflow-execution-service.ts:124`) decides whether the step should run. If it returns false, `markStepSkipped()` queues the next step or finishes the run as SUCCEEDED, the job is marked SUCCEEDED, and the result is `status: "skipped"` (lines 125-132).
5. `src/repositories/workflow-run-repository.ts` — `markRunRunning()` and `markStepRunning()` (`workflow-execution-service.ts:135-136`) record in-flight state. They are two separate writes, not one transaction.
6. `src/services/workflow-execution-service.ts:39-88` — `executeAction()` runs the HTTP request, context update, or audit-event branch. Inside each branch, `resolveTemplateStrings()` from `src/lib/workflow/templates.ts` fills `{{...}}` placeholders (lines 42, 55-56, 61-62). Template resolution happens inside the action, not as a separate step before it.
7. `src/repositories/workflow-run-repository.ts` — on success, `markStepSucceeded()` (line 152) writes the output and context snapshot and queues the next step's job, or finishes the run. On a throw, the catch block (lines 163-178) calls either `markStepRetrying()`, which resets **the same job row** to `AVAILABLE` with a later `readyAt`, or `markStepFailed()`.
8. `src/repositories/workflow-job-repository.ts` — `markSucceeded()` (success or skip) or `markDead()` (final failure) finalizes the job row. The retry branch makes no job-repository call, because `markStepRetrying()` already updated the job inside its own transaction.
9. Returns `{ processed: true, jobId, status }`, where `status` is `"skipped" | "succeeded" | "retrying" | "failed"`.

Request: Analyst tries to update a workflow and is rejected
1. `src/app/api/workflows/[workflowId]/route.ts` — `PATCH` receives the update request.
2. `src/lib/http/route-helpers.ts` — `executeRoute()` loads the actor via `getSessionActor()`.
3. `src/lib/auth/permissions.ts` — `assertPermission()` rejects the analyst because `workflow:write` is not in the analyst role matrix.
4. `src/lib/http/route-helpers.ts` — catches the `AppError` and serializes it.
5. Returns `403` with `{ error: { code: "FORBIDDEN", ... } }`.

Ordering detail: the permission check (`route-helpers.ts:38-44`) runs **before** the body is parsed (line 46). An analyst sending an invalid body still gets 403, not a validation error. This is the right order, because it avoids revealing schema details to callers who are not allowed to write.

Request: Scheduler dispatches due cron workflows
1. `src/server/worker/scheduler.ts:15-20` (every 60 s) or `POST /api/internal/scheduler/dispatch` with `x-internal-token` calls `schedulerService.dispatchDueWorkflows()` (`src/services/scheduler-service.ts:15-18`).
2. `src/services/workflow-dispatch-service.ts:87-106` — `dispatchScheduledRuns(now)` loads ACTIVE SCHEDULE workflows with `nextScheduledAt <= now` (`workflow-repository.ts:185-201`).
3. For each workflow, `enqueueRunForWorkflow()` creates the run with `triggerSource: "schedule"` and an empty payload (line 92).
4. `getNextScheduledAt(cronExpression, now)` computes the next tick from `now`, not from the missed tick (line 97). After downtime, a workflow gets **one** catch-up run, not one per missed interval.
5. `workflowRepository.updateStatus()` persists the new `nextScheduledAt` (line 98). It also overwrites `updatedByUserId` with the workflow's existing value, so the field is effectively unchanged.
6. Returns `{ dueWorkflowCount, createdRunCount }`.

## Error mapping (`src/lib/http/route-helpers.ts:48-63`)

| What is thrown | Where it typically comes from | HTTP result |
| --- | --- | --- |
| `AppError(401, "UNAUTHENTICATED")` | `route-helpers.ts:40` when `permission` is set and there is no actor | 401 |
| `AppError(401, "INVALID_CREDENTIALS")` | `auth-service.ts:23,29` | 401 |
| `AppError(401, "INVALID_INTERNAL_TOKEN")` | `internal-token.ts:23` | 401 |
| `AppError(403, "FORBIDDEN")` | `permissions.ts:31` | 403 |
| `AppError(403, "WORKFLOW_SCOPE_VIOLATION")` | `permissions.ts:46-50` | 403 |
| `AppError(404, "WORKFLOW_NOT_FOUND" / "WORKFLOW_RUN_NOT_FOUND")` | definition, dispatch, and monitoring services | 404 |
| `AppError(409, "INVALID_WORKFLOW_TRANSITION" / "WORKFLOW_NOT_ACTIVE")` | `status-machine.ts:29`, `workflow-dispatch-service.ts:51` | 409 |
| `AppError(422, "WORKFLOW_STEP_REQUIRED" / "EVENT_NAME_REQUIRED" / "CRON_EXPRESSION_REQUIRED" / "INVALID_CRON_EXPRESSION")` | `status-machine.ts:41-53`, `schedule.ts:19` | 422 |
| `ZodError` from `bodySchema.parse()` | `route-helpers.ts:46` | **500** (should be 400) |
| `SyntaxError` from `request.json()` on a non-JSON body | `route-helpers.ts:46` | **500** (should be 400) |
| Plain `Error("INTERNAL_WORKER_TOKEN is required.")` | `internal-token.ts:18` | 500 (fails closed) |
| Prisma errors (FK violation, unique violation, connection) | repositories | 500 |

The 500 body never includes a stack trace (lines 54-62). The error is not logged either, because the catch block has no `console.error`, so the server leaves no trace of why a 500 happened.

## Debugging scenarios

**1. Every workflow page shows "An unexpected server error occurred."**
- Where to look: the dev-server console for a module-evaluation error in `src/lib/validation/workflow-schemas.ts`.
- Cause: `z.nullish()` at lines 97 and 102 is not a Zod 3 function. Importing the module throws `TypeError: z.nullish is not a function`, which takes down every route that imports a schema from it.
- Fix: replace with `z.null().optional()` or `z.string().nullish()`.

**2. Saving a valid-looking workflow returns 500, not a field error.**
- Where to look: `route-helpers.ts:46` and the catch at lines 48-63. Add a temporary `console.error(error)` there.
- Cause: a `ZodError`, for example a step `name` of one character, which fails `min(2)` at `workflow-schemas.ts:69`, or a mismatch between `actionType` and `config.type` (lines 76-85).
- Fix: map `ZodError` to 400 with details.

**3. Editing an existing workflow returns 500, but creating a new one works.**
- Where to look: Postgres logs for a foreign-key violation during `DELETE FROM "WorkflowStep"`.
- Cause: `updateWorkflow()` deletes steps that `WorkflowStepRun` rows still reference with `onDelete: Restrict` (`workflow-repository.ts:136`, `schema.prisma:160`).
- Fix: version or diff the steps instead of replacing them. See `docs/architecture/domain-model.md`.

**4. A run stays RUNNING forever and its job row says LEASED.**
- Where to look: `SELECT status, "leasedUntil", "leaseToken" FROM "WorkflowJob" WHERE "runId" = ...`.
- Cause: the worker died (or the process was restarted) after leasing. The lease query only takes `AVAILABLE` rows (`workflow-job-repository.ts:24`), and nothing turns an expired `LEASED` row back into `AVAILABLE`.
- Fix: add `OR (status = 'LEASED' AND "leasedUntil" < NOW())` to the candidate query. Then check `leaseToken` when completing, so a slow worker cannot finish a job that was re-leased to someone else.

**5. A step that calls a slow endpoint holds a worker indefinitely.**
- Where to look: `workflow-execution-service.ts:63-67`.
- Cause: `timeoutSeconds` is never applied, and `fetch()` has no `AbortSignal`.
- Fix: `signal: AbortSignal.timeout((step.timeoutSeconds ?? 30) * 1000)`.

**6. Every scheduled workflow fails to publish with "Invalid cron expression."**
- Where to look: `src/lib/workflow/schedule.ts:16` and the installed `cron-parser` version.
- Likely cause (unverified, because no copy of the package exists on this machine): `package.json` allows `cron-parser` ^5.2.0, but the code uses the older `parseExpression()` API. If that function is missing, the `TypeError` is swallowed by the catch at line 18 and re-thrown as `INVALID_CRON_EXPRESSION`.
- Fix: confirm with `node -e "console.log(Object.keys(require('cron-parser')))"` after installing, then either pin v4 or switch to the v5 API.

**7. The same scheduled workflow ran twice for one tick.**
- Where to look: `WorkflowRun` rows with `triggerSource = 'schedule'` and near-identical `createdAt`.
- Cause: the scheduler loop and the internal dispatch route ran concurrently. `dispatchScheduledRuns()` reads, enqueues, and then advances `nextScheduledAt`, with no lock between the steps.
- Fix: claim due workflows with a conditional update, `UPDATE ... SET "nextScheduledAt" = $next WHERE id = $id AND "nextScheduledAt" = $seen`, and enqueue only if one row changed.
