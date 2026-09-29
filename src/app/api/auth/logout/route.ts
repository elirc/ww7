import { NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { executeRoute, ok } from "@/lib/http/route-helpers";

export async function POST(request: NextRequest) {
  return executeRoute(request, {}, async () => {
    await clearSessionCookie();
    return ok({ success: true });
  });
}

