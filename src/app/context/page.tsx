"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { UserContext } from "@/features/auth/domain/types";

interface ContextPageState {
  userId: string;
  name: string;
  email: string;
  token: string;
  refreshToken: string;
  contexts: UserContext[];
}

export default function ContextPickerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<ContextPageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // State is passed via sessionStorage from the login flow
    const raw = sessionStorage.getItem("__flex_login_state");
    if (!raw) {
      router.replace("/login");
      return;
    }
    try {
      setState(JSON.parse(raw));
    } catch {
      router.replace("/login");
    }
  }, [router]);

  async function selectContext(context: UserContext) {
    if (!state) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          userId: state.userId,
          name: state.name,
          email: state.email,
          token: state.token,
          refreshToken: state.refreshToken,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to set context");
        return;
      }
      sessionStorage.removeItem("__flex_login_state");
      router.push(context.type === "org" ? "/org" : "/");
    } finally {
      setLoading(false);
    }
  }

  if (!state) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-6 py-16">
        <p className="text-sm text-zinc-500">Redirecting...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-16">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-950">Choose a context</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Welcome, {state.name}. You have access to multiple teams or organizations. Pick one to continue.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-3">
          {state.contexts.map((ctx, i) => (
            <button
              key={i}
              onClick={() => selectContext(ctx)}
              disabled={loading}
              className="group flex w-full items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:border-zinc-400 hover:shadow-md disabled:opacity-50"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-700">
                {ctx.type === "org" ? "O" : "T"}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-950">
                  {ctx.type === "org" ? ctx.orgName : ctx.teamName}
                </p>
                {ctx.type === "team" && (
                  <p className="text-xs text-zinc-500">{ctx.orgName}</p>
                )}
                <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {ctx.role.replace("_", " ")}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
