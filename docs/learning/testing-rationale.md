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

## `tests/runtime-workflow-same-status.test.mjs`: same-status publish requests write nothing
This file uses `node:test`, not Vitest. `tests/helpers/load-typescript.mjs` loads the real `src/services/workflow-definition-service.ts` and the real status machine, with stubbed repositories, schedule helper, and `@prisma/client` enums. It pins the guard at `workflow-definition-service.ts:103-105`. For each of the four statuses, an equal-status request returns the loaded record, and the only recorded call is `findById`. There is no `updateStatus`, no audit event, and no schedule computation. It also checks that a foreign operator still gets 403 and a missing workflow still gets 404 (ownership runs before the shortcut). A real change (ACTIVE to PAUSED) persists exact arguments and audit metadata. ACTIVE to DRAFT fails with 409 before persistence, and DRAFT to ACTIVE still enforces readiness with 422.
Run it with `node --experimental-vm-modules --test tests/runtime-workflow-same-status.test.mjs` (see `astraupskill/VERIFICATION.md`). Note that `vitest.config.ts` sets no `include`, so Vitest's default glob also matches this `.test.mjs` file when `npm test` runs. Keep that in mind once the Vitest blockers below are fixed.

## Can these four tests run as configured? (assessed by reading; not executed)

No dependencies are installed, so `npm test` (`vitest run --coverage`) was **not** run. Reading the config shows four separate blockers. Fix them in this order:

| Blocker | Evidence | Tests affected |
| --- | --- | --- |
| The `@/` alias is not configured for Vitest | Every test imports `@/...`. `tsconfig.json:21-23` declares `paths`, but `vitest.config.ts` has no `resolve.alias` and no `vite-tsconfig-paths` plugin, and Vite does not read `tsconfig` paths by itself | all 4 |
| The `server-only` import throws outside a React Server Component build | `src/lib/auth/permissions.ts:11`, `src/repositories/workflow-repository.ts:11`, and `src/lib/db.ts:11` import `"server-only"`, whose default entry throws by design. Vitest does not set the `react-server` condition | `auth-permissions`, `workflow-visibility` |
| Generated Prisma client required | `permissions.ts`, `status-machine.ts`, and `workflow-schemas.ts` import enums from `@prisma/client`, which needs `prisma generate` | 3 of 4 |
| `z.nullish()` is not a function | `src/lib/validation/workflow-schemas.ts:97,102` | `workflow-schemas` |

A typical fix is `resolve: { alias: { "@": path.resolve(__dirname, "src") } }`, plus a `vi.mock("server-only", () => ({}))` in a setup file or an alias for `server-only` that points at an empty module.

## What was actually executed

Dependency-free checks were run with Node 22.16 and no installs. Scratch files lived outside the repo and are not committed.

**1. `node --test pure.test.mjs`: 9 tests, 9 passed.** Function bodies were copied verbatim (TypeScript types stripped) from:
- `permissionMatrix`, `assertPermission`, `getWorkflowVisibilityScope`, and `assertCanManageWorkflow` (`src/lib/auth/permissions.ts:16-52`), plus `buildWorkflowVisibilityWhere` (`src/repositories/workflow-repository.ts:17-28`). Results: analysts are blocked from write and execute, operators lack `workflow:ops`, admins hold every permission, and an operator cannot manage another operator's workflow.
- `allowedTransitions` and `assertValidWorkflowTransition` (`src/lib/workflow/status-machine.ts:15-35`). All 16 pairs were enumerated. Exactly 10 are allowed: the 6 listed transitions plus 4 same-status no-ops. At the service layer those 4 no-ops now short-circuit before any write (`workflow-definition-service.ts:103-105`).
- `readPath`, `compare`, and `evaluateConditionGroup` (`src/lib/workflow/conditions.ts`). Confirmed: a missing path reads as `null`, `gt -1` matches a missing field, a path without a prefix never matches, and a `null` condition means "run".
- `lookupToken` and `resolveTemplateStrings` (`src/lib/workflow/templates.ts`). Confirmed: a missing token becomes `""`, an object token becomes `"[object Object]"`, and nested arrays and objects are resolved.
- `setAtPath` (`src/services/workflow-execution-service.ts:19-37`). Confirmed: it does not mutate its input, and it replaces scalar intermediates with objects.
- `assertInternalToken` (`src/lib/auth/internal-token.ts:14-25`). Five cases: an unset or empty env var throws a non-`AppError` (fails closed, 500); a null or empty header returns 401; a matching header passes.
- The retry decision (`workflow-execution-service.ts:164-177`) with `maxAttempts = maxRetries + 1`. For `maxRetries` 0, 3, and 10 it gave 1, 4, and 11 executions, with delays of 15/30/45 s for `maxRetries` 3. It always terminates.

**2. `node --test zod-nullish.test.cjs`: 3 tests, 3 passed.** These used zod **3.25.76**, borrowed read-only from another local project's `node_modules` (nothing was installed). This version is inside this repo's `^3.24.2` range. Confirmed:
- `typeof z.nullish === "undefined"`, while `z.string().nullish` is a function.
- Building a discriminated union with `cronExpression: z.nullish()` throws `TypeError`, matching `workflow-schemas.ts:97`.
- A failed `parse()` throws a `ZodError` with no `statusCode`, so `executeRoute()` cannot map it to anything but 500.

Not executed: anything touching Prisma, Next.js, `jose`, `bcryptjs`, or `cron-parser`. The `cron-parser` v5 `parseExpression` question remains open (see `docs/architecture/request-lifecycle.md`, debugging scenario 6).

## Tests worth adding, in priority order

Each entry names the behavior, the file:line that implements it, and the assertion.

1. **ZodError mapping.** Target: `src/lib/http/route-helpers.ts:46-62`. Assert that an invalid body returns 400, not 500. This test fails today.
2. **Schema module loads.** Target: `src/lib/validation/workflow-schemas.ts:93-104`. Assert that a valid SCHEDULE payload with `eventName: null` parses. This test fails today with `TypeError`.
3. **Event-ingest ownership.** Target: `src/services/workflow-dispatch-service.ts:62-85`. With a mocked `workflowRepository`, assert that an OPERATOR cannot dispatch another owner's workflow. This test fails today.
4. **Retry boundary.** Target: `src/services/workflow-execution-service.ts:167`. With mocked repositories and a `job` whose `attempts = maxAttempts - 1`, assert that `markStepFailed` and `markDead` are called and `markStepRetrying` is not.
5. **Unknown action type.** Target: `executeAction()` at line 40. Assert a descriptive error rather than a `TypeError` about `auditEvent`.
6. **Skip path ends the run.** Target: `src/repositories/workflow-run-repository.ts:171-187`. Assert that a skipped last step marks the run SUCCEEDED.
7. **Edit after run.** Integration test with a real Postgres instance: trigger, drain, then PATCH. This fails today with an FK violation (`prisma/schema.prisma:160`).
8. **Lease reclaim.** Integration test: set a job `LEASED` with a past `leasedUntil`, then assert the next `leaseNextAvailableJob()` returns it. This fails today.

## Exercises

1. **Goal:** Make `npm test` start. **Check:** with the alias and the `server-only` mock in place, `workflow-status-machine.test.ts` and `auth-permissions.test.ts` pass, and `workflow-schemas.test.ts` fails only because of `z.nullish`.
2. **Goal:** Fix `z.nullish` and watch the schema test go green. **Check:** the existing mismatch test still reports `success: false` for the right reason. Inspect `result.error.issues[0].path` and confirm it equals `["steps", 0, "actionType"]`.
3. **Goal:** Write test 4 from the list above using `vi.mock` for both repositories. **Check:** it passes, and it fails if you change `<` to `<=` on line 167.
