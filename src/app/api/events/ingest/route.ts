import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { eventIngestionSchema } from "@/lib/validation/workflow-schemas";
import { workflowDispatchService } from "@/services/workflow-dispatch-service";

export async function POST(request: NextRequest) {
  return executeRoute(request, { permission: "workflow:execute", bodySchema: eventIngestionSchema }, async ({ actor, body }) => {
    const result = await workflowDispatchService.ingestEvent(body!.eventName, body!.payload, actor);
    return ok(result, 202);
  });
}

