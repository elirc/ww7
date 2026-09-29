/**
 * What this file does:
 * Evaluates a workflow step's conditional rules against the current payload and run context.
 * What calls it:
 * src/services/workflow-execution-service.ts before each step executes.
 * What it calls:
 * The path lookup helper in this file.
 * One thing a junior engineer would likely get wrong:
 * Evaluating condition rules against only the trigger payload and ignoring state accumulated by previous steps.
 */
import type { JsonValue, WorkflowConditionGroup, WorkflowExecutionContext } from "@/types/workflow";

function readPath(source: Record<string, JsonValue>, path: string): JsonValue {
  return path.split(".").reduce<JsonValue>((current, segment) => {
    if (current && typeof current === "object" && !Array.isArray(current) && segment in current) {
      return current[segment] as JsonValue;
    }

    return null;
  }, source);
}

function compare(
  leftValue: JsonValue,
  operator: WorkflowConditionGroup["rules"][number]["operator"],
  rightValue: JsonValue,
) {
  switch (operator) {
    case "eq":
      return leftValue === rightValue;
    case "neq":
      return leftValue !== rightValue;
    case "gt":
      return Number(leftValue) > Number(rightValue);
    case "gte":
      return Number(leftValue) >= Number(rightValue);
    case "lt":
      return Number(leftValue) < Number(rightValue);
    case "lte":
      return Number(leftValue) <= Number(rightValue);
    case "contains":
      return Array.isArray(leftValue) ? leftValue.includes(rightValue) : String(leftValue).includes(String(rightValue));
    case "in":
      return Array.isArray(rightValue) ? rightValue.includes(leftValue) : false;
    default:
      return false;
  }
}

export function evaluateConditionGroup(
  condition: WorkflowConditionGroup | null | undefined,
  executionContext: WorkflowExecutionContext,
) {
  if (!condition) {
    return true;
  }

  // SENIOR NOTE: conditions must read both payload and accumulated context or later steps cannot depend on earlier work.
  const matcher = condition.combinator === "all" ? "every" : "some";
  const mergedSource = {
    payload: executionContext.payload,
    context: executionContext.context,
  } as Record<string, JsonValue>;

  return condition.rules[matcher]((rule) => compare(readPath(mergedSource, rule.leftPath), rule.operator, rule.rightValue));
}

