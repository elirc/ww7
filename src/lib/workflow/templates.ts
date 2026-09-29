/**
 * What this file does:
 * Resolves string templates like {{payload.orderId}} inside action configs before execution.
 * What calls it:
 * src/services/workflow-execution-service.ts.
 * What it calls:
 * Small recursive helpers in this module.
 * One thing a junior engineer would likely get wrong:
 * Interpolating only top-level strings and forgetting nested objects and arrays inside action payloads.
 */
import type { JsonValue, WorkflowExecutionContext } from "@/types/workflow";

function lookupToken(context: WorkflowExecutionContext, token: string) {
  return token.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }

    return "";
  }, context);
}

export function resolveTemplateStrings(value: JsonValue, context: WorkflowExecutionContext): JsonValue {
  if (typeof value === "string") {
    // SENIOR NOTE: template resolution happens recursively so nested request bodies do not silently keep raw placeholders.
    return value.replace(/\{\{(.+?)\}\}/g, (_, token) => String(lookupToken(context, token.trim())));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateStrings(entry, context));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveTemplateStrings(entry, context)]),
    );
  }

  return value;
}

