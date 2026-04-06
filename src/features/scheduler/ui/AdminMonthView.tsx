"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { MonthSnapshot, MonthStatus } from "@/features/scheduler/domain/types";
import { ScheduleTable } from "./ScheduleTable";

function localInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 16);
}

export function AdminMonthView({ snapshot }: { snapshot: MonthSnapshot }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deadlineAt, setDeadlineAt] = useState(localInputValue(snapshot.month.deadlineAt));
  const [intakeLimitPerShift, setIntakeLimitPerShift] = useState(snapshot.month.intakeLimitPerShift);
  const [status, setStatus] = useState<MonthStatus>(snapshot.month.status);
  const [error, setError] = useState<string | null>(null);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch(`/api/months/${snapshot.month.monthId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deadlineAt: new Date(deadlineAt).getTime(),
        intakeLimitPerShift,
        status,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to update month");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function generateSchedule() {
    setError(null);

    const response = await fetch(`/api/months/${snapshot.month.monthId}/schedule`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to create schedule");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-950">
              Admin · {snapshot.month.orgName} · {snapshot.month.monthId}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              This MVP keeps scheduling manual. Update the settings, close intake when ready, then generate the table.
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            <div>Status: {snapshot.month.status}</div>
            <div>Availability records: {snapshot.availabilities.length}</div>
            <div>Weekend dates: {snapshot.days.filter((day) => day.weekend).length}</div>
          </div>
        </div>
      </section>

      <form onSubmit={saveSettings} className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Deadline</span>
            <input
              type="datetime-local"
              className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
              value={deadlineAt}
              onChange={(event) => setDeadlineAt(event.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Availability cap per shift</span>
            <input
              type="number"
              min={1}
              max={20}
              className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
              value={intakeLimitPerShift}
              onChange={(event) => setIntakeLimitPerShift(Number(event.target.value))}
            />
          </label>

          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Status</span>
            <select
              className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
              value={status}
              onChange={(event) => setStatus(event.target.value as MonthStatus)}
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            Save settings
          </button>

          <button
            type="button"
            onClick={generateSchedule}
            disabled={isPending}
            className="rounded-full bg-amber-400 px-5 py-3 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            Close and generate schedule
          </button>
        </div>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </form>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">Availability heatmap</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {snapshot.days.map((day) => (
            <div key={day.date} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <div className="font-semibold text-zinc-900">{day.weekdayLabel}</div>
              {day.shifts.map((shift) => (
                <div key={shift.shiftType} className="mt-2 text-zinc-600">
                  {shift.shiftType}: {shift.candidateNames.length}/{shift.capacity}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Schedule output</h2>
          <p className="mt-1 text-sm text-zinc-600">
            The current algorithm is the MVP version: chronological assignment, basic shuffle, and simple rest rules.
          </p>
        </div>
        <ScheduleTable rows={snapshot.assignments} />
      </section>
    </div>
  );
}
