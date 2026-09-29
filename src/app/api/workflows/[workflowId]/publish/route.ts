import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { workflowStatusTransitionSchema } from "@/lib/validation/workflow-schemas";
import { workflowDefinitionService } from "@/services/workflow-definition-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return executeRoute(request, { permission: "workflow:publish", bodySchema: workflowStatusTransitionSchema }, async ({ actor, body }) => {
    const { workflowId } = await context.params;
    const workflow = await workflowDefinitionService.transitionWorkflowStatus(actor!, workflowId, body!.status);
    return ok(workflow);
  });
}

