import { describe, expect, it } from "vitest";
import { CompanyMember } from "@/features/auth/domain/types";
import { buildSchedulerInput } from "../scheduler-input";
import { createAvailability, createMember, shift } from "./scheduler-fixtures";

function companyMember(member: ReturnType<typeof createMember>): CompanyMember {
  return {
    membershipId: `${member.memberId}-membership`,
    userId: member.memberId,
    companyId: "company-1",
    name: member.name,
    email: member.email ?? `${member.memberId}@example.test`,
    role: "user",
    createdAt: 1,
    schedulingProfile: {
      active: member.active,
      maxShifts: member.maxShifts,
      preferredCoworkerIds: member.preferredCoworkerIds,
    },
  };
}

describe("buildSchedulerInput", () => {
  it("normalizes members, profiles, availability dates, and shift requests", () => {
    const alice = createMember({
      id: "alice",
      name: "Alice",
      maxShifts: 4,
      preferredCoworkerIds: ["bob", "bob"],
    });
    const bob = createMember({ id: "bob", name: "Bob", active: false });
    const clara = createMember({ id: "clara", name: "Clara" });
    const input = buildSchedulerInput({
      monthId: "2026-06",
      intakeLimitPerShift: 6,
      companyMembers: [companyMember(clara), companyMember(bob), companyMember(alice)],
      availabilities: [
        createAvailability(alice, [shift("2026-06-06", "day"), shift("2026-06-01", "night")]),
        createAvailability(bob, [shift("2026-06-01", "night")]),
      ],
    });

    expect(input.members.map((member) => member.name)).toEqual(["Alice", "Bob"]);
    expect(input.members[0]).toMatchObject({
      memberId: "alice",
      active: true,
      maxShifts: 4,
      preferredCoworkerIds: ["bob"],
      availabilityDates: ["2026-06-01", "2026-06-06"],
    });
    expect(input.members[1]).toMatchObject({
      memberId: "bob",
      active: false,
    });
    expect(input.shiftRequests.find((request) => request.shiftId === "2026-06-01:night")).toMatchObject({
      date: "2026-06-01",
      shiftType: "night",
      candidateMemberIds: ["alice", "bob"],
    });
    expect(input.shiftRequests.find((request) => request.shiftId === "2026-06-06:day")).toMatchObject({
      date: "2026-06-06",
      shiftType: "day",
      candidateMemberIds: ["alice"],
    });
  });
});
