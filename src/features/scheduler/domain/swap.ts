import { DaySchedule, ShiftSlotRef } from "./types";

function slotIds(row: DaySchedule, shiftType: ShiftSlotRef["shiftType"]) {
  return shiftType === "night" ? row.nightIds : row.dayIds;
}

function slotNames(row: DaySchedule, shiftType: ShiftSlotRef["shiftType"]) {
  return shiftType === "night" ? row.night : row.day;
}

export function isSameSlot(left: ShiftSlotRef, right: ShiftSlotRef) {
  return left.date === right.date && left.shiftType === right.shiftType && left.slot === right.slot;
}

export function findAssignedMemberId(assignments: DaySchedule[], ref: ShiftSlotRef): string | null {
  const row = assignments.find((assignment) => assignment.date === ref.date);
  if (!row) return null;
  return slotIds(row, ref.shiftType)[ref.slot] ?? null;
}

export function validateSwapProposal(input: {
  assignments: DaySchedule[];
  requesterId: string;
  requesteeId: string;
  requesterShift: ShiftSlotRef;
  requesteeShift: ShiftSlotRef;
  now?: number;
}) {
  if (input.requesterId === input.requesteeId) {
    throw new Error("You cannot propose a swap with yourself");
  }

  if (isSameSlot(input.requesterShift, input.requesteeShift)) {
    throw new Error("Choose two different shifts to swap");
  }

  const today = new Date(input.now ?? Date.now()).toISOString().slice(0, 10);
  for (const ref of [input.requesterShift, input.requesteeShift]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ref.date)) {
      throw new Error(`Invalid date: ${ref.date}`);
    }
    if (ref.date < today) {
      throw new Error(`Cannot propose a swap for ${ref.date} because that date has already passed`);
    }
  }

  if (findAssignedMemberId(input.assignments, input.requesterShift) !== input.requesterId) {
    throw new Error("You are not assigned to the shift you want to give up");
  }

  if (findAssignedMemberId(input.assignments, input.requesteeShift) !== input.requesteeId) {
    throw new Error("The selected teammate is not assigned to that shift");
  }
}

function withSlotValue(
  row: DaySchedule,
  ref: ShiftSlotRef,
  value: { id: string | null; name: string | null },
): DaySchedule {
  const nextIds = [...slotIds(row, ref.shiftType)] as [string | null, string | null];
  const nextNames = [...slotNames(row, ref.shiftType)] as [string | null, string | null];
  nextIds[ref.slot] = value.id;
  nextNames[ref.slot] = value.name;

  return ref.shiftType === "night"
    ? { ...row, nightIds: nextIds, night: nextNames }
    : { ...row, dayIds: nextIds, day: nextNames };
}

export function applySwap(
  assignments: DaySchedule[],
  requesterShift: ShiftSlotRef,
  requesteeShift: ShiftSlotRef,
): DaySchedule[] {
  const requesterRow = assignments.find((row) => row.date === requesterShift.date);
  const requesteeRow = assignments.find((row) => row.date === requesteeShift.date);
  if (!requesterRow || !requesteeRow) {
    throw new Error("The shifts being swapped no longer exist in the schedule");
  }

  const requesterValue = {
    id: slotIds(requesterRow, requesterShift.shiftType)[requesterShift.slot] ?? null,
    name: slotNames(requesterRow, requesterShift.shiftType)[requesterShift.slot] ?? null,
  };
  const requesteeValue = {
    id: slotIds(requesteeRow, requesteeShift.shiftType)[requesteeShift.slot] ?? null,
    name: slotNames(requesteeRow, requesteeShift.shiftType)[requesteeShift.slot] ?? null,
  };

  return assignments.map((row) => {
    let next = row;
    if (row.date === requesterShift.date) {
      next = withSlotValue(next, requesterShift, requesteeValue);
    }
    if (row.date === requesteeShift.date) {
      next = withSlotValue(next, requesteeShift, requesterValue);
    }
    return next;
  });
}
