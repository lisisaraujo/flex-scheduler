import { generateSchedule } from "../assignment";
import { buildDayOverviews } from "../calendar";
import {
  DaySchedule,
  MemberAvailability,
  SchedulerInput,
  SchedulerMember,
  SchedulerShiftRequest,
  ShiftType,
} from "../types";

const DEFAULT_MONTH_ID = "2026-06";
const DEFAULT_INTAKE_LIMIT = 6;

export function createMember(input: {
  id: string;
  name?: string;
  active?: boolean;
  maxShifts?: number | null;
  preferredCoworkerIds?: string[];
}): SchedulerMember {
  return {
    memberId: input.id,
    name: input.name ?? input.id,
    email: `${input.id}@example.test`,
    active: input.active ?? true,
    maxShifts: input.maxShifts ?? null,
    preferredCoworkerIds: input.preferredCoworkerIds ?? [],
    availabilityDates: [],
  };
}

export function shift(date: string, shiftType: ShiftType) {
  return { date, shiftType };
}

export function createAvailability(
  member: SchedulerMember,
  entries: Array<{ date: string; shiftType: ShiftType }>,
): MemberAvailability {
  return {
    memberId: member.memberId,
    name: member.name,
    email: member.email,
    entries,
    createdAt: 1,
    updatedAt: 1,
  };
}

export function createSchedulerInput(input: {
  monthId?: string;
  intakeLimitPerShift?: number;
  members: SchedulerMember[];
  availabilities: MemberAvailability[];
}): SchedulerInput {
  const monthId = input.monthId ?? DEFAULT_MONTH_ID;
  const intakeLimitPerShift = input.intakeLimitPerShift ?? DEFAULT_INTAKE_LIMIT;
  const availabilityDatesByMember = new Map(
    input.availabilities.map((availability) => [
      availability.memberId,
      Array.from(new Set(availability.entries.map((entry) => entry.date))).sort((left, right) =>
        left.localeCompare(right),
      ),
    ]),
  );

  return {
    monthId,
    members: input.members.map((member) => ({
      ...member,
      availabilityDates: availabilityDatesByMember.get(member.memberId) ?? [],
    })),
    shiftRequests: buildShiftRequests(monthId, intakeLimitPerShift, input.availabilities),
  };
}

export function runScheduler(input: {
  monthId?: string;
  intakeLimitPerShift?: number;
  members: SchedulerMember[];
  availabilities: MemberAvailability[];
}) {
  const monthId = input.monthId ?? DEFAULT_MONTH_ID;
  const intakeLimitPerShift = input.intakeLimitPerShift ?? DEFAULT_INTAKE_LIMIT;
  const schedulerInput = createSchedulerInput({
    monthId,
    intakeLimitPerShift,
    members: input.members,
    availabilities: input.availabilities,
  });

  return generateSchedule({
    monthId,
    intakeLimitPerShift,
    availabilities: input.availabilities,
    schedulerInput,
  });
}

export function rowFor(rows: DaySchedule[], date: string) {
  const row = rows.find((entry) => entry.date === date);
  if (!row) {
    throw new Error(`Missing schedule row for ${date}`);
  }

  return row;
}

export function assignedNames(row: DaySchedule) {
  return [...row.night, ...row.day].filter((name): name is string => Boolean(name));
}

export function countAssignments(rows: DaySchedule[], name: string) {
  return rows.reduce(
    (count, row) => count + [...row.night, ...row.day].filter((assignedName) => assignedName === name).length,
    0,
  );
}

export function namesForShift(row: DaySchedule, shiftType: ShiftType) {
  return row[shiftType].filter((name): name is string => Boolean(name));
}

function buildShiftRequests(
  monthId: string,
  intakeLimitPerShift: number,
  availabilities: MemberAvailability[],
): SchedulerShiftRequest[] {
  return buildDayOverviews(monthId, intakeLimitPerShift, availabilities).flatMap((day) =>
    day.shifts.map((shiftOverview) => ({
      shiftId: `${day.date}:${shiftOverview.shiftType}`,
      date: day.date,
      shiftType: shiftOverview.shiftType,
      capacity: shiftOverview.capacity,
      candidateMemberIds: shiftOverview.candidateIds.slice(),
    })),
  );
}
