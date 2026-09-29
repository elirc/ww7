"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/http/api-client";

export function useWorkflow(workflowId: string) {
  return useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => apiRequest<any>(`/api/workflows/${workflowId}`),
    enabled: Boolean(workflowId),
  });
}

export function useWorkflowRuns(workflowId: string) {
  return useQuery({
    queryKey: ["workflow-runs", workflowId],
    queryFn: () => apiRequest<any[]>(`/api/workflows/${workflowId}/runs`),
    enabled: Boolean(workflowId),
  });
}

