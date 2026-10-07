# Worked change

The original [snapshot](snapshots/src-services-workflow-definition-service.ts.before) validated the transition and immediately built definition input, calculated activation scheduling, called `updateStatus`, and created an audit event. Because [status-machine.ts](../src/lib/workflow/status-machine.ts) returns for equal states, ACTIVE to ACTIVE reached persistence despite representing no change.

The current [workflow-definition-service.ts](../src/services/workflow-definition-service.ts) inserts this guard (lines 100-105):

```ts
assertCanManageWorkflow(actor, workflow);
assertValidWorkflowTransition(workflow.status, nextStatus);

if (workflow.status === nextStatus) {
  return workflow;
}
```

The equality check remains after ownership and lifecycle checks. That prevents an unauthorized caller from using the no-op path to bypass management policy. It also avoids activation readiness work, scheduling calculation, repository mutation, and audit creation for a request that changes nothing.

The runtime [test](../tests/runtime-workflow-same-status.test.mjs) observes actual service calls. The same-status case, run for each of DRAFT, ACTIVE, PAUSED and ARCHIVED, returns the loaded object and records only the `findById` call. The PAUSED case returns an updated status with one update and one audit. The invalid DRAFT target rejects while its independent fixture records no update or audit. This is a narrow, reversible service correction that preserves real transitions and error policy.
