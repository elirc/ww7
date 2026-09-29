# Request Lifecycle

Request: Create a workflow definition
1. `src/app/api/workflows/route.ts` — `POST` receives JSON and calls `executeRoute()` with `workflowDefinitionSchema`.
2. `src/lib/http/route-helpers.ts` — `executeRoute()` verifies the session with `getSessionActor()` and checks `workflow:write` permission through `assertPermission()`.
3. `src/lib/validation/workflow-schemas.ts` — `workflowDefinitionSchema.parse()` validates nested trigger and step/action config shape.
4. `src/services/workflow-definition-service.ts` — `createWorkflow()` owns the creation rule and keeps new workflows in draft.
5. `src/repositories/workflow-repository.ts` — `createWorkflow()` inserts the workflow and nested steps.
6. Returns `201` with the created workflow definition.

Request: Manually trigger an active workflow
1. `src/app/api/workflows/[workflowId]/trigger/route.ts` — `POST` validates the manual payload and calls the dispatch service.
2. `src/lib/http/route-helpers.ts` — `executeRoute()` authenticates the actor and checks `workflow:execute`.
3. `src/lib/validation/workflow-schemas.ts` — `manualRunSchema.parse()` validates the trigger payload shape.
4. `src/services/workflow-dispatch-service.ts` — `triggerWorkflowManually()` loads the workflow, checks ownership with `assertCanManageWorkflow()`, rejects inactive workflows, and builds a run.
5. `src/repositories/workflow-repository.ts` — `findById()` loads the scoped workflow definition.
6. `src/repositories/workflow-run-repository.ts` — `createRunForWorkflow()` creates the run, step runs, first job, and audit event in one transaction.
7. Returns `201` with the queued run.

Request: Worker executes a queued step
1. `src/server/worker/worker.ts` — the poll loop calls `workflowExecutionService.drainOnce()`.
2. `src/services/workflow-execution-service.ts` — `drainOnce()` asks for a leased job.
3. `src/repositories/workflow-job-repository.ts` — `leaseNextAvailableJob()` acquires one row using `FOR UPDATE SKIP LOCKED` and loads the run/step graph.
4. `src/lib/workflow/conditions.ts` — `evaluateConditionGroup()` decides whether the step should run.
5. `src/lib/workflow/templates.ts` — `resolveTemplateStrings()` fills template placeholders inside action config.
6. `src/services/workflow-execution-service.ts` — `executeAction()` runs the HTTP request, context update, or audit event branch.
7. `src/repositories/workflow-run-repository.ts` — `markStepSucceeded()` or `markStepRetrying()` or `markStepFailed()` persists the outcome and queues the next step if needed.
8. `src/repositories/workflow-job-repository.ts` — `markSucceeded()` or `markDead()` finalizes the job row.
9. Returns worker result object with success, retry, or failure state.

Request: Analyst tries to update a workflow and is rejected
1. `src/app/api/workflows/[workflowId]/route.ts` — `PATCH` receives the update request.
2. `src/lib/http/route-helpers.ts` — `executeRoute()` loads the actor via `getSessionActor()`.
3. `src/lib/auth/permissions.ts` — `assertPermission()` rejects the analyst because `workflow:write` is not in the analyst role matrix.
4. `src/lib/http/route-helpers.ts` — catches the `AppError` and serializes it.
5. Returns `403` with `{ error: { code: "FORBIDDEN", ... } }`.
