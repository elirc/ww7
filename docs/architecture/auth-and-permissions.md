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
- `OPERATOR`: can read workflows, create and edit their own workflows, publish their own workflows, and trigger their own workflows. Route permission is coarse; ownership is enforced in `assertCanManageWorkflow()`.
- `ANALYST`: read-only access. Attempts to mutate workflow state are rejected by `assertPermission()` in `src/lib/auth/permissions.ts` before the request reaches a service.

Internal machine auth:
- Internal scheduler and worker routes use `assertInternalToken()` in `src/lib/auth/internal-token.ts`.
- The check runs inside `src/app/api/internal/scheduler/dispatch/route.ts` and `src/app/api/internal/worker/drain/route.ts` before calling background services.

Multi-tenancy:
- Multi-tenancy is not implemented.
- To add it later, start in `prisma/schema.prisma` by adding `tenantId` to tenant-owned models, then extend `RouteActor` in `src/types/workflow.ts`, then update `buildWorkflowVisibilityWhere()` and `buildRunVisibilityWhere()` so every repository query scopes by both `tenantId` and any ownership rule.
