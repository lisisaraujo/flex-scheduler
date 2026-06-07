import { describe, expect, it } from "vitest";
import { applySwap, findAssignedMemberId, isSameSlot, validateSwapProposal } from "../swap";
import { DaySchedule, ShiftSlotRef } from "../types";

function row(input: {
  date: string;
  weekend?: boolean;
  night?: [string | null, string | null];
  nightIds?: [string | null, string | null];
  day?: [string | null, string | null];
  dayIds?: [string | null, string | null];
}): DaySchedule {
  return {
    date: input.date,
    weekdayLabel: input.date,
    weekend: input.weekend ?? false,
    night: input.night ?? [null, null],
    day: input.day ?? [null, null],
    nightIds: input.nightIds ?? input.night ?? [null, null],
    dayIds: input.dayIds ?? input.day ?? [null, null],
  };
}

function ref(date: string, shiftType: ShiftSlotRef["shiftType"], slot: 0 | 1): ShiftSlotRef {
  return { date, shiftType, slot };
}

const FIXED_NOW = new Date("2026-06-01T00:00:00Z").getTime();

function baseAssignments(): DaySchedule[] {
  return [
    row({
      date: "2026-06-08",
      weekend: true,
      night: ["Alice", "Bob"],
      nightIds: ["alice", "bob"],
      day: ["Cara", "Dan"],
      dayIds: ["cara", "dan"],
    }),
    row({
      date: "2026-06-09",
      night: ["Cara", null],
      nightIds: ["cara", null],
    }),
  ];
}

describe("isSameSlot", () => {
  it("returns true only when date, shiftType and slot all match", () => {
    expect(isSameSlot(ref("2026-06-08", "night", 0), ref("2026-06-08", "night", 0))).toBe(true);
    expect(isSameSlot(ref("2026-06-08", "night", 0), ref("2026-06-08", "night", 1))).toBe(false);
    expect(isSameSlot(ref("2026-06-08", "night", 0), ref("2026-06-08", "day", 0))).toBe(false);
    expect(isSameSlot(ref("2026-06-08", "night", 0), ref("2026-06-09", "night", 0))).toBe(false);
  });
});

describe("findAssignedMemberId", () => {
  it("returns the member id assigned to a slot", () => {
    const assignments = baseAssignments();
    expect(findAssignedMemberId(assignments, ref("2026-06-08", "night", 0))).toBe("alice");
    expect(findAssignedMemberId(assignments, ref("2026-06-08", "day", 1))).toBe("dan");
  });

  it("returns null for empty slots or missing dates", () => {
    const assignments = baseAssignments();
    expect(findAssignedMemberId(assignments, ref("2026-06-09", "night", 1))).toBeNull();
    expect(findAssignedMemberId(assignments, ref("2026-06-30", "night", 0))).toBeNull();
  });
});

describe("validateSwapProposal", () => {
  it("accepts a valid proposal between two assigned members on different shifts", () => {
    const assignments = baseAssignments();
    expect(() =>
      validateSwapProposal({
        assignments,
        requesterId: "alice",
        requesteeId: "cara",
        requesterShift: ref("2026-06-08", "night", 0),
        requesteeShift: ref("2026-06-09", "night", 0),
        now: FIXED_NOW,
      }),
    ).not.toThrow();
  });

  it("rejects proposing a swap with yourself", () => {
    const assignments = baseAssignments();
    expect(() =>
      validateSwapProposal({
        assignments,
        requesterId: "alice",
        requesteeId: "alice",
        requesterShift: ref("2026-06-08", "night", 0),
        requesteeShift: ref("2026-06-09", "night", 0),
        now: FIXED_NOW,
      }),
    ).toThrow("You cannot propose a swap with yourself");
  });

  it("rejects proposing the same slot for both sides", () => {
    const assignments = baseAssignments();
    expect(() =>
      validateSwapProposal({
        assignments,
        requesterId: "alice",
        requesteeId: "bob",
        requesterShift: ref("2026-06-08", "night", 0),
        requesteeShift: ref("2026-06-08", "night", 0),
        now: FIXED_NOW,
      }),
    ).toThrow("Choose two different shifts to swap");
  });

  it("rejects malformed dates", () => {
    const assignments = baseAssignments();
    expect(() =>
      validateSwapProposal({
        assignments,
        requesterId: "alice",
        requesteeId: "cara",
        requesterShift: ref("not-a-date", "night", 0),
        requesteeShift: ref("2026-06-09", "night", 0),
        now: FIXED_NOW,
      }),
    ).toThrow("Invalid date: not-a-date");
  });

  it("rejects swaps for dates that have already passed", () => {
    const assignments = baseAssignments();
    expect(() =>
      validateSwapProposal({
        assignments,
        requesterId: "alice",
        requesteeId: "cara",
        requesterShift: ref("2026-05-01", "night", 0),
        requesteeShift: ref("2026-06-09", "night", 0),
        now: FIXED_NOW,
      }),
    ).toThrow("Cannot propose a swap for 2026-05-01 because that date has already passed");
  });

  it("rejects when the requester is not assigned to the claimed shift", () => {
    const assignments = baseAssignments();
    expect(() =>
      validateSwapProposal({
        assignments,
        requesterId: "alice",
        requesteeId: "cara",
        requesterShift: ref("2026-06-08", "night", 1),
        requesteeShift: ref("2026-06-09", "night", 0),
        now: FIXED_NOW,
      }),
    ).toThrow("You are not assigned to the shift you want to give up");
  });

  it("rejects when the requestee is not assigned to the claimed shift", () => {
    const assignments = baseAssignments();
    expect(() =>
      validateSwapProposal({
        assignments,
        requesterId: "alice",
        requesteeId: "cara",
        requesterShift: ref("2026-06-08", "night", 0),
        requesteeShift: ref("2026-06-09", "night", 1),
        now: FIXED_NOW,
      }),
    ).toThrow("The selected teammate is not assigned to that shift");
  });
});

describe("applySwap", () => {
  it("exchanges the assigned member id and name between two slots on different dates", () => {
    const assignments = baseAssignments();
    const next = applySwap(assignments, ref("2026-06-08", "night", 0), ref("2026-06-09", "night", 0));

    const requesterRow = next.find((entry) => entry.date === "2026-06-08")!;
    const requesteeRow = next.find((entry) => entry.date === "2026-06-09")!;

    expect(requesterRow.nightIds).toEqual(["cara", "bob"]);
    expect(requesterRow.night).toEqual(["Cara", "Bob"]);
    expect(requesteeRow.nightIds).toEqual(["alice", null]);
    expect(requesteeRow.night).toEqual(["Alice", null]);
  });

  it("exchanges slots within the same date without losing the other slot's value", () => {
    const assignments = baseAssignments();
    const next = applySwap(assignments, ref("2026-06-08", "night", 0), ref("2026-06-08", "day", 1));

    const updatedRow = next.find((entry) => entry.date === "2026-06-08")!;
    expect(updatedRow.nightIds).toEqual(["dan", "bob"]);
    expect(updatedRow.night).toEqual(["Dan", "Bob"]);
    expect(updatedRow.dayIds).toEqual(["cara", "alice"]);
    expect(updatedRow.day).toEqual(["Cara", "Alice"]);
  });

  it("leaves rows for other dates untouched", () => {
    const assignments = baseAssignments();
    const next = applySwap(assignments, ref("2026-06-08", "night", 0), ref("2026-06-09", "night", 0));
    const untouchedOriginal = assignments.find((entry) => entry.date === "2026-06-08")!;
    const untouchedNext = next.find((entry) => entry.date === "2026-06-08")!;
    expect(untouchedNext.dayIds).toEqual(untouchedOriginal.dayIds);
    expect(untouchedNext.day).toEqual(untouchedOriginal.day);
  });

  it("throws when a referenced date no longer exists in the schedule", () => {
    const assignments = baseAssignments();
    expect(() => applySwap(assignments, ref("2026-06-08", "night", 0), ref("2026-06-30", "night", 0))).toThrow(
      "The shifts being swapped no longer exist in the schedule",
    );
  });
});
