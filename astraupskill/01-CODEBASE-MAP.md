# Codebase map

A workflow status request enters `POST` in [publish/route.ts](../src/app/api/workflows/[workflowId]/publish/route.ts) (line 10 runs `executeRoute` with the `workflow:publish` permission and `workflowStatusTransitionSchema`) and reaches [workflow-definition-service.ts](../src/services/workflow-definition-service.ts). `transitionWorkflowStatus` (lines 93-133) loads the workflow through [workflow-repository.ts](../src/repositories/workflow-repository.ts), applies `assertCanManageWorkflow` (`src/lib/auth/permissions.ts:40-52`), then calls [status-machine.ts](../src/lib/workflow/status-machine.ts). `assertValidWorkflowTransition` (lines 22-35) returns early for equal statuses and otherwise checks the `allowedTransitions` graph at lines 15-20.

The corrected service now branches after that guard. Equal status returns the already-loaded workflow (lines 103-105). A different status builds definition input (line 107), validates activation readiness and calculates scheduling only for ACTIVE (lines 113-116), calls repository `updateStatus` (line 118; `src/repositories/workflow-repository.ts:159-168`), and appends an audit event (lines 120-130) through [workflow-run-repository.ts](../src/repositories/workflow-run-repository.ts).

The runtime test [runtime-workflow-same-status.test.mjs](../tests/runtime-workflow-same-status.test.mjs) stubs dependencies while loading real service and status-machine source. Trace table:

| layer | same status | different valid status |
|---|---|---|
| ownership | pass | pass |
| transition guard | pass | pass |
| repository update | skipped | once |
| audit | skipped | once |
| response | loaded workflow | updated workflow |

The test does not run a real Prisma transaction, route parser, or scheduler. That makes its side-effect assertions narrow and reviewable.
