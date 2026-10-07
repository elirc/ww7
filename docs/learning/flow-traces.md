# Flow Traces

## Flow: Create Workflow Definition
1. `src/components/workflows/workflow-builder.tsx` — save button calls `saveMutation.mutate()`.
2. `src/lib/http/api-client.ts` — `apiRequest()` sends `POST /api/workflows`.
3. `src/app/api/workflows/route.ts` — `POST()` route handler.
4. `src/lib/http/route-helpers.ts` — `executeRoute()` authenticates, checks `workflow:write`, and parses `workflowDefinitionSchema`.
5. `src/lib/validation/workflow-schemas.ts` — `workflowDefinitionSchema` validates the trigger and step payload.
6. `src/services/workflow-definition-service.ts` — `createWorkflow()` owns creation behavior.
7. `src/repositories/workflow-repository.ts` — `createWorkflow()` inserts the definition and nested steps.
8. Returns created workflow.

## Flow: Reject Analyst Write Attempt
1. `src/components/workflows/workflow-builder.tsx` — analyst clicks save on an existing workflow.
2. `src/lib/http/api-client.ts` — `apiRequest()` sends `PATCH /api/workflows/[workflowId]`.
3. `src/app/api/workflows/[workflowId]/route.ts` — `PATCH()` route handler.
4. `src/lib/http/route-helpers.ts` — `executeRoute()` calls `assertPermission()`.
5. `src/lib/auth/permissions.ts` — `assertPermission()` throws `AppError("FORBIDDEN")`.
6. `src/lib/http/route-helpers.ts` — catches and serializes the error.
7. Returns `403`.

## Flow: Publish Workflow
1. `src/components/workflows/workflow-builder.tsx` — status action calls `statusMutation.mutate(status)`.
2. `src/lib/http/api-client.ts` — `apiRequest()` sends `POST /api/workflows/[workflowId]/publish`.
3. `src/app/api/workflows/[workflowId]/publish/route.ts` — `POST()` route handler.
4. `src/lib/http/route-helpers.ts` — `executeRoute()` authenticates and validates the requested next status.
5. `src/services/workflow-definition-service.ts` — `transitionWorkflowStatus()` checks ownership and transition validity. If the requested status equals the current one, it returns the loaded workflow at lines 103-105, before steps 6-9 and before any write or audit event.
6. `src/lib/workflow/status-machine.ts` — `assertValidWorkflowTransition()` and `assertReadyForActivation()` enforce the state machine.
7. `src/lib/workflow/schedule.ts` — `getNextScheduledAt()` computes the next cron timestamp for scheduled workflows.
8. `src/repositories/workflow-repository.ts` — `updateStatus()` persists the new status.
9. `src/repositories/workflow-run-repository.ts` — `createAuditEvent()` records the status change.
10. Returns updated workflow.

## Flow: Event Trigger Dispatch
1. External caller posts to `src/app/api/events/ingest/route.ts`.
2. `src/lib/http/route-helpers.ts` — `executeRoute()` authenticates and validates `eventIngestionSchema`.
3. `src/services/workflow-dispatch-service.ts` — `ingestEvent()` finds matching active workflows.
4. `src/repositories/workflow-repository.ts` — `listActiveEventWorkflows()` loads active definitions for the event.
5. `src/services/workflow-dispatch-service.ts` — `enqueueRunForWorkflow()` prepares each run.
6. `src/repositories/workflow-run-repository.ts` — `createRunForWorkflow()` creates the run, step runs, first job, and audit event.
7. Returns accepted dispatch summary.

## Flow: Background Step Execution Happy Path
1. `src/server/worker/worker.ts` — `main()` loop calls `workflowExecutionService.drainOnce(workerId)`.
2. `src/services/workflow-execution-service.ts` — `drainOnce()` requests one leased job.
3. `src/repositories/workflow-job-repository.ts` — `leaseNextAvailableJob()` atomically acquires one job.
4. `src/lib/workflow/conditions.ts` — `evaluateConditionGroup()` checks whether the step should run.
5. `src/repositories/workflow-run-repository.ts` — `markRunRunning()` and `markStepRunning()` persist in-flight state.
6. `src/services/workflow-execution-service.ts` — `executeAction()` runs the action branch.
7. `src/lib/workflow/templates.ts` — `resolveTemplateStrings()` resolves templates inside action payloads.
8. `src/repositories/workflow-run-repository.ts` — `markStepSucceeded()` writes output, updates context, and queues the next step if one exists.
9. `src/repositories/workflow-job-repository.ts` — `markSucceeded()` finalizes the consumed job.
10. Returns worker success result.

## Flow: Background Step Retry Path
1. `src/server/worker/worker.ts` — poll loop calls `drainOnce()`.
2. `src/repositories/workflow-job-repository.ts` — `leaseNextAvailableJob()` returns a job.
3. `src/services/workflow-execution-service.ts:124-136` — the condition passes, and `markRunRunning()` and `markStepRunning(stepRunId, job.attempts + 1, payload)` record the attempt.
4. `src/services/workflow-execution-service.ts:139` — `executeAction()` throws. For example, a non-2xx HTTP response throws `HTTP <status>: <body>` at lines 70-72. Any throw anywhere in lines 124-161 lands in the same catch, including a Prisma error from `markStepSucceeded()`.
5. `src/services/workflow-execution-service.ts:164-169` — the retry branch computes `attempts = job.attempts + 1` and, while `attempts < job.maxAttempts`, `readyAt = now + attempts * 15 s`. The backoff is linear: 15 s, 30 s, 45 s, and so on.
6. `src/repositories/workflow-run-repository.ts:239-271` — `markStepRetrying()` sets the step run to `RETRYING`, resets **the same** job row (`where: { stepRunId }`, line 252) to `AVAILABLE` with the new `readyAt` and `attempts`, and keeps the run `RUNNING`.
7. Returns `{ processed: true, status: "retrying" }`. The worker loops immediately because it processed something, but the job cannot be leased again until `readyAt <= NOW()`.

Retry arithmetic: `maxAttempts = maxRetries + 1`, set at `workflow-run-repository.ts:70` for the first step and at `workflow-execution-service.ts:129,158` for later steps. A step with `maxRetries: 3` executes at most 4 times, with delays of 15/30/45 s, and then fails. The loop always terminates. This was checked by running an extracted copy of the decision with `node --test` for `maxRetries` 0, 3, and 10 (see `testing-rationale.md`).

## Flow: Background Step Terminal Failure
1. Same as the retry path through step 4, but now `attempts >= job.maxAttempts`.
2. `src/repositories/workflow-run-repository.ts:273-293` — `markStepFailed()` sets the step run to FAILED and the **run** to FAILED in one transaction. Later step runs stay PENDING forever. That is intended: there is no "continue on error" option.
3. `src/repositories/workflow-job-repository.ts:80-90` — `markDead()` stores `lastError` and sets the job to DEAD.
4. Returns `{ processed: true, status: "failed" }`.

## Flow: Conditional Skip
1. `src/services/workflow-execution-service.ts:124` — `evaluateConditionGroup()` returns false. Condition paths must start with `payload.` or `context.`, because the evaluator wraps both sources under those keys (`src/lib/workflow/conditions.ts:60-63`). A rule on `orderTotal` without a prefix always reads `null`.
2. `src/repositories/workflow-run-repository.ts:160-189` — `markStepSkipped()` sets SKIPPED and `conditionMatched: false`. It then either creates the next step's job or, if no next step exists, marks the run SUCCEEDED.
3. `workflowJobRepository.markSucceeded(job.id)` (line 131). A skipped step's job is recorded as SUCCEEDED, not as a separate skipped status.
4. Note: `markRunRunning()` is not called on this path. A run whose first step is skipped goes straight from QUEUED to the next step (or to SUCCEEDED) without `startedAt` being set.

## Flow: Seeded workflow fails (verified by reading)
This is what happens today if you seed, log in as the operator, and trigger `high-value-order-review` with `{ "orderId": "ord_1", "orderTotal": 8300 }`:
1. Step 1, "Flag high-value payload": the condition `payload.orderTotal gt 5000` matches.
2. `executeAction()` switches on `config.type` (`workflow-execution-service.ts:40`). The seeded config at `prisma/seed.ts:92-95` is `{ path, value }` with **no `type`**, so no case matches. The switch has no `default`, and the function returns `undefined`.
3. Line 141 reads `result.auditEvent` on `undefined` and throws a `TypeError`. The catch treats it like any action failure.
4. Step 1 has `maxRetries: 1` (`seed.ts:100`), so `maxAttempts` is 2. Attempt 1 retries after 15 s, and attempt 2 fails the run.
5. Step 2 (`seed.ts:107-117`, also missing `type`) never runs. With `orderTotal <= 5000`, step 1 is skipped instead, and step 2 fails the same way after 4 attempts (`maxRetries: 3`).
- Fix: add `type: "UPDATE_RUN_CONTEXT"` and `type: "HTTP_REQUEST"` to the seeded configs, and add a `default:` branch that throws a descriptive error. Even with the fix, step 2 posts to `https://example.internal/api/cases` (`seed.ts:109`), which will not resolve on a dev machine, so expect a retry-then-fail on step 2 unless you point it somewhere real.

## Flow: Internal Drain Over HTTP
1. `POST /api/internal/worker/drain` with header `x-internal-token`.
2. `src/app/api/internal/worker/drain/route.ts:7` — `executeRoute(request, {})` resolves the session (unused) and parses no body.
3. Line 8 — `assertInternalToken()` returns 401 for a wrong or missing header and 500 if the env var is unset.
4. Line 9 — `workflowExecutionService.drainOnce("api-drain")` processes **at most one** job. The lease token will be prefixed with `api-drain:`.
5. Returns `{ data: { processed, jobId?, status? } }`.

## Flow: Dashboard Load
1. `src/app/page.tsx` — renders `WorkflowDashboard`.
2. `src/components/workflows/workflow-dashboard.tsx` — `useDashboard()` fires.
3. `src/hooks/use-dashboard.ts` — `apiRequest()` calls `GET /api/dashboard`.
4. `src/app/api/dashboard/route.ts` — `GET()` route handler.
5. `src/lib/http/route-helpers.ts` — `executeRoute()` authenticates and checks `workflow:read`.
6. `src/services/workflow-monitoring-service.ts` — `getDashboard()` assembles list, recent runs, and stats.
7. `src/repositories/workflow-repository.ts` — `listWorkflows()` loads visible workflow definitions.
8. `src/repositories/workflow-run-repository.ts` — `listRunsForWorkflow()` loads recent runs for the dashboard summary.
9. Returns dashboard payload.

Dashboard caveat (`src/services/workflow-monitoring-service.ts:22-31`): "recent runs" are pulled only from the **first four** workflows in `updatedAt desc` order (`workflows.slice(0, 4)`, line 24), then cut to 8. `listRunsForWorkflow()` has no `take`, so each of those four queries loads the workflow's entire run history. `failedRuns` (line 40) counts failures among those at most 8 runs, not across all runs. A failing workflow that is fifth in the list never appears in the stat.

## Line-number index for the flows above

| Function | Location |
| --- | --- |
| `saveMutation` / `statusMutation` / `triggerMutation` | `src/components/workflows/workflow-builder.tsx:103`, `:149`, `:161` |
| `apiRequest()` | `src/lib/http/api-client.ts:1-17` |
| `executeRoute()` | `src/lib/http/route-helpers.ts:30-64` |
| `createWorkflow()` (service / repo) | `src/services/workflow-definition-service.ts:71-73` / `src/repositories/workflow-repository.ts:111-131` |
| `transitionWorkflowStatus()` | `src/services/workflow-definition-service.ts:93-133` (same-status early return at 103-105) |
| `ingestEvent()` / `enqueueRunForWorkflow()` | `src/services/workflow-dispatch-service.ts:62-85` / `:20-37` |
| `createRunForWorkflow()` | `src/repositories/workflow-run-repository.ts:29-91` |
| `leaseNextAvailableJob()` | `src/repositories/workflow-job-repository.ts:16-67` |
| `drainOnce()` / `executeAction()` | `src/services/workflow-execution-service.ts:99-179` / `:39-88` |
| `getDashboard()` | `src/services/workflow-monitoring-service.ts:19-43` |

## Exercises

1. **Goal:** Trace a two-step run by hand. Using the line index, write down every row written (table, column, value) from trigger to SUCCEEDED for a run whose first step is skipped. **Check:** your list includes exactly two `WorkflowJob` rows, one `workflow.run.created` audit event, and no `markRunRunning()` write.
2. **Goal:** Fix the seed (add the `type` discriminators) and re-trace the seeded flow. **Check:** step 1 sets `context.review.required = true`, and step 2's template `{{payload.orderId}}` resolves to the posted order id.
3. **Goal:** Make the dashboard's `failedRuns` honest. **Check:** with five workflows, where only the oldest has a FAILED run, the stat shows 1.
