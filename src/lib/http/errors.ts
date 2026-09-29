/**
 * What this file does:
 * Defines the app-level error types that route handlers convert into HTTP responses.
 * What calls it:
 * Services throw AppError instances and route helpers in src/lib/http/route-helpers.ts serialize them.
 * What it calls:
 * Native Error plus small response-shape helpers.
 * One thing a junior engineer would likely get wrong:
 * Throwing raw strings or generic errors everywhere, which makes error mapping inconsistent and hard to review.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorBody(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details ?? null,
    },
  };
}

