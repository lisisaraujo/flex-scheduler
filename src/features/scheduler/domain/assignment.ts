import { buildDayOverviews } from "./calendar";
import {
  DayOverview,
  DaySchedule,
  MemberAvailability,
  SchedulerInput,
  SchedulerMember,
  SchedulerShiftRequest,
  ShiftType,
} from "./types";

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

interface SchedulerState {
  nameByMember: Map<string, string>;
  memberById: Map<string, SchedulerMember>;
  assignmentsByMember: Map<string, Set<string>>;
  assignmentsByShift: Map<string, [string | null, string | null]>;
  assignmentCountByMember: Map<string, number>;
}

interface RankedCandidate {
  memberId: string;
  assignmentCount: number;
  tieBreaker: number;
}

interface CandidatePair {
  pair: [string, string];
  preferenceScore: number;
  fairnessScore: number;
  rankScore: number;
}

function emptyAssignedSlots(): [string | null, string | null] {
  return [null, null];
}

function filledSlotCount(assigned: [string | null, string | null]) {
  return assigned.filter(Boolean).length;
}

function assignedMemberIdsForShift(state: SchedulerState, shiftId: string) {
  return (state.assignmentsByShift.get(shiftId) ?? emptyAssignedSlots()).filter(
    (memberId): memberId is string => Boolean(memberId),
  );
}

function buildSchedulerState(input: {
  availabilities: MemberAvailability[];
  schedulerInput?: SchedulerInput;
}): SchedulerState {
  const members = input.schedulerInput
    ? input.schedulerInput.members
    : input.availabilities.map((availability) => ({
        memberId: availability.memberId,
        name: availability.name,
        email: availability.email,
        active: true,
        maxShifts: null,
        preferredCoworkerIds: [],
        availabilityDates: Array.from(new Set(availability.entries.map((entry) => entry.date))).sort((a, b) =>
          a.localeCompare(b),
        ),
      }));
  const nameByMember = new Map(
    members.map((member) => [member.memberId, member.name]),
  );
  const memberById = new Map(members.map((member) => [member.memberId, member]));
  const assignmentCountByMember = new Map(members.map((member) => [member.memberId, 0]));

  return {
    nameByMember,
    memberById,
    assignmentsByMember: new Map(),
    assignmentsByShift: new Map(),
    assignmentCountByMember,
  };
}

function canTakeShift(
  memberId: string,
  date: string,
  shiftType: ShiftType,
  state: SchedulerState,
) {
  const member = state.memberById.get(memberId);
  if (!member || !member.active) {
    return false;
  }

  const assignmentCount = state.assignmentCountByMember.get(memberId) ?? 0;
  if (member.maxShifts !== null && assignmentCount >= member.maxShifts) {
    return false;
  }

  const existing = state.assignmentsByMember.get(memberId) ?? new Set<string>();

  if (existing.has(`${date}:night`) || existing.has(`${date}:day`)) {
    return false;
  }

  if (shiftType === "day" && existing.has(`${previousDate(date)}:night`)) {
    return false;
  }

  return true;
}

function rankShiftCandidates(monthId: string, shift: SchedulerShiftRequest, state: SchedulerState) {
  const shuffled = shuffle(shift.candidateMemberIds, `${monthId}:${shift.shiftId}:${shift.candidateMemberIds.join(",")}`);

  return shuffled
    .filter((memberId) => state.memberById.has(memberId))
    .map((memberId, index) => ({
      memberId,
      assignmentCount: state.assignmentCountByMember.get(memberId) ?? 0,
      tieBreaker: index,
    }))
    .sort((left, right) => {
      if (left.assignmentCount !== right.assignmentCount) {
        return left.assignmentCount - right.assignmentCount;
      }

      return left.tieBreaker - right.tieBreaker;
    });
}

function findBestSingleCandidateForShift(
  monthId: string,
  shift: SchedulerShiftRequest,
  state: SchedulerState,
  excludedMemberIds: Set<string>,
) {
  const rankedCandidates = rankShiftCandidates(monthId, shift, state);

  return (
    rankedCandidates.find(
      (candidate) =>
        !excludedMemberIds.has(candidate.memberId) &&
        canTakeShift(candidate.memberId, shift.date, shift.shiftType, state),
    )?.memberId ?? null
  );
}

function preferenceScoreForPair(memberA: SchedulerMember, memberB: SchedulerMember) {
  const aPrefersB = memberA.preferredCoworkerIds.includes(memberB.memberId);
  const bPrefersA = memberB.preferredCoworkerIds.includes(memberA.memberId);

  if (aPrefersB && bPrefersA) return 2;
  if (aPrefersB || bPrefersA) return 1;
  return 0;
}

function materializeAssignedNames(
  state: SchedulerState,
  assignedMemberIds: [string | null, string | null],
): [string | null, string | null] {
  return [
    assignedMemberIds[0] ? state.nameByMember.get(assignedMemberIds[0]) ?? null : null,
    assignedMemberIds[1] ? state.nameByMember.get(assignedMemberIds[1]) ?? null : null,
  ];
}

function chooseBestPair(candidates: RankedCandidate[], state: SchedulerState) {
  let bestPair: CandidatePair | null = null;

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const leftMember = state.memberById.get(left.memberId);
      const rightMember = state.memberById.get(right.memberId);
      if (!leftMember || !rightMember) continue;

      const pairScore: CandidatePair = {
        pair: [left.memberId, right.memberId],
        preferenceScore: preferenceScoreForPair(leftMember, rightMember),
        fairnessScore: left.assignmentCount + right.assignmentCount,
        rankScore: left.tieBreaker + right.tieBreaker,
      };

      if (
        !bestPair ||
        pairScore.fairnessScore < bestPair.fairnessScore ||
        (pairScore.fairnessScore === bestPair.fairnessScore &&
          pairScore.preferenceScore > bestPair.preferenceScore) ||
        (pairScore.fairnessScore === bestPair.fairnessScore &&
          pairScore.preferenceScore === bestPair.preferenceScore &&
          pairScore.rankScore < bestPair.rankScore)
      ) {
        bestPair = pairScore;
      }
    }
  }

  return bestPair?.pair ?? null;
}

function assignMemberToShift(state: SchedulerState, shift: SchedulerShiftRequest, memberId: string, slotIndex: 0 | 1) {
  const currentAssignments = state.assignmentsByShift.get(shift.shiftId) ?? emptyAssignedSlots();
  currentAssignments[slotIndex] = memberId;
  state.assignmentsByShift.set(shift.shiftId, currentAssignments);

  const memberAssignments = state.assignmentsByMember.get(memberId) ?? new Set<string>();
  memberAssignments.add(`${shift.date}:${shift.shiftType}`);
  state.assignmentsByMember.set(memberId, memberAssignments);
  state.assignmentCountByMember.set(memberId, (state.assignmentCountByMember.get(memberId) ?? 0) + 1);
}

function removeMemberFromShift(state: SchedulerState, shiftId: string, memberId: string) {
  const currentAssignments = state.assignmentsByShift.get(shiftId) ?? emptyAssignedSlots();
  const nextAssignments = currentAssignments.filter((assignedMemberId) => assignedMemberId && assignedMemberId !== memberId);
  const compacted: [string | null, string | null] = [nextAssignments[0] ?? null, nextAssignments[1] ?? null];
  state.assignmentsByShift.set(shiftId, compacted);

  const memberAssignments = state.assignmentsByMember.get(memberId) ?? new Set<string>();
  memberAssignments.delete(shiftId);
  state.assignmentsByMember.set(memberId, memberAssignments);
  state.assignmentCountByMember.set(memberId, Math.max(0, (state.assignmentCountByMember.get(memberId) ?? 1) - 1));
}

function fillShiftSlots(monthId: string, shift: SchedulerShiftRequest, state: SchedulerState) {
  const rankedCandidates = rankShiftCandidates(monthId, shift, state);
  const validCandidates = rankedCandidates.filter((candidate) =>
    canTakeShift(candidate.memberId, shift.date, shift.shiftType, state),
  );

  if (validCandidates.length === 0) {
    return emptyAssignedSlots();
  }

  if (validCandidates.length === 1) {
    assignMemberToShift(state, shift, validCandidates[0].memberId, 0);
    return state.assignmentsByShift.get(shift.shiftId) ?? emptyAssignedSlots();
  }

  const preferredPair = chooseBestPair(validCandidates, state);
  if (preferredPair) {
    assignMemberToShift(state, shift, preferredPair[0], 0);
    assignMemberToShift(state, shift, preferredPair[1], 1);
    return state.assignmentsByShift.get(shift.shiftId) ?? emptyAssignedSlots();
  }

  let slotIndex: 0 | 1 = 0;
  for (const candidate of validCandidates) {
    assignMemberToShift(state, shift, candidate.memberId, slotIndex);
    if (slotIndex === 1) break;
    slotIndex = 1;
  }

  return state.assignmentsByShift.get(shift.shiftId) ?? emptyAssignedSlots();
}

function buildShiftRequestMap(schedulerInput: SchedulerInput) {
  return new Map(schedulerInput.shiftRequests.map((shift) => [shift.shiftId, shift]));
}

function prioritizeShiftsForRebalance(schedulerInput: SchedulerInput, state: SchedulerState) {
  return schedulerInput.shiftRequests
    .map((shift) => ({
      shift,
      filledSlots: filledSlotCount(state.assignmentsByShift.get(shift.shiftId) ?? emptyAssignedSlots()),
      candidateCount: shift.candidateMemberIds.length,
    }))
    .sort((left, right) => {
      if (left.filledSlots !== right.filledSlots) {
        return left.filledSlots - right.filledSlots;
      }

      if (left.candidateCount !== right.candidateCount) {
        return left.candidateCount - right.candidateCount;
      }

      return left.shift.shiftId.localeCompare(right.shift.shiftId);
    });
}

function tryRebalanceCandidate(
  monthId: string,
  targetShift: SchedulerShiftRequest,
  candidateId: string,
  state: SchedulerState,
  shiftRequests: Map<string, SchedulerShiftRequest>,
) {
  const assignedShiftIds = Array.from(state.assignmentsByMember.get(candidateId) ?? []);
  const targetFilledBefore = filledSlotCount(state.assignmentsByShift.get(targetShift.shiftId) ?? emptyAssignedSlots());

  for (const donorShiftId of assignedShiftIds) {
    if (donorShiftId === targetShift.shiftId) continue;

    const donorShift = shiftRequests.get(donorShiftId);
    if (!donorShift) continue;

    const donorAssignments = state.assignmentsByShift.get(donorShiftId) ?? emptyAssignedSlots();
    const donorFilledBefore = filledSlotCount(donorAssignments);
    if (donorFilledBefore < 2) continue;
    const donorSlotIndex = donorAssignments[0] === candidateId ? 0 : 1;

    removeMemberFromShift(state, donorShiftId, candidateId);

    if (canTakeShift(candidateId, targetShift.date, targetShift.shiftType, state)) {
      const targetAssignments = state.assignmentsByShift.get(targetShift.shiftId) ?? emptyAssignedSlots();
      const slotIndex: 0 | 1 = targetAssignments[0] === null ? 0 : 1;
      assignMemberToShift(state, targetShift, candidateId, slotIndex);

       const donorAssignedMemberIds = new Set(assignedMemberIdsForShift(state, donorShiftId));
       donorAssignedMemberIds.add(candidateId);
       const donorReplacement = findBestSingleCandidateForShift(monthId, donorShift, state, donorAssignedMemberIds);
       if (donorReplacement) {
         assignMemberToShift(state, donorShift, donorReplacement, donorSlotIndex);
         return true;
       }

       if (targetFilledBefore === 0) {
         return true;
       }

       removeMemberFromShift(state, targetShift.shiftId, candidateId);
       assignMemberToShift(state, donorShift, candidateId, donorSlotIndex);
       continue;
    }

    assignMemberToShift(
      state,
      donorShift,
      candidateId,
      donorSlotIndex,
    );
  }

  return false;
}

function rebalanceUnderfilledShifts(
  monthId: string,
  schedulerInput: SchedulerInput,
  state: SchedulerState,
  shiftRequests: Map<string, SchedulerShiftRequest>,
) {
  const prioritizedShifts = prioritizeShiftsForRebalance(schedulerInput, state);

  for (const target of prioritizedShifts) {
    const targetShift = target.shift;
    let targetAssignments = state.assignmentsByShift.get(targetShift.shiftId) ?? emptyAssignedSlots();

    while (filledSlotCount(targetAssignments) < 2) {
      const rankedCandidates = rankShiftCandidates(monthId, targetShift, state);
      const openSlotFilled = rankedCandidates.some((candidate) =>
        tryRebalanceCandidate(monthId, targetShift, candidate.memberId, state, shiftRequests),
      );

      if (!openSlotFilled) break;
      targetAssignments = state.assignmentsByShift.get(targetShift.shiftId) ?? emptyAssignedSlots();
    }
  }
}

function buildFallbackSchedulerInput(
  monthId: string,
  intakeLimitPerShift: number,
  availabilities: MemberAvailability[],
): SchedulerInput {
  const days = buildDayOverviews(monthId, intakeLimitPerShift, availabilities);

  return {
    monthId,
    members: availabilities.map((availability) => ({
      memberId: availability.memberId,
      name: availability.name,
      email: availability.email,
      active: true,
      maxShifts: null,
      preferredCoworkerIds: [],
      availabilityDates: Array.from(new Set(availability.entries.map((entry) => entry.date))).sort((a, b) =>
        a.localeCompare(b),
      ),
    })),
    shiftRequests: days.flatMap((day) =>
      day.shifts.map((shift) => ({
        shiftId: `${day.date}:${shift.shiftType}`,
        date: day.date,
        shiftType: shift.shiftType,
        capacity: shift.capacity,
        candidateMemberIds: shift.candidateIds.slice(),
      })),
    ),
  };
}

function assignInitialSchedule(
  days: DayOverview[],
  shiftRequests: Map<string, SchedulerShiftRequest>,
  state: SchedulerState,
  monthId: string,
) {
  for (const day of days) {
    for (const shift of day.shifts) {
      const shiftRequest = shiftRequests.get(`${day.date}:${shift.shiftType}`);
      if (!shiftRequest) continue;
      fillShiftSlots(monthId, shiftRequest, state);
    }
  }
}

function buildScheduleRows(days: DayOverview[], state: SchedulerState): DaySchedule[] {
  return days.map((day) => {
    const nightAssigned = materializeAssignedNames(
      state,
      state.assignmentsByShift.get(`${day.date}:night`) ?? emptyAssignedSlots(),
    );
    const dayAssigned = materializeAssignedNames(
      state,
      state.assignmentsByShift.get(`${day.date}:day`) ?? emptyAssignedSlots(),
    );

    return {
      date: day.date,
      weekdayLabel: day.weekdayLabel,
      weekend: day.weekend,
      night: nightAssigned,
      day: dayAssigned,
    };
  });
}

export function generateSchedule(
  input:
    | {
        monthId: string;
        intakeLimitPerShift: number;
        availabilities: MemberAvailability[];
      }
    | {
        monthId: string;
        intakeLimitPerShift: number;
        availabilities: MemberAvailability[];
        schedulerInput: SchedulerInput;
      },
): DaySchedule[] {
  const { monthId, intakeLimitPerShift, availabilities } = input;
  const schedulerInput = "schedulerInput" in input
    ? input.schedulerInput
    : buildFallbackSchedulerInput(monthId, intakeLimitPerShift, availabilities);
  const state = buildSchedulerState({
    availabilities,
    schedulerInput,
  });
  const shiftRequests = buildShiftRequestMap(schedulerInput);
  const days = buildDayOverviews(monthId, intakeLimitPerShift, availabilities);
  assignInitialSchedule(days, shiftRequests, state, monthId);
  rebalanceUnderfilledShifts(monthId, schedulerInput, state, shiftRequests);
  return buildScheduleRows(days, state);
}
