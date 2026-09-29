# Architecture Overview

FlowForge is a production-style workflow automation engine built around explicit backend boundaries: route handlers in `src/app/api/**`, auth and validation in `src/lib/**`, business rules in `src/services/**`, and query shape in `src/repositories/**`.

Top-level folders:
- `src/app`: Next.js App Router pages plus REST handlers like `src/app/api/workflows/route.ts` and `src/app/workflows/[workflowId]/page.tsx`.
- `src/components`: UI-only composition such as `src/components/workflows/workflow-builder.tsx` and `src/components/workflows/workflow-dashboard.tsx`.
- `src/hooks`: React Query data hooks like `src/hooks/use-dashboard.ts` and `src/hooks/use-workflow.ts`.
- `src/lib`: cross-cutting backend concerns including auth in `src/lib/auth/session.ts`, validation in `src/lib/validation/workflow-schemas.ts`, and domain helpers in `src/lib/workflow/status-machine.ts`.
- `src/services`: orchestration and business logic, especially `src/services/workflow-definition-service.ts`, `src/services/workflow-dispatch-service.ts`, and `src/services/workflow-execution-service.ts`.
- `src/repositories`: database access modules such as `src/repositories/workflow-repository.ts` and `src/repositories/workflow-job-repository.ts`.
- `src/server/worker`: background processes in `src/server/worker/worker.ts` and `src/server/worker/scheduler.ts`.
- `prisma`: schema and seed data in `prisma/schema.prisma` and `prisma/seed.ts`.
- `src/tests`: focused tests for RBAC, validation, transitions, and ownership scoping.

Why Prisma instead of Drizzle:
- `prisma/schema.prisma` expresses the workflow domain clearly, especially the run/step/job relationship tree.
- The repositories in `src/repositories/*.ts` benefit from Prisma's nested includes and transaction API.
- The only raw SQL is the worker lease in `src/repositories/workflow-job-repository.ts`, where Postgres row locking matters more than ORM ergonomics.

Stack summary:
- Next.js + React + TypeScript
- PostgreSQL + Prisma
- Tailwind CSS
- Zod
- TanStack Query
- REST APIs
- A dedicated Node worker and scheduler for asynchronous execution
