# Practice

Each exercise is a prediction you check against real source: `src/services/workflow-definition-service.ts:93-133`, `src/lib/workflow/status-machine.ts:15-35`, and `tests/runtime-workflow-same-status.test.mjs`.

1. **Goal:** An operator requests ACTIVE on a workflow they own that is already ACTIVE. Predict the return value, repository updates, audit events, and scheduling calls. **Check:** the first test in `runtime-workflow-same-status.test.mjs` asserts the recorded calls equal `[['find','wf-1','all']]`. That means the loaded workflow is returned, with zero updates, zero audits, and no `getNextScheduledAt` call.

2. **Goal:** A different non-admin operator requests the same ACTIVE status. Decide whether the no-op branch returns. **Check:** it does not. `assertCanManageWorkflow` runs at line 100, before the equality check at line 103, and throws 403 `WORKFLOW_SCOPE_VIOLATION` (`src/lib/auth/permissions.ts:45-51`). The second runtime test asserts that refusal.

3. **Goal:** Request ACTIVE from PAUSED. Name the extra policy that runs. **Check:** PAUSED to ACTIVE is allowed (`status-machine.ts:18`). Definition input is rebuilt (line 107), then `assertReadyForActivation` and `getActivationTimestamp` run (lines 113-116) before `updateStatus`. A workflow with no steps fails with 422 `WORKFLOW_STEP_REQUIRED` (`status-machine.ts:41`).

4. **Goal:** Request DRAFT from ACTIVE. **Check:** `allowedTransitions.ACTIVE` is `["PAUSED", "ARCHIVED"]` (`status-machine.ts:17`), so the request throws 409 `INVALID_WORKFLOW_TRANSITION`. The fourth runtime test asserts that only the `findById` call was recorded.

5. **Goal:** Two callers read ACTIVE and request PAUSED and ARCHIVED concurrently. Decide whether the no-op fix serializes them, and propose a fix. **Check:** it does not. `updateStatus` filters on `id` only (`src/repositories/workflow-repository.ts:159-168`), so both writes succeed and the last one wins. A sound proposal adds the old status (or a version column) to the `where` clause, for example through `updateMany`, and maps a count of zero to a 409 conflict. Keep that proposal separate from this completed idempotency change.
