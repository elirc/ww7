# Concepts Demonstrated

## Service Layer
Where to look: `src/services/workflow-definition-service.ts` — `transitionWorkflowStatus()` applies ownership checks, state-machine rules, scheduling rules, and audit logging before the repository writes.
Also see: `src/services/workflow-dispatch-service.ts` for trigger orchestration.
Risk if wrong: Business rules drift into routes or components and become impossible to review consistently.

## Repository Pattern
Where to look: `src/repositories/workflow-repository.ts` — `listWorkflows()` and `findById()` own query shape and ownership scoping.
Also see: `src/repositories/workflow-run-repository.ts` for transactional state persistence.
Risk if wrong: Data access becomes duplicated, inconsistent, and security-sensitive filters get missed.

## Zod Validation Boundary
Where to look: `src/lib/validation/workflow-schemas.ts` — `workflowDefinitionSchema` validates nested workflow trigger and step config payloads.
Also see: `src/lib/validation/auth-schemas.ts` for login validation.
Risk if wrong: Invalid action configs make it into the database and fail only when the worker executes them.

## Auth And Session Flow
Where to look: `src/lib/auth/session.ts` — `createSessionCookie()` and `getSessionActor()` turn a login into an authenticated request actor.
Also see: `src/services/auth-service.ts` for credential verification.
Risk if wrong: Requests may trust stale cookie claims or unauthenticated callers.

## Role-Based Access Control
Where to look: `src/lib/auth/permissions.ts` — `permissionMatrix`, `assertPermission()`, and `assertCanManageWorkflow()` define role and ownership rules.
Also see: `src/lib/http/route-helpers.ts` for where route-level permission checks fire.
Risk if wrong: Analysts could mutate data or operators could manage another operator's workflows.

## Status And State Transitions
Where to look: `src/lib/workflow/status-machine.ts` — `assertValidWorkflowTransition()` and `assertReadyForActivation()` enforce workflow lifecycle rules.
Also see: `src/services/workflow-definition-service.ts` for how the state machine is applied during publish actions.
Risk if wrong: Invalid workflows can become active and fail later in the worker.

## Audit Logging
Where to look: `src/repositories/workflow-run-repository.ts` — `createAuditEvent()` persists workflow and run audit entries.
Also see: `src/services/workflow-dispatch-service.ts` and `src/services/workflow-definition-service.ts` for when audit events are emitted.
Risk if wrong: Operators lose an execution trail and incident review becomes guesswork.

## Background Job Design
Where to look: `src/repositories/workflow-job-repository.ts` — `leaseNextAvailableJob()` implements durable leasing; `src/services/workflow-execution-service.ts` — `drainOnce()` executes one leased job.
Also see: `src/server/worker/worker.ts` for the long-lived poll loop.
Risk if wrong: Steps execute twice, retries disappear, or jobs get stuck forever.

## Conditional Workflow Execution
Where to look: `src/lib/workflow/conditions.ts` — `evaluateConditionGroup()` runs step conditions against payload and accumulated context.
Also see: `src/services/workflow-execution-service.ts` before each step action.
Risk if wrong: Steps run when they should skip, or skip when they should run, causing business side effects.

## Template Resolution
Where to look: `src/lib/workflow/templates.ts` — `resolveTemplateStrings()` fills placeholders like `{{payload.orderId}}`.
Also see: `src/services/workflow-execution-service.ts` inside `executeAction()`.
Risk if wrong: External requests or context writes use wrong payload values.

## Ownership-Based Data Isolation
Where to look: `src/repositories/workflow-repository.ts` — `buildWorkflowVisibilityWhere()` scopes operator reads to `createdByUserId`.
Also see: `src/repositories/workflow-run-repository.ts` for equivalent run scoping.
Risk if wrong: One operator can see or manipulate another operator's workflows.

## Durable Retry With Backoff
Where to look: `src/services/workflow-execution-service.ts:163-178` decides retry or fail, and `src/repositories/workflow-run-repository.ts:239-271` persists the retry by rewriting the same job row.
Also see: `prisma/schema.prisma:168-186`, where job state (`attempts`, `maxAttempts`, `readyAt`) lives apart from step-run state.
Risk if wrong: Retries that never stop, or retries lost on worker restart. Neither happens here: `readyAt` is persisted, and the loop stops at `maxRetries + 1` executions (checked with `node --test`).

## Converging Dispatch Paths
Where to look: `src/services/workflow-dispatch-service.ts:20-37`, where `enqueueRunForWorkflow()` is the one function that manual, event, and schedule triggers all call.
Risk if wrong: Three slightly different run-creation codepaths drift apart. The authorization around each path did drift: only the manual path checks ownership.

## Where each concept falls short in this codebase

A concept that is "demonstrated" is not necessarily complete. Each gap below was verified in the source.

| Concept | Gap | Evidence |
| --- | --- | --- |
| Service layer | One route reaches past the service to a repository | `src/app/api/workflows/[workflowId]/runs/route.ts:14` |
| Repository pattern | Step updates are delete-and-recreate, which conflicts with a `Restrict` FK | `src/repositories/workflow-repository.ts:136`, `prisma/schema.prisma:160` |
| Zod validation boundary | Validation failures surface as 500, and `z.nullish()` makes the schema module unloadable | `src/lib/http/route-helpers.ts:46-62`, `src/lib/validation/workflow-schemas.ts:97,102` |
| Zod validation boundary | Seed data bypasses the schema and stores configs without `type` | `prisma/seed.ts:92,107` |
| Auth and session flow | Logout cannot revoke a JWT. A missing secret looks like "logged out" | `src/lib/auth/session.ts:54-57,83` |
| RBAC | `workflow:ops` is granted but never required; `canReadWorkflow()` is unused | `src/lib/auth/permissions.ts:23,54-56` |
| Status transitions | `CANCELLED` exists for runs, but no code writes it | `prisma/schema.prisma:41` |
| Audit logging | Workflow create and update emit no audit event. Only status changes, event dispatch, run creation, and `APPEND_RUN_EVENT` steps do | `src/services/workflow-definition-service.ts:71-91` (no `createAuditEvent` call) |
| Background job design | No lease expiry reclaim, and `leaseToken` is never checked on completion | `src/repositories/workflow-job-repository.ts:24,69-90` |
| Conditional execution | Paths need a `payload.` or `context.` prefix. Missing values read as `null`, and `Number(null)` is `0`, so `gt -1` matches a missing field | `src/lib/workflow/conditions.ts:13-21,33-34` (checked with `node --test`) |
| Template resolution | Missing tokens become `""` silently, and object tokens become `"[object Object]"` | `src/lib/workflow/templates.ts:19,26` (checked with `node --test`) |
| Ownership isolation | Event ingest triggers workflows across owners | `src/services/workflow-dispatch-service.ts:63` |

## Exercises

1. **Goal:** Pick two rows from the table above and write a failing test for each before fixing it. **Check:** each test fails on the current code for the stated reason, not because of an import error.
2. **Goal:** Add audit events for workflow create and update. **Check:** `WorkflowAuditEvent` gains `workflow.created` and `workflow.updated` rows carrying `actorId` and a diff-free summary message.
