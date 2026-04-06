"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

function localInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 16);
}

export function CreateMonthForm({ defaultOrgName }: { defaultOrgName?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdMonthId, setCreatedMonthId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState(defaultOrgName || "Flex Scheduler");
  const [monthId, setMonthId] = useState(new Date().toISOString().slice(0, 7));
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [intakeLimitPerShift, setIntakeLimitPerShift] = useState(6);
  const [deadlineAt, setDeadlineAt] = useState(localInputValue(Date.now() + 7 * 24 * 60 * 60 * 1000));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedMonthId(null);

    startTransition(async () => {
      const response = await fetch("/api/months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName,
          monthId,
          timezone,
          intakeLimitPerShift,
          deadlineAt: new Date(deadlineAt).getTime(),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Failed to create month");
        return;
      }

      setCreatedMonthId(payload.month.monthId);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-zinc-950">Create a month</h2>
        <p className="mt-1 text-sm text-zinc-600">
          This keeps the MVP flow simple: create the month, collect availability, then schedule manually.
        </p>
      </div>

      <label className="grid gap-1 text-sm text-zinc-700">
        <span>Organization name</span>
        <input
          className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm text-zinc-700">
          <span>Month ID</span>
          <input
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            placeholder="2026-04"
            value={monthId}
            onChange={(event) => setMonthId(event.target.value)}
          />
        </label>

        <label className="grid gap-1 text-sm text-zinc-700">
          <span>Timezone</span>
          <input
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm text-zinc-700">
          <span>Availability cap per shift</span>
          <input
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            type="number"
            min={1}
            max={20}
            value={intakeLimitPerShift}
            onChange={(event) => setIntakeLimitPerShift(Number(event.target.value))}
          />
        </label>

        <label className="grid gap-1 text-sm text-zinc-700">
          <span>Deadline</span>
          <input
            className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            type="datetime-local"
            value={deadlineAt}
            onChange={(event) => setDeadlineAt(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Creating..." : "Create month"}
        </button>
        {createdMonthId ? (
          <p className="text-sm text-emerald-700">
            Month created. Open {`/m/${createdMonthId}`} for intake or {`/admin/${createdMonthId}`} for scheduling.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    </form>
  );
}
