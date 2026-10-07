# Auth And Permissions

Auth flow:
- Login payload validation happens in `src/lib/validation/auth-schemas.ts` via `loginSchema` before `src/app/api/auth/login/route.ts` calls `authService.login()`.
- Credential verification happens in `src/services/auth-service.ts` inside `authService.login()`, which uses `userRepository.findByEmail()` from `src/repositories/user-repository.ts` and `verifyPassword()` from `src/lib/auth/password.ts`.
- Session cookie issuance happens in `src/lib/auth/session.ts` inside `createSessionCookie()`.
- Every authenticated route goes through `src/lib/http/route-helpers.ts` in `executeRoute()`, which calls `getSessionActor()` from `src/lib/auth/session.ts`.

RBAC enforcement:
- The role matrix is centralized in `src/lib/auth/permissions.ts` inside `permissionMatrix`.
- Route-level permission checks happen in `src/lib/http/route-helpers.ts` when `executeRoute()` calls `assertPermission()`.
- Ownership enforcement happens in `src/lib/auth/permissions.ts` via `assertCanManageWorkflow()` and is called from `src/services/workflow-definition-service.ts` and `src/services/workflow-dispatch-service.ts`.
- Operator read/write scope is translated into query shape by `buildWorkflowVisibilityWhere()` in `src/repositories/workflow-repository.ts` and `buildRunVisibilityWhere()` in `src/repositories/workflow-run-repository.ts`.

Role behavior:
- `ADMIN`: full read/write/publish/execute/ops access. See `permissionMatrix` in `src/lib/auth/permissions.ts`.
- `OPERATOR`: can read only the workflows and runs they created, because `getWorkflowVisibilityScope()` returns `"own"` for operators (`src/lib/auth/permissions.ts:37`). Within that set they can create, edit, publish, and manually trigger. Route permission is coarse, and ownership is enforced in `assertCanManageWorkflow()`. One exception: the event-ingest path lets an operator start other operators' workflows (see Finding A below).
- `ANALYST`: read-only access, but across all workflows. The scope is `"all"` for analysts (`permissions.ts:37`), so an analyst sees more than an operator does. Attempts to mutate workflow state are rejected by `assertPermission()` in `src/lib/auth/permissions.ts` before the request reaches a service.

Internal machine auth:
- Internal scheduler and worker routes use `assertInternalToken()` in `src/lib/auth/internal-token.ts`.
- The check runs inside `src/app/api/internal/scheduler/dispatch/route.ts` and `src/app/api/internal/worker/drain/route.ts` before calling background services.

Multi-tenancy:
- Multi-tenancy is not implemented.
- To add it later, start in `prisma/schema.prisma` by adding `tenantId` to tenant-owned models, then extend `RouteActor` in `src/types/workflow.ts`, then update `buildWorkflowVisibilityWhere()` and `buildRunVisibilityWhere()` so every repository query scopes by both `tenantId` and any ownership rule.
- Queries that do not go through either visibility helper and would therefore need their own tenant filter: `findExecutionReadyById()`, `listActiveEventWorkflows()`, and `listDueScheduledWorkflows()` in `src/repositories/workflow-repository.ts:100-201`, plus the `findById(workflowId, "all")` calls in `src/services/workflow-definition-service.ts:76,94`. Those calls deliberately pass `"all"` and rely on `assertCanManageWorkflow()` afterwards. With tenancy, `"all"` would have to mean "all within the tenant".

## Permission matrix, as coded

From `permissionMatrix` (`src/lib/auth/permissions.ts:16-27`). An extracted copy was run with `node --test`; the results are in `docs/learning/testing-rationale.md`.

| Permission | ADMIN | OPERATOR | ANALYST | Requested by |
| --- | --- | --- | --- | --- |
| `session:read` | yes | yes | yes | no route (`/api/session` passes no permission) |
| `workflow:read` | yes | yes | yes | dashboard, list, detail, runs, run detail |
| `workflow:write` | yes | yes | no | POST `/api/workflows`, PATCH `/api/workflows/[id]` |
| `workflow:publish` | yes | yes | no | POST `/api/workflows/[id]/publish` |
| `workflow:execute` | yes | yes | no | POST `/api/workflows/[id]/trigger`, POST `/api/events/ingest` |
| `workflow:ops` | yes | no | no | no route (dead grant) |

Read scope (`getWorkflowVisibilityScope()`, line 35-38) and write ownership (`assertCanManageWorkflow()`, lines 40-52) are separate checks:

| Role | Read scope | Can manage a workflow it did not create |
| --- | --- | --- |
| ADMIN | all | yes (early return, line 41-43) |
| OPERATOR | own (`createdByUserId = actor.userId`) | no, `403 WORKFLOW_SCOPE_VIOLATION` |
| ANALYST | all | not applicable, blocked earlier by the matrix |

Ownership is keyed on `createdByUserId` only. `updatedByUserId` is audit data and grants nothing. In the seed, the admin is the last updater of the operator's workflow, and the operator still owns it.

## Session mechanics (`src/lib/auth/session.ts`)

- **Signed, not just encoded.** `createSessionCookie()` (lines 36-52) signs an HS256 JWT with `SESSION_SECRET` (line 38, 42). The payload carries `sub` (user id) and `email`, but **no role**.
- **Cookie flags:** `workflow_session`, `httpOnly`, `sameSite: "lax"`, `secure` only in production, `maxAge` 8 hours (lines 18-19, 45-51).
- **Authority comes from the database.** `getSessionActor()` verifies the JWT (line 68) and then reloads the user with `userRepository.findById()` (line 71). A role change takes effect on the next request, and a deleted user's cookie stops working right away.
- **Every failure becomes `null`.** An expired token, a bad signature, a missing user, or even a missing `SESSION_SECRET` is swallowed by the `catch` at line 83. Routes then answer 401 `UNAUTHENTICATED` (`route-helpers.ts:39-41`), not 500. A misconfigured secret looks like "everyone is logged out".
- **Logout does not revoke anything.** `clearSessionCookie()` (lines 54-57) only deletes the cookie in the browser. A copied token stays valid until it expires, because no server-side session or denylist exists.
- `requireSessionActor()` (lines 88-96) is defined but never called. `executeRoute()` performs the same check inline.

## Internal machine auth, verified

`assertInternalToken()` (`src/lib/auth/internal-token.ts:14-25`) was checked against the "unset env var means bypass" bug pattern. It is **not** vulnerable:
- With `INTERNAL_WORKER_TOKEN` unset or empty, line 17 throws a plain `Error`. `executeRoute()` turns that into a 500 `INTERNAL_SERVER_ERROR` (`route-helpers.ts:54-62`). The route fails closed, and `undefined === undefined` is never reached.
- A missing or empty header is rejected at line 21 (`!requestToken`) with 401 `INVALID_INTERNAL_TOKEN`.
- Remaining weaknesses: the comparison is `!==`, not constant-time (`crypto.timingSafeEqual`). The token is also one shared static secret with no rotation and no per-caller identity.
- Order of operations: the internal routes still run `getSessionActor()` first (`route-helpers.ts:36`), because they pass `{}` as options. That is a harmless but wasted DB lookup when a cookie is present.

All five cases (unset env, empty env, null header, empty header, matching header) were run against an extracted copy with `node --test`.

## Verified security findings

**Finding A: event ingestion bypasses ownership.** `POST /api/events/ingest` requires only `workflow:execute` (`src/app/api/events/ingest/route.ts:7`). `ingestEvent()` calls `listActiveEventWorkflows(eventName)` (`src/services/workflow-dispatch-service.ts:63`), which filters on status, trigger type, and event name only (`src/repositories/workflow-repository.ts:170-183`). No visibility scope and no `assertCanManageWorkflow()` are applied. Operator B can therefore start operator A's `order.created` workflow with any payload, even though B cannot read that workflow or its runs. Compare the manual path, which does both checks (`workflow-dispatch-service.ts:42,48`).
- Fix options: scope the query to the caller's visibility for non-admins, or move event ingestion to a machine-authenticated route like the internal ones.

**Finding B: validation failures look like server errors.** `executeRoute()` runs `options.bodySchema.parse()` at `route-helpers.ts:46`. `ZodError` is not an `AppError`, so it skips lines 49-51 and returns 500 `INTERNAL_SERVER_ERROR`. Malformed JSON hits the same path through `request.json()` throwing `SyntaxError`. A wrong password shorter than 8 characters is therefore a 500, while a longer wrong one is a 401. The client in `src/lib/http/api-client.ts:13` shows the generic message "An unexpected server error occurred." Fix: map `ZodError` to `400` with `error.flatten()` as `details`.

**Finding C: auth failures stay generic, but timing does not.** `authService.login()` returns the same message for an unknown email and a wrong password (`src/services/auth-service.ts:22-30`). For an unknown email it skips bcrypt entirely, so it responds measurably faster, and response timing can still reveal which emails have accounts.

**Finding D: no CSRF token.** Mutations rely on `sameSite: "lax"` cookies plus JSON bodies. Lax blocks cross-site POSTs in modern browsers, so this is acceptable for an internal tool. There is no explicit CSRF defence beyond that.

**Checked and not a problem:**
- **Headerless request becomes a default user?** No. A missing cookie yields `actor = null` (`session.ts:63-65`), and any route that passes a `permission` then throws 401 (`route-helpers.ts:39-41`).
- **Unsigned cookie?** No. It is an HS256 JWT verified with `jwtVerify`.
- **Guards defined but never called?** `assertPermission()` is called once, inside `executeRoute()`. `assertCanManageWorkflow()` is called at `workflow-definition-service.ts:82,100` and `workflow-dispatch-service.ts:48`. The dead helpers are `canReadWorkflow()` (`permissions.ts:54-56`), `requireSessionActor()`, and the `workflow:ops` permission.

## Exercises

1. **Goal:** Prove the operator/analyst asymmetry. Log in as the seeded analyst and call `GET /api/workflows`, then do the same as a second operator. **Check:** the analyst sees the seeded workflow, while a second operator (create one in the DB) sees an empty list.
2. **Goal:** Close Finding A. Pass the actor's scope into `listActiveEventWorkflows()`. **Check:** a new test shows operator B's ingest returns `matchedWorkflowCount: 0` for operator A's event workflow, while an admin's ingest still matches it.
3. **Goal:** Fix Finding B. In `route-helpers.ts`, catch `ZodError` and return 400 `VALIDATION_FAILED` with details. **Check:** `POST /api/auth/login` with `{"email":"x"}` returns 400, and the builder shows a field-level message instead of the generic one.
4. **Goal:** Make the internal-token compare constant-time. **Check:** the five token cases listed above still produce the same outcomes.
5. **Goal:** Decide what `workflow:ops` should guard, or delete it. **Check:** after the change, every permission in the matrix is requested by at least one route (grep for the string).
