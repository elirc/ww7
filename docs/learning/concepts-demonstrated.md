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
