# Testing and debugging

Run `node --experimental-vm-modules --test tests/runtime-workflow-same-status.test.mjs`. [load-typescript.mjs](../tests/helpers/load-typescript.mjs) loads actual service and status-machine code; explicit doubles provide repository, schedule, audit and generated Prisma enum contracts; ownership, status/readiness and error modules are real source. The captured TAP is [671a350f0386-runtime-workflow-same-status.tap.txt](evidence/crud-b07-astra-runtime.log).

Start with counters. Same-status should leave update and audit at zero. If update runs, the equality branch is missing or placed after persistence. If audit runs without update, the branch ordering is wrong. For ACTIVE to PAUSED, expect one update and one audit. For ACTIVE to DRAFT, expect the status-machine error and no additional calls.

A useful debugger checkpoint is `assertCanManageWorkflow`. The no-op branch must follow it, because idempotency is not an authorization bypass. Another is `toDefinitionInput`: same-status should return before reconstructing readiness input. The test’s stubbed workflow has no steps, which is intentional; PAUSED does not require activation readiness. The new DRAFT-to-ACTIVE fixture verifies the real WORKFLOW_STEP_REQUIRED error for an empty definition.

The harness does not execute route validation, Prisma, scheduling libraries, or concurrent requests. It verifies service policy and side-effect sequencing against production source.
