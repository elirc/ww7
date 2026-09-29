"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/http/api-client";

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "ANALYST";
} | null;

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiRequest<SessionUser>("/api/session"),
  });
}

