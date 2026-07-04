"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function AcceptInvitationForm({
  invitationId,
  email,
  teamName,
  role,
}: {
  invitationId: string;
  email: string;
  teamName: string;
  role: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId, name, password }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Failed to accept invitation");
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">Invitation</p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-950">Join {teamName}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This invite is for <span className="font-medium text-zinc-900">{email}</span> as a {role}.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 text-sm text-zinc-700">
          <span>Your name</span>
          <input
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Maria Example"
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
          {isPending ? "Joining..." : "Accept invitation"}
        </button>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </form>
    </div>
  );
}
