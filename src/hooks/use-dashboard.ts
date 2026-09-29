"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/http/api-client";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest<{
      workflows: Array<any>;
      recentRuns: Array<any>;
      stats: {
        totalWorkflows: number;
        activeWorkflows: number;
        pausedWorkflows: number;
        failedRuns: number;
      };
    }>("/api/dashboard"),
  });
}

