"use client";

import { Info, Moon, Sun, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { CompanyMember } from "@/features/auth/domain/types";
import { DayOverview, MonthSnapshot, MonthStatus, ShiftOverview, ShiftType } from "@/features/scheduler/domain/types";
import { EditableDaySchedule, EditableScheduleTable } from "./EditableScheduleTable";
import { ScheduleTable } from "./ScheduleTable";

function localInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 16);
}

function shiftLabel(shiftType: ShiftType) {
  return shiftType === "night" ? "Night" : "Day";
}

function iconForShift(shiftType: ShiftType) {
  return shiftType === "day" ? Sun : Moon;
}

function orderedShifts(day: DayOverview) {
  const dayShift = day.shifts.find((shift) => shift.shiftType === "day");
  const nightShift = day.shifts.find((shift) => shift.shiftType === "night");
  return [dayShift, nightShift].filter((shift): shift is NonNullable<typeof shift> => Boolean(shift));
}

function shiftMeterClasses(count: number) {
  if (count === 0) {
    return {
      track: "stroke-rose-200/80",
      progress: "stroke-rose-500",
      text: "text-rose-700",
      glow: "shadow-[0_8px_18px_rgba(244,63,94,0.18)]",
    };
  }

  if (count === 1) {
    return {
      track: "stroke-amber-200/80",
      progress: "stroke-amber-500",
      text: "text-amber-700",
      glow: "shadow-[0_8px_18px_rgba(245,158,11,0.18)]",
    };
  }

  return {
    track: "stroke-emerald-200/80",
    progress: "stroke-emerald-500",
    text: "text-emerald-700",
    glow: "shadow-[0_8px_18px_rgba(16,185,129,0.18)]",
  };
}

function ShiftLoadMeter({ shift }: { shift: ShiftOverview }) {
  const count = shift.candidateNames.length;
  const ratio = Math.min(count / shift.capacity, 1);
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const styles = shiftMeterClasses(count);

  return (
    <div
      className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-white/55 backdrop-blur-xl ${styles.glow}`}
      aria-label={`${count} of ${shift.capacity} availabilities`}
      title={`${count}/${shift.capacity}`}
    >
      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          className={styles.track}
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={styles.progress}
        />
      </svg>
      <span className={`absolute text-[10px] font-semibold ${styles.text}`}>{count}</span>
    </div>
  );
}

function toEditableAssignments(rows: MonthSnapshot["assignments"], members: CompanyMember[]): EditableDaySchedule[] {
  const nameToIds = new Map<string, string[]>();
  members.forEach((member) => {
    const existing = nameToIds.get(member.name) ?? [];
    existing.push(member.userId);
    nameToIds.set(member.name, existing);
  });

  return rows.map((row) => ({
    date: row.date,
    weekend: row.weekend,
    night: [
      row.night[0] ? nameToIds.get(row.night[0])?.[0] ?? null : null,
      row.night[1] ? nameToIds.get(row.night[1])?.[0] ?? null : null,
    ],
    day: [
      row.day[0] ? nameToIds.get(row.day[0])?.[0] ?? null : null,
      row.day[1] ? nameToIds.get(row.day[1])?.[0] ?? null : null,
    ],
  }));
}

const PDF_SCALE_OPTIONS = [1, 0.95, 0.9, 0.85, 0.8, 0.75] as const;

export function AdminMonthView({ snapshot, members }: { snapshot: MonthSnapshot; members: CompanyMember[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deadlineAt, setDeadlineAt] = useState(localInputValue(snapshot.month.deadlineAt));
  const [intakeLimitPerShift, setIntakeLimitPerShift] = useState(snapshot.month.intakeLimitPerShift);
  const [status, setStatus] = useState<MonthStatus>(snapshot.month.status);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [flippedDate, setFlippedDate] = useState<string | null>(null);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [pdfScale, setPdfScale] = useState<number>(0.95);
  const initialEditableAssignments = useMemo(
    () => toEditableAssignments(snapshot.assignments, members),
    [members, snapshot.assignments],
  );
  const [editableAssignments, setEditableAssignments] = useState<EditableDaySchedule[]>(initialEditableAssignments);

  useEffect(() => {
    setEditableAssignments(initialEditableAssignments);
  }, [initialEditableAssignments]);

  useEffect(() => {
    setIsEditingSchedule(false);
  }, [initialEditableAssignments]);

  function toggleFlippedDate(date: string) {
    setFlippedDate((current) => (current === date ? null : date));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

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

    setSuccess("Month settings updated.");

    startTransition(() => {
      router.refresh();
    });
  }

  async function generateSchedule() {
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/months/${snapshot.month.monthId}/schedule`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to create schedule");
      return;
    }

    setSuccess("Schedule generated.");

    startTransition(() => {
      router.refresh();
    });
  }

  async function saveScheduleEdits() {
    setError(null);
    setSuccess(null);
    setIsSavingSchedule(true);

    const response = await fetch(`/api/months/${snapshot.month.monthId}/schedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: editableAssignments }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setIsSavingSchedule(false);
      setError(payload?.error ?? "Failed to save schedule edits");
      return;
    }

    setSuccess("Schedule edits saved.");
    setIsEditingSchedule(false);
    setIsSavingSchedule(false);
    startTransition(() => router.refresh());
  }

  function toggleScheduleEditing() {
    setError(null);
    setSuccess(null);

    if (isEditingSchedule) {
      void saveScheduleEdits();
      return;
    }

    setEditableAssignments(initialEditableAssignments);
    setIsEditingSchedule(true);
  }

  function downloadPdf() {
    if (isEditingSchedule) {
      return;
    }

    window.location.assign(`/api/months/${snapshot.month.monthId}/pdf?scale=${pdfScale.toFixed(2)}`);
  }

  const pdfPreviewUrl = `/api/months/${snapshot.month.monthId}/pdf?preview=1&scale=${pdfScale.toFixed(2)}`;

  async function deleteMonth() {
    setError(null);
    setSuccess(null);

    if (!["draft", "archived"].includes(snapshot.month.status)) {
      setError("Archive the month first before deleting it permanently.");
      return;
    }

    const confirmation = window.prompt(
      `Type ${snapshot.month.monthId} to permanently delete this month and all related availability and schedule data.`,
    );

    if (confirmation !== snapshot.month.monthId) {
      setError("Delete cancelled. The confirmation text did not match.");
      return;
    }

    const response = await fetch(`/api/months/${snapshot.month.monthId}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to delete month");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.56))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-950">
              Admin · {snapshot.month.orgName} · {snapshot.month.monthId}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              This MVP keeps scheduling manual. Update the settings, close intake when ready, then generate the table.
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-white/45 bg-white/45 px-4 py-3 text-sm text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-xl">
            <div>Status: {snapshot.month.status}</div>
            <div>Availability records: {snapshot.availabilities.length}</div>
            <div>Weekend dates: {snapshot.days.filter((day) => day.weekend).length}</div>
          </div>
        </div>
      </section>

      <form
        onSubmit={saveSettings}
        className="grid gap-4 rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.54))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Deadline</span>
            <input
              type="datetime-local"
              className="rounded-[1.25rem] border border-white/50 bg-white/55 px-4 py-3 text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none backdrop-blur-xl transition focus:border-white/70 focus:bg-white/70 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_0_0_3px_rgba(255,255,255,0.28)]"
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
              className="rounded-[1.25rem] border border-white/50 bg-white/55 px-4 py-3 text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none backdrop-blur-xl transition focus:border-white/70 focus:bg-white/70 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_0_0_3px_rgba(255,255,255,0.28)]"
              value={intakeLimitPerShift}
              onChange={(event) => setIntakeLimitPerShift(Number(event.target.value))}
            />
          </label>

          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Status</span>
            <select
              className="rounded-[1.25rem] border border-white/50 bg-white/55 px-4 py-3 text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none backdrop-blur-xl transition focus:border-white/70 focus:bg-white/70 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_0_0_3px_rgba(255,255,255,0.28)]"
              value={status}
              onChange={(event) => setStatus(event.target.value as MonthStatus)}
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="scheduled">Scheduled</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-zinc-950/88 px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:bg-zinc-950 disabled:opacity-60"
          >
            Save settings
          </button>

          <button
            type="button"
            onClick={generateSchedule}
            disabled={isPending || ["draft", "archived"].includes(snapshot.month.status)}
            className="rounded-full border border-amber-200/50 bg-[linear-gradient(180deg,rgba(253,230,138,0.92),rgba(251,191,36,0.82))] px-5 py-3 text-sm font-medium text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_14px_34px_rgba(217,119,6,0.18)] backdrop-blur-xl transition hover:brightness-[1.02] disabled:opacity-60"
          >
            Close and generate schedule
          </button>
        </div>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      </form>

      <section className="rounded-[2rem] border border-rose-200/45 bg-[linear-gradient(180deg,rgba(255,241,242,0.78),rgba(255,255,255,0.56))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_24px_60px_rgba(244,63,94,0.08)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold text-zinc-950">Month lifecycle</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Use the status field above to archive or restore a month. Archived months are hidden from normal users
              but remain visible to admins.
            </p>
            <p className="mt-3 text-sm text-zinc-600">
              Permanent deletion is only allowed for <span className="font-medium text-zinc-900">draft</span> or{" "}
              <span className="font-medium text-zinc-900">archived</span> months. This removes the month together with
              all related availability and generated schedule data.
            </p>
          </div>

          <button
            type="button"
            onClick={deleteMonth}
            disabled={isPending || !["draft", "archived"].includes(snapshot.month.status)}
            className="rounded-full border border-rose-200/60 bg-[linear-gradient(180deg,rgba(254,226,226,0.96),rgba(251,113,133,0.18))] px-5 py-3 text-sm font-medium text-rose-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_14px_34px_rgba(244,63,94,0.12)] backdrop-blur-xl transition hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Delete permanently
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.54))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
        <h2 className="text-xl font-semibold text-zinc-950">Availability heatmap</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {snapshot.days.map((day) => (
            <div
              key={day.date}
              className="perspective-[1400px]"
            >
              <div
                className="relative min-h-[168px] transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: flippedDate === day.date ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                <div
                  className={`absolute inset-0 rounded-[1.35rem] border p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.62),0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl [backface-visibility:hidden] ${
                    day.shifts.every((shift) => shift.isFull)
                      ? "border-white/35 bg-white/45 text-zinc-500"
                      : day.weekend
                        ? "border-white/40 bg-[linear-gradient(180deg,rgba(255,251,235,0.84),rgba(255,247,237,0.74))] text-zinc-900"
                        : "border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(244,244,245,0.60))] text-zinc-900"
                  }`}
                >
                  <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-zinc-900">{day.weekdayLabel}</div>
                      <button
                        type="button"
                        onClick={() => toggleFlippedDate(day.date)}
                        aria-expanded={flippedDate === day.date}
                        aria-label="Show day details"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/55 text-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition hover:bg-white/75"
                      >
                        <Info className="h-4 w-4" strokeWidth={2.2} />
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {orderedShifts(day).map((shift) => {
                        const ShiftIcon = iconForShift(shift.shiftType);
                        return (
                          <div key={shift.shiftType} className="flex items-center justify-between gap-2 text-zinc-600">
                            <span className="flex items-center gap-2">
                              <ShiftIcon className="h-4 w-4" strokeWidth={2.25} />
                              <span className="sr-only">{shiftLabel(shift.shiftType)}</span>
                            </span>
                            <ShiftLoadMeter shift={shift} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div
                  className={`absolute inset-0 rounded-[1.35rem] border p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur-xl [backface-visibility:hidden] ${
                    day.shifts.every((shift) => shift.isFull)
                      ? "border-white/35 bg-white/50 text-zinc-500"
                      : day.weekend
                        ? "border-white/40 bg-[linear-gradient(180deg,rgba(255,251,235,0.88),rgba(255,247,237,0.78))] text-zinc-900"
                        : "border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(244,244,245,0.64))] text-zinc-900"
                  }`}
                  style={{ transform: "rotateY(180deg)" }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-zinc-900">{day.weekdayLabel}</div>
                      <button
                        type="button"
                        onClick={() => toggleFlippedDate(day.date)}
                        aria-label="Close day details"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/50 bg-white/55 text-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition hover:bg-white/75"
                      >
                        <X className="h-4 w-4" strokeWidth={2.3} />
                      </button>
                    </div>

                    <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {orderedShifts(day).map((shift) => {
                        const ShiftIcon = iconForShift(shift.shiftType);
                        return (
                          <div key={`${day.date}:${shift.shiftType}`}>
                            <div className="flex items-center gap-2 text-zinc-500">
                              <ShiftIcon className="h-4 w-4" strokeWidth={2.25} />
                              <span className="sr-only">{shiftLabel(shift.shiftType)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {shift.candidateNames.length > 0 ? (
                                shift.candidateNames.map((candidateName) => (
                                  <span
                                    key={`${day.date}:${shift.shiftType}:${candidateName}`}
                                    className="rounded-full border border-white/40 bg-white/55 px-3 py-1 text-sm text-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl"
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Schedule output</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Generate the schedule first, then switch into edit mode only when you need to adjust assignments. PDF
              export stays available once the saved schedule is back in review mode.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={toggleScheduleEditing}
              disabled={isPending || isSavingSchedule || snapshot.assignments.length === 0}
              className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:bg-zinc-950/95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isEditingSchedule ? (isSavingSchedule ? "Saving..." : "Save schedule") : "Edit schedule"}
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={isPending || isSavingSchedule || isEditingSchedule || snapshot.assignments.length === 0}
              className="rounded-full border border-white/50 bg-white/55 px-5 py-3 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Download PDF
            </button>
          </div>
        </div>
        {isEditingSchedule ? (
          <p className="text-sm text-zinc-600">
            You can only save assignments that keep the schedule valid. A save will be rejected if someone is placed
            on a shift they did not mark available for, assigned twice on the same day, assigned to a day shift after
            a previous-night shift, marked inactive, or pushed past their max shifts.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {!error && success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        {snapshot.assignments.length === 0 ? (
          <div className="rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.54))] px-6 py-10 text-sm text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
            No schedule has been generated for this month yet.
          </div>
        ) : isEditingSchedule ? (
          <EditableScheduleTable
            rows={snapshot.assignments}
            days={snapshot.days}
            values={editableAssignments}
            onChange={setEditableAssignments}
          />
        ) : (
          <ScheduleTable rows={snapshot.assignments} />
        )}
        {!isEditingSchedule && snapshot.assignments.length > 0 ? (
          <div className="rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.54))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950">PDF preview</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  The export stays in A4 landscape format. If the month feels too tight, scale it down here before
                  downloading.
                </p>
              </div>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>PDF scale</span>
                <select
                  value={pdfScale}
                  onChange={(event) => setPdfScale(Number(event.target.value))}
                  className="rounded-[1rem] border border-white/50 bg-white/60 px-4 py-2.5 text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none backdrop-blur-xl"
                >
                  {PDF_SCALE_OPTIONS.map((scaleOption) => (
                    <option key={scaleOption} value={scaleOption}>
                      {Math.round(scaleOption * 100)}%
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/45 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <iframe
                key={pdfPreviewUrl}
                src={pdfPreviewUrl}
                title="Schedule PDF preview"
                className="h-[720px] w-full bg-white"
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
