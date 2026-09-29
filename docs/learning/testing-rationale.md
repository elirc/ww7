# Testing Rationale

## `src/tests/auth-permissions.test.ts` — rejects an analyst trying to modify a workflow
This matters because RBAC failures are high-impact and easy to miss when a UI hides buttons but the backend forgets to block the route. This test catches the production bug class where a read-only user can still call a protected endpoint directly.
A fuller production suite would also hit a real route, assert the serialized `403` body from `src/lib/http/route-helpers.ts`, and cover admin/operator happy paths.

## `src/tests/workflow-schemas.test.ts` — rejects a step when `actionType` and `config.type` disagree
This matters because workflow builders often drift: the form says one thing, the serialized config says another, and the worker later executes the wrong branch. This test guards the Zod boundary in `src/lib/validation/workflow-schemas.ts` so bad definitions fail at write time.
A fuller production suite would cover every action variant, malformed condition payloads, and regression cases from the UI serializer in `src/components/workflows/workflow-builder.tsx`.

## `src/tests/workflow-status-machine.test.ts` — rejects a transition from archived back to active
This matters because status changes are business rules, not cosmetic flags. If archived workflows can silently reactivate, operators lose confidence in the lifecycle guarantees.
A fuller production suite would exercise `src/services/workflow-definition-service.ts` end-to-end, including activation preconditions for missing steps and missing trigger data.

## `src/tests/workflow-visibility.test.ts` — scopes operator queries to workflows they created
This matters because data-isolation bugs tend to appear at the repository boundary, where one missing filter leaks another user's records. The test anchors directly to `buildWorkflowVisibilityWhere()` in `src/repositories/workflow-repository.ts`.
A fuller production suite would use a real database and verify that operator A cannot fetch operator B's workflow detail or runs through the route layer.
