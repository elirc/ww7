# Codebase map

A workflow status request enters the API handlers under [src/app/api/workflows](../src/app/api/workflows) and reaches [workflow-definition-service.ts](../src/services/workflow-definition-service.ts). `transitionWorkflowStatus` loads the workflow through [workflow-repository.ts](../src/repositories/workflow-repository.ts), applies `assertCanManageWorkflow`, then calls [status-machine.ts](../src/lib/workflow/status-machine.ts). The status machine allows equal statuses and checks the allowed graph for different statuses.

The corrected service now branches after that guard. Equal status returns the already-loaded workflow. A different status may build definition input, validate activation readiness, calculate scheduling, call repository `updateStatus`, and append an audit event through [workflow-run-repository.ts](../src/repositories/workflow-run-repository.ts).

The runtime test [runtime-workflow-same-status.test.mjs](../tests/runtime-workflow-same-status.test.mjs) stubs dependencies while loading real service and status-machine source. Trace table:

| layer | same status | different valid status |
|---|---|---|
| ownership | pass | pass |
| transition guard | pass | pass |
| repository update | skipped | once |
| audit | skipped | once |
| response | loaded workflow | updated workflow |

The test does not run a real Prisma transaction, route parser, or scheduler. That makes its side-effect assertions narrow and reviewable.
