"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SessionUser } from "@/features/auth/domain/types";
import { DayOverview, MonthSnapshot, ShiftType } from "@/features/scheduler/domain/types";

function shiftLabel(shiftType: ShiftType) {
  return shiftType === "night" ? "Night" : "Day";
}

function cellAccent(day: DayOverview) {
  if (day.shifts.every((shift) => shift.isFull)) return "border-zinc-200 bg-zinc-100 text-zinc-500";
  if (day.weekend) return "border-amber-200 bg-amber-50 text-zinc-900";
  return "border-zinc-200 bg-white text-zinc-900";
}

export function PublicMonthView({
  snapshot,
  currentUser,
}: {
  snapshot: MonthSnapshot;
  currentUser: SessionUser | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState(snapshot.days);
  const [selectedDate, setSelectedDate] = useState(snapshot.days[0]?.date ?? "");
  const [name, setName] = useState(currentUser?.name ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [selectedEntries, setSelectedEntries] = useState<Record<string, ShiftType>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedDay = useMemo(
    () => days.find((day) => day.date === selectedDate) ?? days[0],
    [days, selectedDate],
  );

  function toggleSelection(date: string, shiftType: ShiftType) {
    setSelectedEntries((current) => {
      const next = { ...current };
      if (next[date] === shiftType) delete next[date];
      else next[date] = shiftType;
      return next;
    });
  }

  async function saveAvailability() {
    setError(null);
    setSuccess(null);

    const entries = Object.entries(selectedEntries).map(([date, shiftType]) => ({ date, shiftType }));
    if (entries.length === 0) {
      setError("Select at least one shift.");
      return;
    }

    if (snapshot.demoMode) {
      setDays((currentDays) =>
        currentDays.map((day) => {
          const selectedShift = selectedEntries[day.date];
          if (!selectedShift) return day;

          return {
            ...day,
            shifts: day.shifts.map((shift) => {
              if (shift.shiftType !== selectedShift) return shift;
              const alreadyListed = shift.candidateNames.includes(name.trim());
              const candidateNames = alreadyListed ? shift.candidateNames : [...shift.candidateNames, name.trim()].sort();
              const candidateIds = alreadyListed ? shift.candidateIds : [...shift.candidateIds, `demo:${name.trim().toLowerCase()}`];
              const isFull = candidateNames.length >= shift.capacity;
              return {
                ...shift,
                candidateNames,
                candidateIds,
                isFull,
              };
            }),
          };
        }),
      );
      setSelectedEntries({});
      setSuccess("Demo availability saved locally. Refreshing the page will reset it.");
      return;
    }

    const response = await fetch(`/api/months/${snapshot.month.monthId}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to save availability");
      return;
    }

    setSelectedEntries({});
    setSuccess("Availability saved.");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-5">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-zinc-950">
                {snapshot.month.orgName} · {snapshot.month.monthId}
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                Pick one shift per day. Weekends allow either a day or night shift. The app greys out fully booked
                options automatically.
              </p>
              {snapshot.demoMode ? (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Demo mode: this month is interactive without login or database writes.
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              <div>Status: {snapshot.month.status}</div>
              <div>Deadline: {new Date(snapshot.month.deadlineAt).toLocaleString()}</div>
              <div>Cap per shift: {snapshot.month.intakeLimitPerShift}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`rounded-3xl border p-4 text-left transition ${cellAccent(day)} ${
                selectedDate === day.date ? "ring-2 ring-zinc-950" : ""
              }`}
            >
              <div className="text-sm font-semibold">{day.weekdayLabel}</div>
              {day.shifts.map((shift) => (
                <div key={shift.shiftType} className="mt-3 text-xs">
                  <div className="font-medium">{shiftLabel(shift.shiftType)}</div>
                  <div>
                    {shift.candidateNames.length}/{shift.capacity} available
                  </div>
                </div>
              ))}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Your availability</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Name</span>
              <input
                className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Maria Example"
                disabled={Boolean(currentUser)}
              />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Email (optional for later MVP stages)</span>
              <input
                className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="maria@example.com"
                disabled={Boolean(currentUser)}
              />
            </label>
          </div>
          <p className="mt-3 text-sm text-zinc-600">
            {currentUser
              ? "This schedule is tied to your company account. Your saved account details are used automatically."
              : "In demo mode you can type any name and try the interface without logging in."}
          </p>

          <button
            type="button"
            disabled={isPending || snapshot.month.status !== "open"}
            onClick={saveAvailability}
            className="mt-4 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {isPending ? "Refreshing..." : "Save availability"}
          </button>
          {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
        </div>

        {selectedDay ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">{selectedDay.weekdayLabel}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Click a shift to include or remove it from your submission. Existing names are visible to everyone.
            </p>

            <div className="mt-5 space-y-4">
              {selectedDay.shifts.map((shift) => {
                const isSelected = selectedEntries[selectedDay.date] === shift.shiftType;
                return (
                  <div key={shift.shiftType} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-900">{shiftLabel(shift.shiftType)} shift</h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          {shift.candidateNames.length}/{shift.capacity} people already available
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={shift.isFull && !isSelected}
                        onClick={() => toggleSelection(selectedDay.date, shift.shiftType)}
                        className={`rounded-full px-4 py-2 text-sm font-medium ${
                          isSelected ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-800"
                        } disabled:opacity-50`}
                      >
                        {isSelected ? "Selected" : shift.isFull ? "Full" : "Select"}
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {shift.candidateNames.length > 0 ? (
                        shift.candidateNames.map((candidateName) => (
                          <span
                            key={`${selectedDay.date}:${shift.shiftType}:${candidateName}`}
                            className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
                          >
                            {candidateName}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">No one has picked this shift yet.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
