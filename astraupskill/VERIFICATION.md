# Verification

The changed production file is [src/services/workflow-definition-service.ts](../src/services/workflow-definition-service.ts), with exact original bytes at [src-services-workflow-definition-service.ts.before](snapshots/src-services-workflow-definition-service.ts.before). Runtime coverage is [runtime-workflow-same-status.test.mjs](../tests/runtime-workflow-same-status.test.mjs), using [load-typescript.mjs](../tests/helpers/load-typescript.mjs). Captured output is [671a350f0386-runtime-workflow-same-status.tap.txt](evidence/crud-b07-astra-runtime.log).

Executed command:

```text
node --experimental-vm-modules --test tests/runtime-workflow-same-status.test.mjs
```

Result: 6 tests passed, 0 failed. The first executes an equal ACTIVE request and proves zero repository/audit calls. The second executes ACTIVE to PAUSED and proves one update plus one audit. The third executes an invalid ACTIVE to DRAFT request and proves the its fresh fixture records no side effects.

The VM harness executes actual service and status-machine source with explicit dependency contracts. It does not run route schemas, Prisma, schedule parsing, or concurrent database writers. The repository’s update predicate remains outside this change; no optimistic concurrency claim is made. Reviewers should use the source snapshot, TAP evidence, and handoff limits together.

The numeric result records six executed tests; experimental VM warnings are tooling output and do not change pass status. The exact snapshot confirms the guard is localized.

The expanded suite checks all four equal statuses, foreign-operator refusal and missing records, exact PAUSED update/audit payloads, invalid edges, activation-readiness failure and injected update/audit errors. Each case owns its fixture. Same ACTIVE requests deliberately do not repair an invalid existing definition or recompute scheduling. Coarse route permissions are outside the service ownership check tested here. Update and audit are separate calls without an enclosing service transaction; an audit failure follows an attempted status write.

## Astra execution evidence

The captured focused production-source suite executed 6 tests: all passed, zero failed and zero skipped. Read the [captured output](evidence/crud-b07-astra-runtime.log) and [exact command and limits](evidence/results.json). Earlier check records remain preserved in the workspace.
