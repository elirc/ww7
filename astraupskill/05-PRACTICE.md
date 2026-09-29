# Practice

Exercise one: an operator requests ACTIVE on an already ACTIVE workflow. Predict return value, repository updates, audit events, and scheduling calls. Answer: loaded workflow, zero update, zero audit, and no scheduling calculation.

Exercise two: a different non-admin operator requests the same ACTIVE status. Should the no-op branch return? No. Ownership must reject first. The equality optimization follows `assertCanManageWorkflow`, so it cannot erase authorization policy.

Exercise three: request ACTIVE from PAUSED. Which extra policy runs? The transition is allowed, then definition input is reconstructed and `assertReadyForActivation` runs before scheduling and persistence. Supply a workflow with no steps to predict a readiness error.

Exercise four: request DRAFT from ACTIVE. The status machine rejects because the graph allows PAUSED or ARCHIVED, not DRAFT. Repository and audit should remain untouched.

Exercise five: two workers read ACTIVE and request PAUSED and ARCHIVED concurrently. Does the no-op fix serialize them? No. The repository update lacks an old-status predicate. Propose a conditional update or version field, and specify how count zero would map to a conflict. Keep that proposal separate from this completed idempotency change.
