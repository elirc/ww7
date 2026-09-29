import { NextRequest } from "next/server";
import { assertInternalToken } from "@/lib/auth/internal-token";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { schedulerService } from "@/services/scheduler-service";

export async function POST(request: NextRequest) {
  return executeRoute(request, {}, async ({ request: innerRequest }) => {
    assertInternalToken(innerRequest.headers.get("x-internal-token"));
    const result = await schedulerService.dispatchDueWorkflows();
    return ok(result);
  });
}

