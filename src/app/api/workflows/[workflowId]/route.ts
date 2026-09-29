import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { workflowDefinitionSchema } from "@/lib/validation/workflow-schemas";
import { workflowDefinitionService } from "@/services/workflow-definition-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return executeRoute(request, { permission: "workflow:read" }, async ({ actor }) => {
    const { workflowId } = await context.params;
    const workflow = await workflowDefinitionService.getWorkflow(actor!, workflowId);
    return ok(workflow);
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return executeRoute(request, { permission: "workflow:write", bodySchema: workflowDefinitionSchema }, async ({ actor, body }) => {
    const { workflowId } = await context.params;
    const workflow = await workflowDefinitionService.updateWorkflow(actor!, workflowId, body!);
    return ok(workflow);
  });
}

