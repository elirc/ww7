import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { workflowMonitoringService } from "@/services/workflow-monitoring-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  return executeRoute(request, { permission: "workflow:read" }, async ({ actor }) => {
    const { runId } = await context.params;
    const run = await workflowMonitoringService.getRun(actor!, runId);
    return ok(run);
  });
}

