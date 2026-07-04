"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Authentication failed");
        return;
      }

      if (isRegister) {
        // Registration no longer creates a company — show userId so the developer
        // can bootstrap the super-admin setup via the REST API.
        setError(null);
        alert(
          `Account created! Your userId is:\n${payload.userId}\n\nUse the super-admin API to create an organization and assign yourself as org_admin.`,
        );
        return;
      }

      // Login: if the backend returned a context redirect, store state and navigate
      if (payload.redirect === "/context" && payload.contexts) {
        sessionStorage.setItem(
          "__flex_login_state",
          JSON.stringify({
            userId: payload.userId,
            name: payload.name,
            email: payload.email,
            token: payload.token,
            refreshToken: payload.refreshToken,
            contexts: payload.contexts,
          }),
        );
        router.push("/context");
        return;
      }

      router.push(payload.redirect ?? "/");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">Account</p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-950">
          {isRegister ? "Create an account" : "Log in"}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {isRegister
            ? "Create an account. You will receive team access via an invitation from your administrator."
            : "Log in to access your team schedule."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4">
        {isRegister ? (
          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Name</span>
            <input
              className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Maria Example"
            />
          </label>
        ) : null}

        <label className="grid gap-1 text-sm text-zinc-700">
          <span>Email</span>
          <input
            type="email"
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="maria@example.com"
          />
        </label>

        <label className="grid gap-1 text-sm text-zinc-700">
          <span>Password</span>
          <input
            type="password"
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Submitting..." : isRegister ? "Create account" : "Log in"}
        </button>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </form>

      <div className="mt-6 text-sm text-zinc-600">
        {isRegister ? "Already have an account?" : "Need an account?"}{" "}
        <Link className="font-medium text-zinc-950 underline" href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Log in" : "Register"}
        </Link>
      </div>
    </div>
  );
}
