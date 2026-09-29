import type {
  UserRole,
  WorkflowJobStatus,
  WorkflowRunStatus,
  WorkflowStatus,
  WorkflowStepActionType,
  WorkflowStepStatus,
  WorkflowTriggerType,
} from "@prisma/client";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type RouteActor = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
};

export type Permission =
  | "session:read"
  | "workflow:read"
  | "workflow:write"
  | "workflow:publish"
  | "workflow:execute"
  | "workflow:ops";

export type WorkflowConditionRule = {
  leftPath: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  rightValue: JsonValue;
};

export type WorkflowConditionGroup = {
  combinator: "all" | "any";
  rules: WorkflowConditionRule[];
};

export type HttpActionConfig = {
  type: "HTTP_REQUEST";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Array<{ key: string; value: string }>;
  body?: JsonValue;
  storeResponseAs?: string;
};

export type UpdateRunContextConfig = {
  type: "UPDATE_RUN_CONTEXT";
  path: string;
  value: JsonValue;
};

export type AppendRunEventConfig = {
  type: "APPEND_RUN_EVENT";
  message: string;
  level: "info" | "warning" | "error";
  metadata?: JsonValue;
};

export type WorkflowActionConfig =
  | HttpActionConfig
  | UpdateRunContextConfig
  | AppendRunEventConfig;

export type WorkflowStepDefinitionInput = {
  id?: string;
  position: number;
  name: string;
  actionType: WorkflowStepActionType;
  config: WorkflowActionConfig;
  condition?: WorkflowConditionGroup | null;
  maxRetries: number;
  timeoutSeconds?: number | null;
};

export type WorkflowDefinitionInput = {
  name: string;
  description?: string | null;
  triggerType: WorkflowTriggerType;
  eventName?: string | null;
  cronExpression?: string | null;
  steps: WorkflowStepDefinitionInput[];
};

export type WorkflowVisibilityScope = "all" | "own";

export type WorkflowExecutionContext = {
  payload: Record<string, JsonValue>;
  context: Record<string, JsonValue>;
  workflow: {
    id: string;
    name: string;
    status: WorkflowStatus;
  };
  run: {
    id: string;
    status: WorkflowRunStatus;
  };
};

export type WorkflowRunSummary = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type JobLease = {
  id: string;
  stepRunId: string;
  status: WorkflowJobStatus;
  leaseToken: string | null;
};

export type StepTimelineItem = {
  id: string;
  name: string;
  position: number;
  status: WorkflowStepStatus;
  attempts: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

