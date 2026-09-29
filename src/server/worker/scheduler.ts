/**
 * What this file does:
 * Runs a lightweight scheduler loop that dispatches due cron workflows into run records.
 * What calls it:
 * The `npm run scheduler` script.
 * What it calls:
 * src/services/scheduler-service.ts.
 * One thing a junior engineer would likely get wrong:
 * Treating cron dispatch as fire-and-forget without any durable record of what was enqueued.
 */
import { schedulerService } from "@/services/scheduler-service";

const POLL_INTERVAL_MS = 60_000;

async function main() {
  for (;;) {
    await schedulerService.dispatchDueWorkflows();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error("Scheduler crashed", error);
  process.exit(1);
});

