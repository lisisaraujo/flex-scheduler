import { buildDayOverviews } from "./calendar";
import { DaySchedule, MemberAvailability, ShiftType } from "./types";

function makeSeed(input: string) {
  let seed = 0;
  for (const char of input) {
    seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  }
  return seed || 1;
}

function shuffle<T>(items: T[], seedInput: string) {
  const result = items.slice();
  let seed = makeSeed(seedInput);

  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}

function canTakeShift(
  memberId: string,
  date: string,
  shiftType: ShiftType,
  assignmentsByMember: Map<string, Set<string>>,
) {
  const existing = assignmentsByMember.get(memberId) ?? new Set<string>();

  if (existing.has(`${date}:night`) || existing.has(`${date}:day`)) {
    return false;
  }

  if (shiftType === "day" && existing.has(`${previousDate(date)}:night`)) {
    return false;
  }

  return true;
}

export function generateSchedule(
  monthId: string,
  intakeLimitPerShift: number,
  availabilities: MemberAvailability[],
): DaySchedule[] {
  const assignmentsByMember = new Map<string, Set<string>>();
  const nameByMember = new Map(availabilities.map((availability) => [availability.memberId, availability.name]));
  const days = buildDayOverviews(monthId, intakeLimitPerShift, availabilities);

  return days.map((day) => {
    const slots: DaySchedule = {
      date: day.date,
      weekdayLabel: day.weekdayLabel,
      weekend: day.weekend,
      night: [null, null],
      day: [null, null],
    };

    for (const shift of day.shifts) {
      const shuffledCandidates = shuffle(
        shift.candidateIds,
        `${monthId}:${day.date}:${shift.shiftType}:${shift.candidateIds.join(",")}`,
      );
      const assigned: [string | null, string | null] = [null, null];
      let cursor = 0;

      for (const candidateId of shuffledCandidates) {
        if (cursor >= 2) break;
        if (!canTakeShift(candidateId, day.date, shift.shiftType, assignmentsByMember)) continue;

        assigned[cursor] = nameByMember.get(candidateId) ?? null;
        cursor += 1;

        const memberAssignments = assignmentsByMember.get(candidateId) ?? new Set<string>();
        memberAssignments.add(`${day.date}:${shift.shiftType}`);
        assignmentsByMember.set(candidateId, memberAssignments);
      }

      if (shift.shiftType === "night") {
        slots.night = assigned;
      } else {
        slots.day = assigned;
      }
    }

    return slots;
  });
}
