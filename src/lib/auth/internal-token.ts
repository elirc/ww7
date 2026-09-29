/**
 * What this file does:
 * Validates the shared internal token used by scheduler and worker control endpoints.
 * What calls it:
 * src/app/api/internal/** routes.
 * What it calls:
 * AppError in src/lib/http/errors.ts.
 * One thing a junior engineer would likely get wrong:
 * Reusing end-user auth for internal jobs instead of a dedicated machine-to-machine control path.
 */
import "server-only";
import { AppError } from "@/lib/http/errors";

export function assertInternalToken(requestToken: string | null) {
  const expectedToken = process.env.INTERNAL_WORKER_TOKEN;

  if (!expectedToken) {
    throw new Error("INTERNAL_WORKER_TOKEN is required.");
  }

  if (!requestToken || requestToken !== expectedToken) {
    // SENIOR NOTE: internal ops endpoints should never piggyback on user sessions because machine auth has different blast radius.
    throw new AppError("Invalid internal worker token.", 401, "INVALID_INTERNAL_TOKEN");
  }
}

