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
