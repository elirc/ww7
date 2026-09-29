/**
 * What this file does:
 * Centralizes request authentication, permission checks, JSON parsing, and error serialization for REST handlers.
 * What calls it:
 * Route handlers under src/app/api/**.
 * What it calls:
 * Session resolution in src/lib/auth/session.ts, permission guards in src/lib/auth/permissions.ts, and AppError helpers.
 * One thing a junior engineer would likely get wrong:
 * Re-implementing auth and error handling in every route, which guarantees drift and inconsistent security behavior.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { assertPermission } from "@/lib/auth/permissions";
import { getSessionActor } from "@/lib/auth/session";
import { AppError, isAppError, toErrorBody } from "@/lib/http/errors";
import type { Permission, RouteActor } from "@/types/workflow";

type RouteOptions<TBody> = {
  permission?: Permission;
  bodySchema?: ZodSchema<TBody>;
};

type RouteContext<TBody> = {
  actor: RouteActor | null;
  body: TBody | undefined;
  request: NextRequest;
};

export async function executeRoute<TBody>(
  request: NextRequest,
  options: RouteOptions<TBody>,
  handler: (context: RouteContext<TBody>) => Promise<NextResponse>,
) {
  try {
    const actor = await getSessionActor();

    if (options.permission) {
      if (!actor) {
        throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
      }

      assertPermission(actor, options.permission);
    }

    const body = options.bodySchema ? options.bodySchema.parse(await request.json()) : undefined;
    return await handler({ actor, body, request });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(toErrorBody(error), { status: error.statusCode });
    }

    // SENIOR NOTE: never leak raw stack traces from unexpected errors through JSON APIs.
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected server error occurred.",
        },
      },
      { status: 500 },
    );
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

