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
5. `src/services/workflow-definition-service.ts` — `transitionWorkflowStatus()` checks ownership and transition validity.
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
3. `src/services/workflow-execution-service.ts` — `executeAction()` throws, for example after a failed HTTP request.
4. `src/services/workflow-execution-service.ts` — retry branch computes `attempts` and `readyAt`.
5. `src/repositories/workflow-run-repository.ts` — `markStepRetrying()` marks the step run as retrying and resets the job row to `AVAILABLE` for a future lease.
6. Returns worker retry result.

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
