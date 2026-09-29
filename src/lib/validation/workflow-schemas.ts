/**
 * What this file does:
 * Defines all request validation for workflow definitions, manual triggers, and event ingestion.
 * What calls it:
 * Workflow route handlers under src/app/api/workflows/** and src/app/api/events/ingest/route.ts.
 * What it calls:
 * zod and the workflow types in src/types/workflow.ts.
 * One thing a junior engineer would likely get wrong:
 * Validating only the outer workflow object and forgetting nested step/action config unions.
 */
import { WorkflowStepActionType, WorkflowTriggerType, WorkflowStatus } from "@prisma/client";
import { z } from "zod";

const jsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValueSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([jsonLiteralSchema, z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

const conditionRuleSchema = z.object({
  leftPath: z.string().min(1),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"]),
  rightValue: jsonValueSchema,
});

export const conditionGroupSchema = z.object({
  combinator: z.enum(["all", "any"]),
  rules: z.array(conditionRuleSchema).min(1),
});

const httpActionSchema = z.object({
  type: z.literal("HTTP_REQUEST"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url(),
  headers: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
      }),
    )
    .optional(),
  body: jsonValueSchema.optional(),
  storeResponseAs: z.string().min(1).optional(),
});

const updateRunContextSchema = z.object({
  type: z.literal("UPDATE_RUN_CONTEXT"),
  path: z.string().min(1),
  value: jsonValueSchema,
});

const appendRunEventSchema = z.object({
  type: z.literal("APPEND_RUN_EVENT"),
  message: z.string().min(3),
  level: z.enum(["info", "warning", "error"]),
  metadata: jsonValueSchema.optional(),
});

export const workflowActionSchema = z.discriminatedUnion("type", [
  httpActionSchema,
  updateRunContextSchema,
  appendRunEventSchema,
]);

export const workflowStepSchema = z
  .object({
    id: z.string().optional(),
    position: z.number().int().positive(),
    name: z.string().min(2),
    actionType: z.nativeEnum(WorkflowStepActionType),
    config: workflowActionSchema,
    condition: conditionGroupSchema.nullish(),
    maxRetries: z.number().int().min(0).max(10),
    timeoutSeconds: z.number().int().positive().max(3600).nullish(),
  })
  .superRefine((step, ctx) => {
    // SENIOR NOTE: action discriminators drift easily when UI forms and stored config evolve at different speeds.
    if (step.actionType !== step.config.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "actionType must match config.type.",
        path: ["actionType"],
      });
    }
  });

const workflowTriggerBaseSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(500).nullish(),
  steps: z.array(workflowStepSchema),
});

export const workflowDefinitionSchema = z.discriminatedUnion("triggerType", [
  workflowTriggerBaseSchema.extend({
    triggerType: z.literal(WorkflowTriggerType.EVENT),
    eventName: z.string().min(2),
    cronExpression: z.nullish(),
  }),
  workflowTriggerBaseSchema.extend({
    triggerType: z.literal(WorkflowTriggerType.SCHEDULE),
    cronExpression: z.string().min(5),
    eventName: z.nullish(),
  }),
]);

export const workflowStatusTransitionSchema = z.object({
  status: z.nativeEnum(WorkflowStatus),
});

export const manualRunSchema = z.object({
  payload: z.record(jsonValueSchema).default({}),
});

export const eventIngestionSchema = z.object({
  eventName: z.string().min(2),
  payload: z.record(jsonValueSchema).default({}),
});

export type WorkflowDefinitionInput = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;
export type ManualRunInput = z.infer<typeof manualRunSchema>;

