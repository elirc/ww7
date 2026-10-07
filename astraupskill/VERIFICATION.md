# Verification

The changed production file is [src/services/workflow-definition-service.ts](../src/services/workflow-definition-service.ts), with exact original bytes at [src-services-workflow-definition-service.ts.before](snapshots/src-services-workflow-definition-service.ts.before). Runtime coverage is [runtime-workflow-same-status.test.mjs](../tests/runtime-workflow-same-status.test.mjs), using [load-typescript.mjs](../tests/helpers/load-typescript.mjs). The run record is [evidence/results.json](evidence/results.json). The TAP log it names (`crud-b07-astra-runtime.log`) is not committed to this repo.

Executed command:

```text
node --experimental-vm-modules --test tests/runtime-workflow-same-status.test.mjs
```

Result (from `evidence/results.json`): exit code 0, 6 tests passed, 0 failed. The six tests, in file order:

1. Equal-status requests for all four statuses return the loaded record and record only the `findById` call.
2. A foreign operator gets 403 `WORKFLOW_SCOPE_VIOLATION`, and a missing workflow gets 404. Both stop after the lookup.
3. ACTIVE to PAUSED calls `updateStatus('wf-1','u-1','PAUSED',null)` and writes audit metadata `{previousStatus:'ACTIVE', nextStatus:'PAUSED'}`.
4. ACTIVE to DRAFT fails with 409 `INVALID_WORKFLOW_TRANSITION` before persistence.
5. DRAFT to ACTIVE with no steps fails with 422 `WORKFLOW_STEP_REQUIRED`.
6. An injected update error prevents the audit. An injected audit error follows an attempted update.

The VM harness executes actual service and status-machine source with explicit dependency contracts. It does not run route schemas, Prisma, schedule parsing, or concurrent database writers. The repository’s update predicate remains outside this change; no optimistic concurrency claim is made. Reviewers should use the source snapshot, TAP evidence, and handoff limits together.

Experimental VM warnings are tooling output and do not change pass status. Diffing the snapshot against the current file shows the guard is the only change (four added lines at 103-106).

The expanded suite checks all four equal statuses, foreign-operator refusal and missing records, exact PAUSED update/audit payloads, invalid edges, activation-readiness failure and injected update/audit errors. Each case owns its fixture. Same ACTIVE requests deliberately do not repair an invalid existing definition or recompute scheduling. Coarse route permissions are outside the service ownership check tested here. Update and audit are separate calls without an enclosing service transaction; an audit failure follows an attempted status write.

## Astra execution evidence

The focused production-source suite executed 6 tests: all passed, zero failed and zero skipped. The [exact command, exit code and limits](evidence/results.json) are committed. The raw log and earlier check records stayed in the original workspace and are not part of this repo.
