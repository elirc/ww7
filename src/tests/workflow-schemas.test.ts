import { describe, expect, it } from "vitest";
import { workflowDefinitionSchema } from "@/lib/validation/workflow-schemas";

describe("workflow schema validation", () => {
  it("rejects a step when actionType and config.type disagree", () => {
    // This catches a common production bug where UI and backend step serialization drift and the worker executes the wrong action branch.
    const result = workflowDefinitionSchema.safeParse({
      name: "Broken workflow",
      description: "Mismatch between action type and config",
      triggerType: "EVENT",
      eventName: "order.created",
      steps: [
        {
          position: 1,
          name: "Bad step",
          actionType: "HTTP_REQUEST",
          config: {
            type: "UPDATE_RUN_CONTEXT",
            path: "flags.ready",
            value: true,
          },
          maxRetries: 2,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

