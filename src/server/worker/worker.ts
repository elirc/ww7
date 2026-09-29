/**
 * What this file does:
 * Polls the job table and processes queued workflow steps asynchronously.
 * What calls it:
 * The `npm run worker` script.
 * What it calls:
 * src/services/workflow-execution-service.ts.
 * One thing a junior engineer would likely get wrong:
 * Exiting on the first idle poll instead of running as a long-lived background process.
 */
import { workflowExecutionService } from "@/services/workflow-execution-service";

const POLL_INTERVAL_MS = 5_000;
const workerId = `worker-${process.pid}`;

async function main() {
  for (;;) {
    const result = await workflowExecutionService.drainOnce(workerId);

    if (!result.processed) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});

