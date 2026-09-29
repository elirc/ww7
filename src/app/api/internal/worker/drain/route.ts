import { NextRequest } from "next/server";
import { assertInternalToken } from "@/lib/auth/internal-token";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { workflowExecutionService } from "@/services/workflow-execution-service";

export async function POST(request: NextRequest) {
  return executeRoute(request, {}, async ({ request: innerRequest }) => {
    assertInternalToken(innerRequest.headers.get("x-internal-token"));
    const result = await workflowExecutionService.drainOnce("api-drain");
    return ok(result);
  });
}

