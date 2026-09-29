import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { workflowRunRepository } from "@/repositories/workflow-run-repository";
import { workflowDefinitionService } from "@/services/workflow-definition-service";
import { getWorkflowVisibilityScope } from "@/lib/auth/permissions";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return executeRoute(request, { permission: "workflow:read" }, async ({ actor }) => {
    const { workflowId } = await context.params;
    await workflowDefinitionService.getWorkflow(actor!, workflowId);
    const runs = await workflowRunRepository.listRunsForWorkflow(
      workflowId,
      getWorkflowVisibilityScope(actor!),
      actor!.userId,
    );
    return ok(runs);
  });
}

