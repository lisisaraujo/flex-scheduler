"use client";

import { Info, Moon, Sun, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { SessionUser } from "@/features/auth/domain/types";
import { DayOverview, MonthSnapshot, ShiftType } from "@/features/scheduler/domain/types";

function shiftLabel(shiftType: ShiftType) {
  return shiftType === "night" ? "Night" : "Day";
}

function cellAccent(day: DayOverview) {
  if (day.shifts.every((shift) => shift.isFull)) {
    return "border-white/35 bg-white/45 text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur-xl";
  }
  if (day.weekend) {
    return "border-white/40 bg-[linear-gradient(180deg,rgba(255,251,235,0.84),rgba(255,247,237,0.74))] text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(217,119,6,0.10)] backdrop-blur-xl";
  }
  return "border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(244,244,245,0.60))] text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl";
}

function cardClasses(day: DayOverview, isActive: boolean, isSubmitted: boolean) {
  if (isActive && isSubmitted) {
    return "border-white/45 bg-[linear-gradient(180deg,rgba(209,250,229,0.88),rgba(236,253,245,0.76))] text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.62),inset_0_0_0_1px_rgba(16,185,129,0.10),0_24px_56px_rgba(5,150,105,0.22)] backdrop-blur-xl";
  }
  if (isSubmitted) {
    return "border-white/42 bg-[linear-gradient(180deg,rgba(236,253,245,0.82),rgba(220,252,231,0.70))] text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.62),inset_0_0_0_1px_rgba(16,185,129,0.08),0_18px_42px_rgba(5,150,105,0.14)] backdrop-blur-xl";
  }
  if (isActive) {
    return `${cellAccent(day)} shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_20px_44px_rgba(15,23,42,0.14)]`;
  }
  return cellAccent(day);
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
      glow: "shadow-[0_8px_18px_rgba(244,63,94,0.14)]",
    };
  }

  if (count === 1) {
    return {
      track: "stroke-amber-200/80",
      progress: "stroke-amber-500",
      text: "text-amber-700",
      glow: "shadow-[0_8px_18px_rgba(245,158,11,0.14)]",
    };
  }

  return {
    track: "stroke-emerald-200/80",
    progress: "stroke-emerald-500",
    text: "text-emerald-700",
    glow: "shadow-[0_8px_18px_rgba(16,185,129,0.14)]",
  };
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
  const isReadOnlyAdmin = currentUser?.role === "team_admin" || currentUser?.role === "org_admin";
  const initialEntries = useMemo(() => {
    if (!currentUser || currentUser.role === "team_admin" || currentUser.role === "org_admin") return {} as Record<string, ShiftType>;
    const existing = snapshot.availabilities.find((availability) => availability.memberId === currentUser.userId);
    return Object.fromEntries(existing?.entries.map((entry) => [entry.date, entry.shiftType]) ?? []);
  }, [currentUser, snapshot.availabilities]);
  const [days, setDays] = useState(snapshot.days);
  const [flippedDate, setFlippedDate] = useState<string | null>(null);
  const [name, setName] = useState(currentUser?.name ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [selectedEntries, setSelectedEntries] = useState<Record<string, ShiftType>>(initialEntries);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    setDays(snapshot.days);
  }, [snapshot.days]);

  useEffect(() => {
    setSelectedEntries(initialEntries);
  }, [initialEntries]);

  function toggleDayCard(day: DayOverview) {
    if (isReadOnlyAdmin) return;

    setSelectedEntries((current) => {
      const next = { ...current };

      if (current[day.date] === "night") {
        delete next[day.date];
      } else {
        next[day.date] = "night";
      }
      return next;
    });
  }

  function toggleShiftSelection(date: string, shiftType: ShiftType) {
    if (isReadOnlyAdmin) return;

    setSelectedEntries((current) => {
      const next = { ...current };
      if (next[date] === shiftType) {
        delete next[date];
      } else {
        next[date] = shiftType;
      }
      return next;
    });
  }

  function toggleFlippedDate(date: string) {
    setFlippedDate((current) => (current === date ? null : date));
  }

  function displayedCandidateCount(date: string, shiftType: ShiftType, baseCount: number) {
    const persistedShift = initialEntries[date];
    const pendingShift = selectedEntries[date];

    if (persistedShift === shiftType && pendingShift !== shiftType) {
      return Math.max(0, baseCount - 1);
    }

    if (persistedShift !== shiftType && pendingShift === shiftType) {
      return baseCount + 1;
    }

    return baseCount;
  }

  function ShiftLoadMeter({
    count,
    capacity,
  }: {
    count: number;
    capacity: number;
  }) {
    const ratio = Math.min(count / capacity, 1);
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - ratio);
    const styles = shiftMeterClasses(count);

    return (
      <div
        className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-white/55 backdrop-blur-xl ${styles.glow}`}
        aria-label={`${count} of ${capacity} availabilities`}
        title={`${count}/${capacity}`}
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

  async function saveAvailability() {
    if (isReadOnlyAdmin) {
      setError("Admins can view the calendar but cannot submit availability.");
      setSuccess(null);
      return;
    }

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

    setSuccess("Availability saved.");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="relative perspective-[1800px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),rgba(255,255,255,0))]" />
      <div
        className="relative min-h-[70vh] transition-transform duration-700 [transform-style:preserve-3d]"
        style={{ transform: showInfo ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <section
          className="absolute inset-0 space-y-5 [backface-visibility:hidden]"
          aria-hidden={showInfo}
        >
          <div className="rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.52))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <div>
                  <h1 className="text-3xl font-semibold text-zinc-950">
                    {snapshot.month.orgName} · {snapshot.month.monthId}
                  </h1>
                  <p className="mt-2 text-sm text-zinc-600">
                    {currentUser
                      ? `${currentUser.name} · ${currentUser.email} · ${currentUser.teamName ?? currentUser.orgName}`
                      : `${name} · ${email || "No email"} · Demo mode`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-zinc-600">
                  <span className="rounded-full bg-zinc-100 px-3 py-1">Status: {snapshot.month.status}</span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1">
                    Deadline: {new Date(snapshot.month.deadlineAt).toLocaleString()}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1">
                    Cap per shift: {snapshot.month.intakeLimitPerShift}
                  </span>
                  {Object.keys(selectedEntries).length > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800">
                      {Object.keys(selectedEntries).length} day{Object.keys(selectedEntries).length === 1 ? "" : "s"} selected
                    </span>
                  ) : null}
                </div>
                {snapshot.demoMode ? (
                  <p className="text-sm font-medium text-amber-700">
                    Demo mode: this month is interactive without login or database writes.
                  </p>
                ) : null}
                {currentUser ? (
                  <p className="text-sm text-zinc-500">
                    {isReadOnlyAdmin
                      ? "Admin view is read-only here. You can inspect day details, but availability submission is disabled for admins."
                      : "Tap day cards to mark your availability. Your saved selections stay tied to your company account."}
                  </p>
                ) : null}
                {error ? <p className="text-sm text-rose-700">{error}</p> : null}
                {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowInfo(true)}
                  className="rounded-full border border-white/50 bg-white/55 px-4 py-2 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl transition hover:bg-white/70"
                >
                  Info
                </button>
                <button
                  type="button"
                  disabled={isPending || snapshot.month.status !== "open" || isReadOnlyAdmin}
                  onClick={saveAvailability}
                  className="rounded-full bg-zinc-950/88 px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:bg-zinc-950 disabled:opacity-60"
                >
                  {isReadOnlyAdmin ? "Read only" : isPending ? "Refreshing..." : "Save availability"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {days.map((day) => (
              <div
                key={day.date}
                className="perspective-[1400px]"
              >
                <div
                  className="relative min-h-[220px] transition-transform duration-500 [transform-style:preserve-3d]"
                  style={{ transform: flippedDate === day.date ? "rotateY(180deg)" : "rotateY(0deg)" }}
                >
                  <div
                    className={`absolute inset-0 rounded-3xl border p-4 text-left transition [backface-visibility:hidden] ${cardClasses(
                      day,
                      false,
                      Boolean(selectedEntries[day.date]),
                    )}`}
                  >
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold">{day.weekdayLabel}</div>
                        <div className="flex items-center gap-2">
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
                      </div>

                      {day.weekend ? (
                        <div className="mt-3 flex min-h-[132px] flex-1 flex-col overflow-hidden rounded-[1.35rem] border border-white/45 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-xl">
                          {(["day", "night"] as ShiftType[]).map((shiftType, index) => {
                            const shift = day.shifts.find((entry) => entry.shiftType === shiftType);
                            if (!shift) return null;
                            const ShiftIcon = iconForShift(shiftType);
                            const isActive = selectedEntries[day.date] === shiftType;
                            return (
                              <button
                                key={`${day.date}:${shiftType}`}
                                type="button"
                                onClick={() => toggleShiftSelection(day.date, shiftType)}
                                className={`flex min-h-0 flex-1 items-center justify-between px-3 py-3 text-left text-xs transition ${
                                  isActive
                                    ? "bg-[linear-gradient(180deg,rgba(209,250,229,0.95),rgba(236,253,245,0.88))] text-emerald-900"
                                    : shiftType === "day"
                                      ? "bg-[linear-gradient(180deg,rgba(255,251,235,0.48),rgba(255,255,255,0.18))] hover:bg-[linear-gradient(180deg,rgba(255,247,237,0.68),rgba(255,255,255,0.28))]"
                                      : "bg-[linear-gradient(180deg,rgba(224,231,255,0.22),rgba(255,255,255,0.14))] hover:bg-[linear-gradient(180deg,rgba(224,231,255,0.34),rgba(255,255,255,0.24))]"
                                } ${index === 0 ? "border-b border-white/45" : ""}`}
                              >
                                <div className="flex items-center gap-2">
                                  <ShiftIcon className="h-4 w-4" strokeWidth={2.25} />
                                  <span className="font-medium">{shiftLabel(shiftType)}</span>
                                </div>
                                <ShiftLoadMeter
                                  count={displayedCandidateCount(day.date, shiftType, shift.candidateNames.length)}
                                  capacity={shift.capacity}
                                />
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button type="button" onClick={() => toggleDayCard(day)} className="mt-3 block flex-1 text-left">
                          {day.shifts.map((shift) => {
                            const ShiftIcon = iconForShift(shift.shiftType);
                            return (
                              <div
                                key={shift.shiftType}
                                className={`min-h-[132px] h-full rounded-[1.35rem] border border-white/45 px-3 py-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-xl transition ${
                                  selectedEntries[day.date] === shift.shiftType
                                    ? "bg-[linear-gradient(180deg,rgba(209,250,229,0.94),rgba(236,253,245,0.86))] text-emerald-900"
                                    : "bg-[linear-gradient(180deg,rgba(224,231,255,0.2),rgba(255,255,255,0.16))] hover:bg-[linear-gradient(180deg,rgba(224,231,255,0.30),rgba(255,255,255,0.24))]"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <ShiftIcon className="h-4 w-4" strokeWidth={2.25} />
                                    <span className="font-medium">{shiftLabel(shift.shiftType)}</span>
                                  </div>
                                  <ShiftLoadMeter
                                    count={displayedCandidateCount(day.date, shift.shiftType, shift.candidateNames.length)}
                                    capacity={shift.capacity}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className={`absolute inset-0 rounded-3xl border p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl [backface-visibility:hidden] ${cardClasses(
                      day,
                      false,
                      Boolean(selectedEntries[day.date]),
                    )}`}
                    style={{ transform: "rotateY(180deg)" }}
                  >
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-950">{day.weekdayLabel}</div>
                        </div>
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

        <section
          className="absolute inset-0 rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.56))] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
          aria-hidden={!showInfo}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-3xl space-y-4">
              <div>
                <h2 className="text-3xl font-semibold text-zinc-950">How this month works</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  This view is only for marking your availability for the current month. Your company account is used
                  automatically.
                </p>
              </div>
              <div className="space-y-3 text-sm text-zinc-700">
                <p>Click a weekday card to toggle your night availability on or off.</p>
                <p>Weekend cards are split in half: the top half is day, the bottom half is night.</p>
                <p>Use the info button on a day to flip that card and see who is already available.</p>
                <p>Green cards are days you have currently selected.</p>
                <p>Your selections are only saved to the database when you click “Save availability”.</p>
                <p>Once saved, the available slot counts on the calendar update to reflect your submission.</p>
                <p>If a shift is full, you will not be able to save a conflicting selection for that date and shift.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="rounded-full bg-zinc-950/88 px-4 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:bg-zinc-950"
            >
              Close
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
