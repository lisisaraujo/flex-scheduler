import { CompanyMember } from "@/features/auth/domain/types";
import { buildDayOverviews } from "./calendar";
import { MemberAvailability, SchedulerInput, SchedulerMember, SchedulerShiftRequest } from "./types";

function sortUnique(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function buildSchedulerMembers(
  companyMembers: CompanyMember[],
  availabilities: MemberAvailability[],
): SchedulerMember[] {
  const availabilityByMember = new Map(
    availabilities.map((availability) => [
      availability.memberId,
      sortUnique(availability.entries.map((entry) => entry.date)),
    ]),
  );

  const membersWithAvailability = new Set(availabilities.map((availability) => availability.memberId));

  return companyMembers
    .filter((member) => membersWithAvailability.has(member.userId))
    .map((member) => ({
      memberId: member.userId,
      name: member.name,
      email: member.email,
      active: member.schedulingProfile.active,
      maxShifts: member.schedulingProfile.maxShifts,
      preferredCoworkerIds: sortUnique(member.schedulingProfile.preferredCoworkerIds),
      availabilityDates: availabilityByMember.get(member.userId) ?? [],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildSchedulerShiftRequests(
  monthId: string,
  intakeLimitPerShift: number,
  availabilities: MemberAvailability[],
): SchedulerShiftRequest[] {
  return buildDayOverviews(monthId, intakeLimitPerShift, availabilities).flatMap((day) =>
    day.shifts.map((shift) => ({
      shiftId: `${day.date}:${shift.shiftType}`,
      date: day.date,
      shiftType: shift.shiftType,
      capacity: shift.capacity,
      candidateMemberIds: shift.candidateIds.slice(),
    })),
  );
}

export function buildSchedulerInput(input: {
  monthId: string;
  intakeLimitPerShift: number;
  availabilities: MemberAvailability[];
  companyMembers: CompanyMember[];
}): SchedulerInput {
  return {
    monthId: input.monthId,
    members: buildSchedulerMembers(input.companyMembers, input.availabilities),
    shiftRequests: buildSchedulerShiftRequests(input.monthId, input.intakeLimitPerShift, input.availabilities),
  };
}
