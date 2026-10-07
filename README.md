# FlowForge Workflow Engine

FlowForge is a production-style learning project for workflow automation. It includes authenticated workflow CRUD, explicit RBAC, event and schedule triggers, a database-backed async worker, retries, monitoring, and a builder UI.

Start reading here:
- `docs/architecture/README.md`
- `docs/learning/guided-reading-path.md`
- `docs/learning/flow-traces.md`

Key backend files:
- `src/services/workflow-definition-service.ts`
- `src/services/workflow-dispatch-service.ts`
- `src/services/workflow-execution-service.ts`
- `src/repositories/workflow-repository.ts`
- `src/repositories/workflow-run-repository.ts`
- `src/repositories/workflow-job-repository.ts`

Project note:
- Dependency installation was intentionally skipped for this learning-oriented build, so the repo is structured like a realistic app without requiring a full local install during this pass.
- There is no lockfile, no `.env.example`, and no `node_modules` in the repo. Nothing described below has been run end to end against a database. Where the docs say something was executed, they name the exact command and result.

## What runs where

FlowForge is three processes that share one PostgreSQL database:

| Process | Entry point | Script (`package.json`) | What it does |
| --- | --- | --- | --- |
| Web app + REST API | `src/app/**` (Next.js 16 App Router) | `npm run dev` | Pages, the builder UI, and every handler under `src/app/api/**` |
| Worker | `src/server/worker/worker.ts` | `npm run worker` | Polls `WorkflowJob` every 5 s when idle (`POLL_INTERVAL_MS = 5_000`, line 13) and calls `workflowExecutionService.drainOnce()` |
| Scheduler | `src/server/worker/scheduler.ts` | `npm run scheduler` | Every 60 s (`POLL_INTERVAL_MS = 60_000`, line 13) calls `schedulerService.dispatchDueWorkflows()` |

The same two background operations can also be poked over HTTP: `POST /api/internal/worker/drain` and `POST /api/internal/scheduler/dispatch`, both gated by the `x-internal-token` header (see `docs/architecture/auth-and-permissions.md`).

## Environment variables the code reads

| Variable | Read at | Missing value behavior |
| --- | --- | --- |
| `DATABASE_URL` | `prisma/schema.prisma:15` | Prisma cannot connect |
| `SESSION_SECRET` | `src/lib/auth/session.ts:27` | `getSessionSecret()` throws. On login this surfaces as a 500. In `getSessionActor()` the throw is caught at line 83, so every request quietly looks unauthenticated |
| `INTERNAL_WORKER_TOKEN` | `src/lib/auth/internal-token.ts:15` | Internal routes fail closed with a 500 (plain `Error`, not `AppError`) |
| `NODE_ENV` | `src/lib/db.ts:21,24`, `src/lib/auth/session.ts:48` | Controls Prisma log level, the global client cache, and the cookie `secure` flag |

## Seed accounts (`prisma/seed.ts`)

| Email | Password | Role |
| --- | --- | --- |
| `admin@flowforge.dev` | `admin1234` | ADMIN |
| `operator@flowforge.dev` | `operator1234` | OPERATOR |
| `analyst@flowforge.dev` | `analyst1234` | ANALYST |

The seed also upserts one ACTIVE event workflow, `high-value-order-review`, on `order.created`. It is created by the operator and last updated by the admin.

## Read this before you run anything

A code review against the current source found these problems. Each one is cited with file:line and explained in the linked doc.

1. **Every workflow route probably fails at module load.** `src/lib/validation/workflow-schemas.ts:97` and `:102` call `z.nullish()`. Zod 3 has no top-level `nullish` factory; it exists only as a method (`z.string().nullish()`). This was checked against zod 3.25.76 (see `docs/learning/testing-rationale.md`). Evaluating the module throws `TypeError`, which breaks every route that imports a schema value from this file. See `docs/learning/testing-rationale.md`.
2. **Seeded steps cannot execute.** The seeded step configs at `prisma/seed.ts:92` and `:107` have no `type` field. `executeAction()` switches on `config.type` (`src/services/workflow-execution-service.ts:40`) and has no `default`, so it returns `undefined`. Line 141 then throws while reading `result.auditEvent`, and the step burns through its retries. See `docs/learning/flow-traces.md`.
3. **A workflow that has ever run cannot be edited.** `workflowRepository.updateWorkflow()` deletes all steps (`src/repositories/workflow-repository.ts:136`). `WorkflowStepRun.step` uses `onDelete: Restrict` (`prisma/schema.prisma:160`), so the delete fails with a foreign-key error, which reaches the client as a 500. See `docs/architecture/domain-model.md`.
4. **Validation errors return 500, not 400.** `executeRoute()` parses at `src/lib/http/route-helpers.ts:46`, but its catch only maps `AppError` (lines 49-51). A `ZodError` falls through to the generic 500. See `docs/architecture/request-lifecycle.md`.
5. **Any operator can fire every operator's event workflows.** `ingestEvent()` (`src/services/workflow-dispatch-service.ts:62-85`) never applies the ownership scope. See `docs/architecture/auth-and-permissions.md`.
6. **Crashed leases are never reclaimed.** The lease sets `leasedUntil` (`src/repositories/workflow-job-repository.ts:18`), but no code reads it. A worker that dies mid-job leaves that job `LEASED` forever. See `docs/learning/load-bearing-files.md`.

One more item is unverified because no copy of the package exists on this machine. `package.json` pins `cron-parser` to `^5.2.0`, while `src/lib/workflow/schedule.ts:16` calls the v4-style `parser.parseExpression()`. Check that API after installing. If it is missing, every cron expression is reported as `INVALID_CRON_EXPRESSION` (the catch at line 18).

## Documentation map

| Doc | Use it for |
| --- | --- |
| `docs/architecture/README.md` | Layers, route table, process topology |
| `docs/architecture/auth-and-permissions.md` | Session, RBAC matrix, ownership, internal token, security findings |
| `docs/architecture/domain-model.md` | Entities, status enums, delete behavior, who writes which column |
| `docs/architecture/request-lifecycle.md` | Request walkthroughs with line numbers, error mapping, debugging scenarios |
| `docs/learning/guided-reading-path.md` | 13-step reading order plus an exercise ladder |
| `docs/learning/flow-traces.md` | End-to-end traces, including failure and skip paths |
| `docs/learning/load-bearing-files.md` | Files where a mistake causes the most damage |
| `docs/learning/concepts-demonstrated.md` | Pattern catalog, including where each pattern falls short |
| `docs/learning/testing-rationale.md` | What the four tests cover, why they likely cannot run as configured, what was executed instead |
| `docs/learning/build-journal.md` | Build stages, decisions, and PR slices, plus a post-review addendum |
