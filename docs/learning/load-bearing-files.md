# Load Bearing Files

## src/lib/http/route-helpers.ts
- What it does: Central route wrapper for auth, permissions, validation, and error mapping.
- What calls it: Most files in `src/app/api/**`.
- What it calls: `src/lib/auth/session.ts`, `src/lib/auth/permissions.ts`, `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Routes could skip auth, skip permission checks, or return inconsistent error codes.
- What a junior engineer would likely miswrite here: Parsing request bodies before auth and returning raw thrown errors.

## src/lib/auth/permissions.ts
- What it does: Defines role capabilities and workflow ownership checks.
- What calls it: `src/lib/http/route-helpers.ts`, `src/services/workflow-definition-service.ts`, `src/services/workflow-dispatch-service.ts`.
- What it calls: `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Analysts could mutate definitions or operators could manage each other's workflows.
- What a junior engineer would likely miswrite here: Treating role checks as enough without ownership checks.

## src/repositories/workflow-repository.ts
- What it does: Persists workflow definitions and applies ownership-aware filters.
- What calls it: `src/services/workflow-definition-service.ts`, `src/services/workflow-dispatch-service.ts`, tests.
- What it calls: `src/lib/db.ts`, `src/lib/utils.ts`.
- What would break or become insecure if this file were wrong: Operator-scoped reads would leak other operators' definitions.
- What a junior engineer would likely miswrite here: Forgetting the `createdByUserId` filter in detail queries after adding it in list queries.

## src/services/workflow-definition-service.ts
- What it does: Owns definition CRUD and workflow status transitions.
- What calls it: Workflow REST handlers under `src/app/api/workflows/**`.
- What it calls: `src/repositories/workflow-repository.ts`, `src/lib/workflow/status-machine.ts`, `src/lib/auth/permissions.ts`, `src/repositories/workflow-run-repository.ts`.
- What would break or become insecure if this file were wrong: Inactive or invalid workflows could be activated, and ownership checks could be bypassed.
- What a junior engineer would likely miswrite here: Updating status with a generic repository call instead of a transition function.

## src/services/workflow-dispatch-service.ts
- What it does: Converts events, schedules, and manual triggers into queued runs.
- What calls it: `src/app/api/workflows/[workflowId]/trigger/route.ts`, `src/app/api/events/ingest/route.ts`, `src/services/scheduler-service.ts`.
- What it calls: `src/repositories/workflow-repository.ts`, `src/repositories/workflow-run-repository.ts`, `src/lib/workflow/schedule.ts`.
- What would break or become insecure if this file were wrong: Runs might be created for inactive workflows or scheduled workflows might stop advancing.
- What a junior engineer would likely miswrite here: Duplicating run-creation logic in three trigger paths.

## src/repositories/workflow-run-repository.ts
- What it does: Owns transactional updates for runs, step runs, and audit events.
- What calls it: `src/services/workflow-dispatch-service.ts`, `src/services/workflow-execution-service.ts`, `src/services/workflow-monitoring-service.ts`.
- What it calls: `src/lib/db.ts`.
- What would break or become insecure if this file were wrong: Run state could drift from step state, making monitoring unreliable and retries unsafe.
- What a junior engineer would likely miswrite here: Updating the run and step tables in separate requests or transactions.

## src/repositories/workflow-job-repository.ts
- What it does: Leases jobs safely for asynchronous workers.
- What calls it: `src/services/workflow-execution-service.ts`.
- What it calls: `src/lib/db.ts`.
- What would break or become insecure if this file were wrong: Multiple workers could execute the same step or jobs could get stuck leased forever.
- What a junior engineer would likely miswrite here: Using a non-locking query to acquire jobs.

## src/services/workflow-execution-service.ts
- What it does: Executes step actions, evaluates conditions, applies retries, and emits audit events.
- What calls it: `src/server/worker/worker.ts`, `src/app/api/internal/worker/drain/route.ts`.
- What it calls: `src/repositories/workflow-job-repository.ts`, `src/repositories/workflow-run-repository.ts`, `src/lib/workflow/conditions.ts`, `src/lib/workflow/templates.ts`.
- What would break or become insecure if this file were wrong: Step retries, final run status, and side effects would all become unreliable.
- What a junior engineer would likely miswrite here: Performing long external I/O inside a transaction or forgetting to persist retry state.

## src/components/workflows/workflow-builder.tsx
- What it does: Captures workflow definition input, status transitions, and manual-run testing in one UI surface.
- What calls it: `src/app/workflows/new/page.tsx`, `src/app/workflows/[workflowId]/page.tsx`.
- What it calls: `src/hooks/use-workflow.ts`, `src/lib/http/api-client.ts`.
- What would break or become insecure if this file were wrong: The UI could serialize shapes the backend never accepts, leading to hidden workflow builder drift.
- What a junior engineer would likely miswrite here: Creating a frontend-only step model that no longer matches the Zod schema.
