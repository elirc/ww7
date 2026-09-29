/**
 * What this file does:
 * Holds the centralized RBAC matrix and ownership helpers for workflow access decisions.
 * What calls it:
 * Route helpers, workflow services, and tests.
 * What it calls:
 * AppError in src/lib/http/errors.ts.
 * One thing a junior engineer would likely get wrong:
 * Mixing coarse role checks with ownership logic in UI components instead of one reviewable backend module.
 */
import "server-only";
import { UserRole, WorkflowDefinition } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import type { Permission, RouteActor, WorkflowVisibilityScope } from "@/types/workflow";

const permissionMatrix: Record<UserRole, Permission[]> = {
  ADMIN: [
    "session:read",
    "workflow:read",
    "workflow:write",
    "workflow:publish",
    "workflow:execute",
    "workflow:ops",
  ],
  OPERATOR: ["session:read", "workflow:read", "workflow:write", "workflow:publish", "workflow:execute"],
  ANALYST: ["session:read", "workflow:read"],
};

export function assertPermission(actor: RouteActor, permission: Permission) {
  if (!permissionMatrix[actor.role].includes(permission)) {
    throw new AppError("You do not have permission to perform this action.", 403, "FORBIDDEN");
  }
}

export function getWorkflowVisibilityScope(actor: RouteActor): WorkflowVisibilityScope {
  // SENIOR NOTE: read scope and write ownership are separate checks; collapsing them usually causes privilege leaks.
  return actor.role === "ADMIN" || actor.role === "ANALYST" ? "all" : "own";
}

export function assertCanManageWorkflow(actor: RouteActor, workflow: Pick<WorkflowDefinition, "createdByUserId">) {
  if (actor.role === "ADMIN") {
    return;
  }

  if (workflow.createdByUserId !== actor.userId) {
    throw new AppError(
      "Operators can only manage workflows they created.",
      403,
      "WORKFLOW_SCOPE_VIOLATION",
    );
  }
}

export function canReadWorkflow(actor: RouteActor, workflow: Pick<WorkflowDefinition, "createdByUserId">) {
  return actor.role === "ADMIN" || actor.role === "ANALYST" || workflow.createdByUserId === actor.userId;
}

