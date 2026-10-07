# Build Journal

## Stage 1 — Chose the backend shape
Built:
- Initial app structure in `src/app`, `src/services`, `src/repositories`, `src/lib`, and `prisma`.
Decisions:
- Chose Next.js + TypeScript + PostgreSQL + Prisma + React Query.
- Chose a database-backed async worker rather than in-process execution.
Why:
- The project is mostly CRUD plus background workflow execution, so Prisma fits the domain well and the worker keeps execution durable.

## Stage 2 — Modeled the domain and auth boundary
Built:
- `prisma/schema.prisma`
- `src/lib/auth/session.ts`
- `src/lib/auth/permissions.ts`
- `src/lib/validation/workflow-schemas.ts`
Decisions:
- Kept multi-tenancy out, but made ownership scoping explicit with `createdByUserId` and repository scope helpers.
- Used a signed cookie plus DB reload for session auth.
Why:
- The requirements fit a single-organization tool; ownership scoping still creates a realistic data-isolation boundary.

## Stage 3 — Built CRUD and lifecycle services
Built:
- `src/services/workflow-definition-service.ts`
- `src/repositories/workflow-repository.ts`
- `src/repositories/workflow-run-repository.ts`
Decisions:
- Put publish/pause/archive behind a state-machine helper instead of generic field updates.
Why:
- Workflow lifecycle rules are easy to weaken if status is treated like ordinary mutable data.

## Stage 4 — Built async dispatch and execution
Built:
- `src/services/workflow-dispatch-service.ts`
- `src/services/workflow-execution-service.ts`
- `src/repositories/workflow-job-repository.ts`
- `src/server/worker/worker.ts`
- `src/server/worker/scheduler.ts`
Decisions:
- Used a leased-job table plus `FOR UPDATE SKIP LOCKED`.
- Constrained DB actions to engine-owned safe actions rather than arbitrary SQL.
Why:
- This makes retries and observability durable while keeping the learning surface realistic and reviewable.

## Stage 5 — Built UI and docs
Built:
- `src/components/workflows/workflow-dashboard.tsx`
- `src/components/workflows/workflow-builder.tsx`
- `docs/architecture/*`
- `docs/learning/*`
Decisions:
- The builder UI serializes directly into the backend schema shape.
Why:
- The fastest way to create workflow-builder bugs is to let the UI invent a second model.

## Major Decisions

### Decision: Async execution architecture
Why it matters:
- Workflow engines must survive request boundaries, retries, and worker restarts.
Options:
- In-process request execution: simple, but fragile and not truly async.
- Redis/BullMQ: robust queueing, but adds extra infrastructure and hides useful DB patterns for this project.
- PostgreSQL-backed job table: durable, transactional, and easy to study.
Choice:
- PostgreSQL-backed job table in `prisma/schema.prisma` and `src/repositories/workflow-job-repository.ts`.
Why this won:
- It keeps run state and queue state in one consistency boundary.
What junior/mid/senior engineers notice:
- Junior: it feels slower than a demo-first approach.
- Mid: it simplifies deployment and operations.
- Senior: it preserves consistency and leaves room to migrate to an external queue later.

### Decision: Workflow definition storage
Why it matters:
- The workflow builder, execution engine, and monitoring UI all depend on predictable step structure.
Options:
- One giant JSON blob per workflow: flexible, but weak for querying and step-run joins.
- Normalized workflow + step tables: more code, but much easier to validate and execute.
- Hybrid JSON definitions plus derived execution rows: split source of truth.
Choice:
- Normalized `WorkflowDefinition` and `WorkflowStep` models in `prisma/schema.prisma`.
Why this won:
- It makes step ordering, run expansion, and docs easier to reason about.
What junior/mid/senior engineers notice:
- Junior: JSON feels faster initially.
- Mid: normalized steps improve maintainability.
- Senior: normalized steps pay off when monitoring and migrations become real.

### Decision: Auth model
Why it matters:
- Auth and permissions must be explicit and reviewable from the start.
Options:
- Full auth framework: faster for production deployment, but more opaque for a learning project.
- Stateless cookie only: simple, but easy to trust stale claims.
- Signed cookie plus DB actor reload: slightly more code, stronger authority boundary.
Choice:
- Signed cookie plus DB actor reload in `src/lib/auth/session.ts`.
Why this won:
- It keeps the session flow understandable while preserving a real authorization boundary.
What junior/mid/senior engineers notice:
- Junior: more code than a library default.
- Mid: clearer control over request auth.
- Senior: better separation between session proof and authorization truth.

## PR Slices

### Slice 1 — Schema, auth, and validation foundations
Purpose:
- Establish the domain, session model, RBAC, and payload boundaries before building features.
Novel logic files:
- `prisma/schema.prisma`
- `src/lib/auth/session.ts`
- `src/lib/auth/permissions.ts`
- `src/lib/validation/workflow-schemas.ts`
Reviewer focus:
- `prisma/schema.prisma`: verify run/step/job relationships and delete behavior.
- `src/lib/auth/session.ts`: verify cookie signing and DB actor reload in the middle of the file.
- `src/lib/auth/permissions.ts`: verify role matrix and ownership checks near `assertCanManageWorkflow()`.
Junior reviewer blind spot:
- Approving role checks without asking where ownership is enforced.

### Slice 2 — Workflow definition CRUD and lifecycle
Purpose:
- Add definition creation, editing, reading, and publish/pause/archive transitions.
Novel logic files:
- `src/services/workflow-definition-service.ts`
- `src/repositories/workflow-repository.ts`
- `src/lib/workflow/status-machine.ts`
Reviewer focus:
- `src/services/workflow-definition-service.ts`: verify transition logic in `transitionWorkflowStatus()`.
- `src/repositories/workflow-repository.ts`: verify scope filters in `buildWorkflowVisibilityWhere()`.
- `src/lib/workflow/status-machine.ts`: verify the allowed transition map and activation preconditions.
Junior reviewer blind spot:
- Approving a generic `status` update without asking whether the state machine is explicit.

### Slice 3 — Trigger dispatch and async queueing
Purpose:
- Turn workflows into queued runs through manual, event, and schedule triggers.
Novel logic files:
- `src/services/workflow-dispatch-service.ts`
- `src/repositories/workflow-run-repository.ts`
- `src/app/api/events/ingest/route.ts`
Reviewer focus:
- `src/services/workflow-dispatch-service.ts`: verify inactive workflows cannot dispatch and scheduled workflows advance `nextScheduledAt`.
- `src/repositories/workflow-run-repository.ts`: verify run, step-run, and first-job creation stay in one transaction.
Junior reviewer blind spot:
- Approving duplicated enqueue logic in multiple trigger paths.

### Slice 4 — Worker execution and retries
Purpose:
- Add leased background execution, conditional steps, retries, and terminal failure handling.
Novel logic files:
- `src/repositories/workflow-job-repository.ts`
- `src/services/workflow-execution-service.ts`
- `src/server/worker/worker.ts`
Reviewer focus:
- `src/repositories/workflow-job-repository.ts`: verify the lock-based lease query near the top of the file.
- `src/services/workflow-execution-service.ts`: verify retries, next-step queueing, and final-status updates in `drainOnce()`.
Junior reviewer blind spot:
- Approving a non-locking queue lease because it works in single-user testing.

### Slice 5 — Dashboard, builder UI, tests, and docs
Purpose:
- Expose the backend through a realistic internal UI and document how to read it.
Novel logic files:
- `src/components/workflows/workflow-dashboard.tsx`
- `src/components/workflows/workflow-builder.tsx`
- `src/tests/*.test.ts`
- `docs/architecture/*`
- `docs/learning/*`
Reviewer focus:
- `src/components/workflows/workflow-builder.tsx`: verify the payload shape still mirrors the Zod schema.
- `src/tests/workflow-visibility.test.ts`: verify the data-isolation assertion is guarding the repository boundary.
Junior reviewer blind spot:
- Approving frontend convenience fields that no longer match backend validation.

## Post-review addendum: what each slice's review missed

A later read of the source checked every claim in this journal. The decisions above hold. The items below are what a reviewer following each slice's "Reviewer focus" list would still have let through. All were verified in the code.

### Slice 1 (schema, auth, validation)
- The reviewer was asked to "verify run/step/job relationships and delete behavior". The delete behavior is where the bug lives: `WorkflowStepRun.step` is `onDelete: Restrict` (`prisma/schema.prisma:160`). Slice 2's repository then deletes steps on every update (`src/repositories/workflow-repository.ts:136`). Each slice is fine on its own, and the conflict only shows once both merge.
- `src/lib/validation/workflow-schemas.ts:97,102` uses `z.nullish()`, which is not a Zod 3 export. Running the slice's own test would have caught it. That test cannot run as configured (see `testing-rationale.md`), so nobody did.
- `session.ts` is solid (signed JWT plus DB reload). The gap is revocation: logout only deletes the browser cookie.

### Slice 2 (definition CRUD and lifecycle)
- The state machine is explicit and correct (all 16 transitions enumerated with `node --test`).
- `updateWorkflow()` re-checks activation readiness for ACTIVE workflows (`src/services/workflow-definition-service.ts:84-88`), which is good. But because of the FK conflict above, the update cannot succeed once the workflow has runs.

### Slice 3 (dispatch)
- "Verify inactive workflows cannot dispatch" holds: the manual check is at `workflow-dispatch-service.ts:50`, and the event and schedule queries filter `status: ACTIVE`.
- Not on the checklist, and missed: `ingestEvent()` applies no ownership scope (line 63), and the schedule path reads then writes without claiming the workflow (lines 88-98).

### Slice 4 (worker and retries)
- The lock-based lease is correct. Double-execution by concurrent workers is prevented.
- Missed: expired leases are never reclaimed, `leaseToken` is never checked, `timeoutSeconds` is never applied, and `executeAction()` has no `default` branch. The seed's configs without `type` hit that missing branch on the first run.

### Slice 5 (UI, tests, docs)
- The four tests target the right boundaries, but none of them can run without alias and `server-only` setup. A slice that adds tests should also prove they execute.

### Decision revisited: PostgreSQL-backed job table
The choice still holds. "Run state and queue state in one consistency boundary" is only partly true in the code, though. Each `mark*` call is its own transaction, and the job finalization (`markSucceeded`/`markDead`) is a separate statement after the step-state transaction (`src/services/workflow-execution-service.ts:152-160,174-175`). To make the claim fully true, move the job update inside the same `$transaction` as the step update.
