# Load Bearing Files

## src/lib/http/route-helpers.ts
- What it does: Central route wrapper for auth, permissions, validation, and error mapping.
- What calls it: Most files in `src/app/api/**`.
- What it calls: `src/lib/auth/session.ts`, `src/lib/auth/permissions.ts`, `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Routes could skip auth, skip permission checks, or return inconsistent error codes.
- What a junior engineer would likely miswrite here: Parsing request bodies before auth and returning raw thrown errors.

## src/lib/auth/permissions.ts
- What it does: Defines role capabilities and workflow ownership checks.
- What calls it: `src/lib/http/route-helpers.ts`, `src/services/workflow-definition-service.ts`, `src/services/workflow-dispatch-service.ts`.
- What it calls: `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Analysts could mutate definitions or operators could manage each other's workflows.
- What a junior engineer would likely miswrite here: Treating role checks as enough without ownership checks.

## src/repositories/workflow-repository.ts
- What it does: Persists workflow definitions and applies ownership-aware filters.
- What calls it: `src/services/workflow-definition-service.ts`, `src/services/workflow-dispatch-service.ts`, tests.
- What it calls: `src/lib/db.ts`, `src/lib/utils.ts`.
- What would break or become insecure if this file were wrong: Operator-scoped reads would leak other operators' definitions.
- What a junior engineer would likely miswrite here: Forgetting the `createdByUserId` filter in detail queries after adding it in list queries.

## src/services/workflow-definition-service.ts
- What it does: Owns definition CRUD and workflow status transitions.
- What calls it: Workflow REST handlers under `src/app/api/workflows/**`.
- What it calls: `src/repositories/workflow-repository.ts`, `src/lib/workflow/status-machine.ts`, `src/lib/auth/permissions.ts`, `src/repositories/workflow-run-repository.ts`.
- What would break or become insecure if this file were wrong: Inactive or invalid workflows could be activated, and ownership checks could be bypassed.
- What a junior engineer would likely miswrite here: Updating status with a generic repository call instead of a transition function.

## src/services/workflow-dispatch-service.ts
- What it does: Converts events, schedules, and manual triggers into queued runs.
- What calls it: `src/app/api/workflows/[workflowId]/trigger/route.ts`, `src/app/api/events/ingest/route.ts`, `src/services/scheduler-service.ts`.
- What it calls: `src/repositories/workflow-repository.ts`, `src/repositories/workflow-run-repository.ts`, `src/lib/workflow/schedule.ts`.
- What would break or become insecure if this file were wrong: Runs might be created for inactive workflows or scheduled workflows might stop advancing.
- What a junior engineer would likely miswrite here: Duplicating run-creation logic in three trigger paths.

## src/repositories/workflow-run-repository.ts
- What it does: Owns transactional updates for runs, step runs, and audit events.
- What calls it: `src/services/workflow-dispatch-service.ts`, `src/services/workflow-execution-service.ts`, `src/services/workflow-monitoring-service.ts`.
- What it calls: `src/lib/db.ts`.
- What would break or become insecure if this file were wrong: Run state could drift from step state, making monitoring unreliable and retries unsafe.
- What a junior engineer would likely miswrite here: Updating the run and step tables in separate requests or transactions.

## src/repositories/workflow-job-repository.ts
- What it does: Leases jobs safely for asynchronous workers.
- What calls it: `src/services/workflow-execution-service.ts`.
- What it calls: `src/lib/db.ts`.
- What would break or become insecure if this file were wrong: Multiple workers could execute the same step or jobs could get stuck leased forever.
- What a junior engineer would likely miswrite here: Using a non-locking query to acquire jobs.

## src/services/workflow-execution-service.ts
- What it does: Executes step actions, evaluates conditions, applies retries, and emits audit events.
- What calls it: `src/server/worker/worker.ts`, `src/app/api/internal/worker/drain/route.ts`.
- What it calls: `src/repositories/workflow-job-repository.ts`, `src/repositories/workflow-run-repository.ts`, `src/lib/workflow/conditions.ts`, `src/lib/workflow/templates.ts`.
- What would break or become insecure if this file were wrong: Step retries, final run status, and side effects would all become unreliable.
- What a junior engineer would likely miswrite here: Performing long external I/O inside a transaction or forgetting to persist retry state.

## src/components/workflows/workflow-builder.tsx
- What it does: Captures workflow definition input, status transitions, and manual-run testing in one UI surface.
- What calls it: `src/app/workflows/new/page.tsx`, `src/app/workflows/[workflowId]/page.tsx`.
- What it calls: `src/hooks/use-workflow.ts`, `src/lib/http/api-client.ts`.
- What would break or become insecure if this file were wrong: The UI could serialize shapes the backend never accepts, leading to hidden workflow builder drift.
- What a junior engineer would likely miswrite here: Creating a frontend-only step model that no longer matches the Zod schema.

## Two files missing from the list above

### src/lib/validation/workflow-schemas.ts
- What it does: The only gate between user input and executable step config.
- What calls it: `src/app/api/workflows/route.ts`, `src/app/api/workflows/[workflowId]/route.ts`, `.../publish/route.ts`, `.../trigger/route.ts`, `src/app/api/events/ingest/route.ts`, and `src/tests/workflow-schemas.test.ts`. The service and status-machine files import only its *types*, which are erased at compile time.
- What would break if this file were wrong: everything above. Today lines 97 and 102 call `z.nullish()`, which does not exist in Zod 3, so evaluating the module throws (verified against zod 3.25.76 with `node --test`).
- What a junior engineer would likely miswrite here: Using a method name (`.nullish()`) as a top-level factory, and never running the one test that imports the module.

### src/lib/auth/session.ts
- What it does: Turns the `workflow_session` cookie into a `RouteActor`.
- What would break if this file were wrong: every permission decision. The design is sound: an HS256 signature (line 38) plus a DB reload (line 71). Two sharp edges remain: a missing `SESSION_SECRET` is swallowed as "logged out" (catch at line 83), and logout cannot revoke a stolen token (lines 54-57).

## Verified notes per load-bearing file

What the code actually does today, in contrast to the "would break if wrong" notes above. Each note was checked against the source.

| File | Verified note |
| --- | --- |
| `src/lib/http/route-helpers.ts` | Auth and permission run before body parsing (lines 36-46), which is correct. But a `ZodError` or `SyntaxError` from line 46 becomes a 500, because only `AppError` is mapped (lines 49-51), and unexpected errors are not logged anywhere |
| `src/lib/auth/permissions.ts` | The matrix and ownership helpers are correct, and an extracted copy passed `node --test`. `canReadWorkflow()` (lines 54-56) and the `workflow:ops` grant are unused |
| `src/repositories/workflow-repository.ts` | `findById()` applies scope (line 76), and the visibility helper is the only scoping mechanism. `updateWorkflow()` deletes steps (line 136), which collides with `Restrict` on `WorkflowStepRun.step`. `listActiveEventWorkflows()` (lines 170-183) has no scope parameter at all |
| `src/services/workflow-definition-service.ts` | `updateWorkflow()` and `transitionWorkflowStatus()` load with `"all"` and then call `assertCanManageWorkflow()` (lines 76-82, 94-100). An operator therefore gets 403 on another operator's workflow, while `getWorkflow()` returns 404 for the same id. The two disagree about whether the workflow exists |
| `src/services/workflow-dispatch-service.ts` | All three trigger paths do converge on `enqueueRunForWorkflow()` (lines 20-37), as intended. The event path skips ownership (lines 62-85). The schedule path is read-then-write without a claim (lines 87-100) |
| `src/repositories/workflow-run-repository.ts` | Each `mark*` function is its own transaction, and run and step state do move together inside each one. But `drainOnce()` calls `markRunRunning()` and `markStepRunning()` as two separate writes (`workflow-execution-service.ts:135-136`) |
| `src/repositories/workflow-job-repository.ts` | The lease is a single atomic `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, so concurrent workers cannot double-claim. However, "jobs could get stuck leased forever" is the **current** behavior, not a hypothetical: `leasedUntil` is never read |
| `src/services/workflow-execution-service.ts` | Retries terminate after `maxRetries + 1` executions (simulated with `node --test`). Not enforced: `timeoutSeconds`. Missing: a `default` branch in `executeAction()` (line 40) |
| `src/components/workflows/workflow-builder.tsx` | The payload (lines 108-123) does mirror the schema field for field, but changing the `actionType` dropdown does not rewrite `config.type` inside `configText`. Users can easily create the mismatch that `superRefine` rejects, and because of Finding B in `docs/architecture/auth-and-permissions.md` they see a generic 500 message |

## Exercises

1. **Goal:** For each file in this doc, write the one-line "blast radius" if its main function returned the wrong value. **Check:** your route-helpers answer mentions all 13 route files, and your job-repository answer distinguishes double-execution (prevented today) from stuck jobs (possible today).
2. **Goal:** Make the 404/403 behavior consistent for operators touching another operator's workflow. **Check:** GET, PATCH, publish, and trigger on a foreign workflow all return the same status code.
