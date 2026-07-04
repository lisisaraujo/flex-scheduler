import { buildDayOverviews, listMonthDates } from "@/features/scheduler/domain/calendar";
import { MemberAvailability, MonthSnapshot, ShiftType } from "@/features/scheduler/domain/types";

export function buildDemoMonthSnapshot(monthId: string): MonthSnapshot {
  const now = Date.now();
  const deadlineAt = new Date(`${monthId}-20T18:00:00`).getTime();
  const month = {
    teamId: "demo-company",
    monthId,
    orgName: "Flex Scheduler Demo",
    timezone: "Europe/Berlin",
    intakeLimitPerShift: 6,
    deadlineAt: Number.isNaN(deadlineAt) ? now + 14 * 24 * 60 * 60 * 1000 : deadlineAt,
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  };

  const dates = listMonthDates(monthId);
  const sampleEntries = [
    { memberId: "elena-demo", name: "Elena", dates: [dates[1], dates[5], dates[12]] },
    { memberId: "marco-demo", name: "Marco", dates: [dates[3], dates[5], dates[9]] },
    { memberId: "lea-demo", name: "Lea", dates: [dates[0], dates[8], dates[15]] },
  ];

  const availabilities: MemberAvailability[] = sampleEntries.map((sample) => ({
    memberId: sample.memberId,
    name: sample.name,
    email: null,
    createdAt: now,
    updatedAt: now,
    entries: sample.dates
      .filter(Boolean)
      .map((date) => ({
        date,
        shiftType: (new Date(`${date}T00:00:00`).getDay() === 6 ? "day" : "night") as ShiftType,
      })),
  }));

  return {
    month,
    days: buildDayOverviews(monthId, month.intakeLimitPerShift, availabilities),
    availabilities,
    assignments: [],
    demoMode: true,
  };
}
