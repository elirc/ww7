import { NextRequest } from "next/server";
import { executeRoute, ok } from "@/lib/http/route-helpers";
import { loginSchema } from "@/lib/validation/auth-schemas";
import { authService } from "@/services/auth-service";

export async function POST(request: NextRequest) {
  return executeRoute(request, { bodySchema: loginSchema }, async ({ body }) => {
    const user = await authService.login(body!);
    return ok(user);
  });
}

