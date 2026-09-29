import { describe, expect, it } from "vitest";
import { buildWorkflowVisibilityWhere } from "@/repositories/workflow-repository";

describe("workflow ownership scoping", () => {
  it("scopes operator queries to workflows they created", () => {
    // This guards against cross-owner data leaks when non-admin users load workflow lists or details.
    expect(buildWorkflowVisibilityWhere("own", "operator-1")).toEqual({
      createdByUserId: "operator-1",
    });
    expect(buildWorkflowVisibilityWhere("all", "operator-1")).toEqual({});
  });
});

