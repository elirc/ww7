"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/http/api-client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard" },
  { href: "/workflows/new", label: "New Workflow" },
  { href: "/login", label: "Login" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const logoutMutation = useMutation({
    mutationFn: () => apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      session.refetch();
      router.push("/login");
    },
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.32),_transparent_28%),linear-gradient(160deg,_#f4efe3_0%,_#e3ebdf_38%,_#dce8f2_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-[2rem] border border-white/60 bg-white/70 px-6 py-5 shadow-[0_24px_60px_rgba(30,41,59,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-slate-500">FlowForge Control Plane</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Workflow automation for corporate operations</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    pathname === item.href ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {session.data ? (
                <button
                  type="button"
                  onClick={() => logoutMutation.mutate()}
                  className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
                >
                  Sign Out
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span>{session.data ? `Signed in as ${session.data.name} (${session.data.role})` : "Not signed in"}</span>
            <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1">Roles: admin, operator, analyst</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

