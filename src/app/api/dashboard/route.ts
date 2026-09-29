import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { workflowMonitoringService } from "@/services/workflow-monitoring-service";

export async function GET(request: NextRequest) {
  return executeRoute(request, { permission: "workflow:read" }, async ({ actor }) => {
    const dashboard = await workflowMonitoringService.getDashboard(actor!);
    return ok(dashboard);
  });
}

