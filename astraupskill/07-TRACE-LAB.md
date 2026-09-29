# Trace lab

Trace same-status ACTIVE request. The actor enters `transitionWorkflowStatus`; `findById` returns workflow wf-1. `assertCanManageWorkflow` passes. `assertValidWorkflowTransition(ACTIVE, ACTIVE)` returns. Equality branch returns the same loaded object. Neither `updateStatus` nor `createAuditEvent` executes.

Trace ACTIVE to PAUSED. The first three steps are identical. Equality is false. Definition input is mapped, activation readiness is skipped because target is PAUSED, `updateStatus` receives workflow ID, actor ID, PAUSED, and null schedule, then audit receives previous ACTIVE and next PAUSED. Updated result returns.

| checkpoint | same | paused | invalid draft |
|---|---|---|---|
| load | yes | yes | yes |
| auth | pass | pass | pass |
| transition | pass | pass | throw |
| update | no | once | no |
| audit | no | once | no |

For an authorization failure, stop before transition reasoning: permission and ownership are the first boundary. For a concurrent writer, mark the repository call as the unresolved race point. The current test uses deterministic doubles and does not model that external interleaving.
