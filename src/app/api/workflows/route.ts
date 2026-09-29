import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { workflowDefinitionSchema } from "@/lib/validation/workflow-schemas";
import { workflowDefinitionService } from "@/services/workflow-definition-service";

export async function GET(request: NextRequest) {
  return executeRoute(request, { permission: "workflow:read" }, async ({ actor }) => {
    const workflows = await workflowDefinitionService.listWorkflows(actor!);
    return ok(workflows);
  });
}

export async function POST(request: NextRequest) {
  return executeRoute(request, { permission: "workflow:write", bodySchema: workflowDefinitionSchema }, async ({ actor, body }) => {
    const workflow = await workflowDefinitionService.createWorkflow(actor!, body!);
    return ok(workflow, 201);
  });
}

