/**
 * What this file does:
 * Calculates the next time a scheduled workflow should run from its cron expression.
 * What calls it:
 * src/services/workflow-definition-service.ts and src/services/workflow-dispatch-service.ts.
 * What it calls:
 * cron-parser.
 * One thing a junior engineer would likely get wrong:
 * Calculating the next run off the server's local clock without a deterministic baseline, which causes skipped schedules.
 */
import parser from "cron-parser";
import { AppError } from "@/lib/http/errors";

export function getNextScheduledAt(cronExpression: string, currentDate = new Date()) {
  try {
    const interval = parser.parseExpression(cronExpression, { currentDate });
    return interval.next().toDate();
  } catch {
    throw new AppError("Invalid cron expression.", 422, "INVALID_CRON_EXPRESSION");
  }
}

