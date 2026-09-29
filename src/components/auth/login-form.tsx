"use client";

/**
 * What this file does:
 * Implements the login form and calls the auth endpoint through a React Query mutation.
 * What calls it:
 * src/app/login/page.tsx.
 * What it calls:
 * src/lib/http/api-client.ts and the session query in src/hooks/use-session.ts.
 * One thing a junior engineer would likely get wrong:
 * Updating UI state optimistically before the auth cookie is actually set by the server.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/http/api-client";
import { useSession } from "@/hooks/use-session";
import { Panel } from "@/components/ui/panel";

export function LoginForm() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("admin@flowforge.dev");
  const [password, setPassword] = useState("admin1234");

  const loginMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: async () => {
      await session.refetch();
      router.push("/");
    },
  });

  return (
    <Panel className="mx-auto max-w-xl">
      <div className="mb-6 space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">Authentication</p>
        <h2 className="text-3xl font-semibold text-slate-950">Sign in to the workflow console</h2>
        <p className="text-sm text-slate-600">
          Demo accounts are seeded for learning: `admin@flowforge.dev`, `operator@flowforge.dev`, and `analyst@flowforge.dev`.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          loginMutation.mutate();
        }}
      >
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-950"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? "Signing in..." : "Sign In"}
        </button>
        {loginMutation.error ? <p className="text-sm text-rose-600">{loginMutation.error.message}</p> : null}
      </form>
    </Panel>
  );
}

