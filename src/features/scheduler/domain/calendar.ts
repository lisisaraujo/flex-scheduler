import { eachDayOfInterval, format, parse } from "date-fns";
import { DayOverview, MemberAvailability, ShiftOverview, ShiftType } from "./types";

export function listMonthDates(monthId: string) {
  const start = parse(`${monthId}-01`, "yyyy-MM-dd", new Date());
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1, 0);
  return eachDayOfInterval({ start, end }).map((date) => format(date, "yyyy-MM-dd"));
}

export function isWeekend(date: string) {
  const weekday = new Date(`${date}T00:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

export function formatWeekdayLabel(date: string) {
  return format(new Date(`${date}T00:00:00`), "EEE dd");
}

export function selectableShifts(date: string): ShiftType[] {
  return isWeekend(date) ? ["night", "day"] : ["night"];
}

export function getShiftCapacity(date: string, shiftType: ShiftType, intakeLimitPerShift: number) {
  if (shiftType === "day" && !isWeekend(date)) return 0;
  return intakeLimitPerShift;
}

export function buildDayOverviews(
  monthId: string,
  intakeLimitPerShift: number,
  availabilities: MemberAvailability[],
): DayOverview[] {
  const rosters = new Map<string, Map<ShiftType, ShiftOverview>>();

  for (const availability of availabilities) {
    for (const entry of availability.entries) {
      const key = entry.date;
      const shiftMap = rosters.get(key) ?? new Map<ShiftType, ShiftOverview>();
      const existing = shiftMap.get(entry.shiftType) ?? {
        shiftType: entry.shiftType,
        capacity: getShiftCapacity(entry.date, entry.shiftType, intakeLimitPerShift),
        candidateIds: [],
        candidateNames: [],
        isFull: false,
      };

      if (!existing.candidateIds.includes(availability.memberId)) {
        existing.candidateIds.push(availability.memberId);
        existing.candidateNames.push(availability.name);
      }

      shiftMap.set(entry.shiftType, existing);
      rosters.set(key, shiftMap);
    }
  }

  return listMonthDates(monthId).map((date) => {
    const shiftMap = rosters.get(date) ?? new Map<ShiftType, ShiftOverview>();
    const shifts = selectableShifts(date).map((shiftType) => {
      const existing = shiftMap.get(shiftType) ?? {
        shiftType,
        capacity: getShiftCapacity(date, shiftType, intakeLimitPerShift),
        candidateIds: [],
        candidateNames: [],
        isFull: false,
      };

      const candidateNames = existing.candidateNames.slice().sort((a, b) => a.localeCompare(b));
      return {
        ...existing,
        candidateNames,
        isFull: existing.capacity > 0 && existing.candidateIds.length >= existing.capacity,
      };
    });

    return {
      date,
      weekdayLabel: formatWeekdayLabel(date),
      weekend: isWeekend(date),
      shifts,
    };
  });
}
