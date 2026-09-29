"use client";

/**
 * What this file does:
 * Provides the workflow-definition editor, status controls, manual trigger form, and run timeline view.
 * What calls it:
 * src/app/workflows/new/page.tsx and src/app/workflows/[workflowId]/page.tsx.
 * What it calls:
 * Workflow hooks in src/hooks/use-workflow.ts plus workflow REST endpoints.
 * One thing a junior engineer would likely get wrong:
 * Keeping the form shape different from the server schema, which creates hard-to-debug serialization drift.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { useWorkflow, useWorkflowRuns } from "@/hooks/use-workflow";
import { apiRequest } from "@/lib/http/api-client";

type BuilderProps = {
  workflowId?: string;
};

type StepDraft = {
  position: number;
  name: string;
  actionType: "HTTP_REQUEST" | "UPDATE_RUN_CONTEXT" | "APPEND_RUN_EVENT";
  configText: string;
  conditionText: string;
  maxRetries: number;
  timeoutSeconds: number | "";
};

const emptyStep = (position: number): StepDraft => ({
  position,
  name: `Step ${position}`,
  actionType: "UPDATE_RUN_CONTEXT",
  configText: '{\n  "type": "UPDATE_RUN_CONTEXT",\n  "path": "flags.ready",\n  "value": true\n}',
  conditionText: "",
  maxRetries: 2,
  timeoutSeconds: "",
});

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PAUSED: "bg-amber-50 text-amber-700 border-amber-200",
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  ARCHIVED: "bg-rose-50 text-rose-700 border-rose-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RUNNING: "bg-sky-50 text-sky-700 border-sky-200",
  QUEUED: "bg-violet-50 text-violet-700 border-violet-200",
};

function parseJsonField(label: string, value: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

export function WorkflowBuilder({ workflowId }: BuilderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const workflowQuery = useWorkflow(workflowId ?? "");
  const runsQuery = useWorkflowRuns(workflowId ?? "");

  const [name, setName] = useState("Order escalation workflow");
  const [description, setDescription] = useState("Escalates risky events into downstream systems.");
  const [triggerType, setTriggerType] = useState<"EVENT" | "SCHEDULE">("EVENT");
  const [eventName, setEventName] = useState("order.created");
  const [cronExpression, setCronExpression] = useState("0 */2 * * *");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep(1)]);
  const [manualPayload, setManualPayload] = useState('{\n  "orderId": "ord_123",\n  "orderTotal": 8300\n}');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowQuery.data) {
      return;
    }

    const workflow = workflowQuery.data;
    setName(workflow.name);
    setDescription(workflow.description ?? "");
    setTriggerType(workflow.triggerType);
    setEventName(workflow.eventName ?? "");
    setCronExpression(workflow.cronExpression ?? "");
    setSteps(
      workflow.steps.map((step: any) => ({
        position: step.position,
        name: step.name,
        actionType: step.actionType,
        configText: JSON.stringify(step.config, null, 2),
        conditionText: step.condition ? JSON.stringify(step.condition, null, 2) : "",
        maxRetries: step.maxRetries,
        timeoutSeconds: step.timeoutSeconds ?? "",
      })),
    );
  }, [workflowQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (targetWorkflowId?: string) => {
      setFormError(null);

      // SENIOR NOTE: the builder payload intentionally mirrors the backend schema to avoid a second hidden definition model.
      const payload = {
        name,
        description,
        triggerType,
        eventName: triggerType === "EVENT" ? eventName : null,
        cronExpression: triggerType === "SCHEDULE" ? cronExpression : null,
        steps: steps.map((step) => ({
          position: step.position,
          name: step.name,
          actionType: step.actionType,
          config: parseJsonField(`Step ${step.position} config`, step.configText),
          condition: step.conditionText ? parseJsonField(`Step ${step.position} condition`, step.conditionText) : null,
          maxRetries: Number(step.maxRetries),
          timeoutSeconds: step.timeoutSeconds === "" ? null : Number(step.timeoutSeconds),
        })),
      };

      if (targetWorkflowId) {
        return apiRequest(`/api/workflows/${targetWorkflowId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest<{ id: string }>("/api/workflows", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (workflow: any) => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (!workflowId) {
        router.push(`/workflows/${workflow.id}`);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest(`/api/workflows/${workflowId}/publish`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/workflows/${workflowId}/trigger`, {
        method: "POST",
        body: JSON.stringify({ payload: parseJsonField("Manual trigger payload", manualPayload) }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflow-runs", workflowId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const currentWorkflow = workflowQuery.data;
  const availableStatusActions = useMemo(() => {
    switch (currentWorkflow?.status) {
      case "DRAFT":
        return ["ACTIVE", "ARCHIVED"];
      case "ACTIVE":
        return ["PAUSED", "ARCHIVED"];
      case "PAUSED":
        return ["ACTIVE", "ARCHIVED"];
      default:
        return [];
    }
  }, [currentWorkflow?.status]);

  if (workflowId && workflowQuery.isLoading) {
    return <Panel>Loading workflow...</Panel>;
  }

  if (workflowId && workflowQuery.error) {
    return <Panel>Workflow failed to load: {workflowQuery.error.message}</Panel>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">Workflow Builder</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-950">{workflowId ? "Edit definition" : "Create definition"}</h2>
            </div>
            {currentWorkflow ? <Badge className={statusStyles[currentWorkflow.status]}>{currentWorkflow.status}</Badge> : null}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Workflow name</span>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Description</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Trigger type</span>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={triggerType} onChange={(event) => setTriggerType(event.target.value as "EVENT" | "SCHEDULE") }>
                <option value="EVENT">Event</option>
                <option value="SCHEDULE">Schedule</option>
              </select>
            </label>
            {triggerType === "EVENT" ? (
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Event name</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={eventName} onChange={(event) => setEventName(event.target.value)} />
              </label>
            ) : (
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Cron expression</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono" value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} />
              </label>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">Steps</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Conditional action chain</h3>
            </div>
            <button
              type="button"
              onClick={() => setSteps((current) => [...current, emptyStep(current.length + 1)])}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            >
              Add Step
            </button>
          </div>
          <div className="space-y-5">
            {steps.map((step, index) => (
              <div key={index} className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-slate-950">Step {step.position}</h4>
                  <button
                    type="button"
                    onClick={() => setSteps((current) => current.filter((_, currentIndex) => currentIndex !== index).map((entry, entryIndex) => ({ ...entry, position: entryIndex + 1 })))}
                    className="text-sm font-medium text-rose-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Step name</span>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={step.name} onChange={(event) => setSteps((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: event.target.value } : entry))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Action type</span>
                    <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={step.actionType} onChange={(event) => setSteps((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, actionType: event.target.value as StepDraft["actionType"] } : entry))}>
                      <option value="HTTP_REQUEST">HTTP request</option>
                      <option value="UPDATE_RUN_CONTEXT">Update run context</option>
                      <option value="APPEND_RUN_EVENT">Append run event</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Max retries</span>
                    <input type="number" min={0} max={10} className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={step.maxRetries} onChange={(event) => setSteps((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, maxRetries: Number(event.target.value) } : entry))} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Action config JSON</span>
                    <textarea className="min-h-40 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" value={step.configText} onChange={(event) => setSteps((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, configText: event.target.value } : entry))} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Condition JSON (optional)</span>
                    <textarea className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" value={step.conditionText} onChange={(event) => setSteps((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, conditionText: event.target.value } : entry))} />
                  </label>
                </div>
              </div>
            ))}
          </div>
          {formError ? <p className="mt-4 text-sm text-rose-600">{formError}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => saveMutation.mutate(workflowId)} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              {saveMutation.isPending ? "Saving..." : workflowId ? "Save Changes" : "Create Workflow"}
            </button>
            {availableStatusActions.map((status) => (
              <button key={status} type="button" onClick={() => statusMutation.mutate(status)} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700">
                Move to {status}
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel>
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">Manual Trigger</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">Fire a test execution</h3>
          <textarea className="mt-4 min-h-40 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" value={manualPayload} onChange={(event) => setManualPayload(event.target.value)} />
          <button type="button" onClick={() => triggerMutation.mutate()} disabled={!workflowId} className="mt-4 w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200">
            Queue Manual Run
          </button>
          {triggerMutation.error ? <p className="mt-3 text-sm text-rose-600">{triggerMutation.error.message}</p> : null}
        </Panel>

        <Panel>
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">Execution History</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">Recent runs</h3>
          <div className="mt-4 space-y-4">
            {(runsQuery.data ?? []).map((run) => (
              <div key={run.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">Run {run.id.slice(0, 8)}</p>
                    <p className="text-sm text-slate-500">{new Date(run.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge className={statusStyles[run.status]}>{run.status}</Badge>
                </div>
              </div>
            ))}
            {!runsQuery.data?.length ? <p className="text-sm text-slate-500">No runs yet.</p> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

