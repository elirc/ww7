import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import { assertValidWorkflowTransition } from "@/lib/workflow/status-machine";

describe("workflow status transitions", () => {
  it("rejects a transition from archived back to active", () => {
    // This protects against silently reactivating workflows that reviewers believed were permanently retired.
    expect(() => assertValidWorkflowTransition("ARCHIVED", "ACTIVE")).toThrowError(AppError);
  });
});

