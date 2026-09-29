# Workflow status idempotency

This course follows [workflow-definition-service.ts](../src/services/workflow-definition-service.ts), the service that loads a workflow, checks ownership, validates status transitions, persists a new status, and writes an audit event. The status machine permits a same-status request as an idempotent transition. Before this change, the service still called `updateStatus` and emitted `workflow.status.changed` for `ACTIVE → ACTIVE`, producing a misleading operational record.

The bounded fix returns the loaded workflow immediately after transition validation when current and requested statuses match. Different valid moves still persist and audit; invalid moves still fail before persistence. The runtime [runtime-workflow-same-status.test.mjs](../tests/runtime-workflow-same-status.test.mjs) executes actual service source through [load-typescript.mjs](../tests/helpers/load-typescript.mjs) with explicit repository, schedule and audit contracts plus real ownership/error policies. It covers same-status no-write/no-audit, ACTIVE to PAUSED success, and an invalid transition refusal.

This course claims idempotent service behavior and audit accuracy. It does not claim database concurrency protection or live HTTP coverage. The exact prior service is [the snapshot](snapshots/src-services-workflow-definition-service.ts.before). Read the chapters as a trace from permission and state policy to repository side effects.

Six isolated cases now include real ownership refusal, all equal statuses, activation readiness and persistence failures. The change suppresses change-audit noise for equal requests; it does not make the update/audit sequence atomic.
