import { describe, expect, it } from "vitest";
import { assertPermission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/http/errors";

describe("permission enforcement", () => {
  it("rejects an analyst trying to modify a workflow", () => {
    // This matters because read-only roles should never gain write access through a missing backend guard.
    expect(() =>
      assertPermission(
        {
          userId: "user-1",
          email: "analyst@flowforge.dev",
          name: "Alex Analyst",
          role: "ANALYST",
        },
        "workflow:write",
      ),
    ).toThrowError(AppError);

    try {
      assertPermission(
        {
          userId: "user-1",
          email: "analyst@flowforge.dev",
          name: "Alex Analyst",
          role: "ANALYST",
        },
        "workflow:write",
      );
    } catch (error) {
      expect((error as AppError).statusCode).toBe(403);
    }
  });
});

