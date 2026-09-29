import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { manualRunSchema } from "@/lib/validation/workflow-schemas";
import { workflowDispatchService } from "@/services/workflow-dispatch-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return executeRoute(request, { permission: "workflow:execute", bodySchema: manualRunSchema }, async ({ actor, body }) => {
    const { workflowId } = await context.params;
    const run = await workflowDispatchService.triggerWorkflowManually(actor!, workflowId, body!.payload);
    return ok(run, 201);
  });
}

