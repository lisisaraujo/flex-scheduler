import { describe, expect, it } from "vitest";
import {
  assignedNames,
  countAssignments,
  createAvailability,
  createMember,
  namesForShift,
  rowFor,
  runScheduler,
  shift,
} from "./scheduler-fixtures";

describe("generateSchedule availability handling", () => {
  it("leaves shifts empty when there are no candidates", () => {
    const rows = runScheduler({
      members: [],
      availabilities: [],
    });

    expect(rowFor(rows, "2026-06-01").night).toEqual([null, null]);
  });

  it("assigns one available candidate and leaves the second slot empty", () => {
    const alice = createMember({ id: "alice", name: "Alice" });
    const rows = runScheduler({
      members: [alice],
      availabilities: [createAvailability(alice, [shift("2026-06-01", "night")])],
    });

    expect(rowFor(rows, "2026-06-01").night).toEqual(["Alice", null]);
  });

  it("assigns exactly two available candidates to a shift", () => {
    const alice = createMember({ id: "alice", name: "Alice" });
    const bob = createMember({ id: "bob", name: "Bob" });
    const rows = runScheduler({
      members: [alice, bob],
      availabilities: [
        createAvailability(alice, [shift("2026-06-01", "night")]),
        createAvailability(bob, [shift("2026-06-01", "night")]),
      ],
    });

    expect(new Set(rowFor(rows, "2026-06-01").night)).toEqual(new Set(["Alice", "Bob"]));
  });

  it("fills only two slots when multiple candidates are available", () => {
    const members = ["alice", "bob", "cara", "dan"].map((id) => createMember({ id, name: id }));
    const rows = runScheduler({
      members,
      availabilities: members.map((member) => createAvailability(member, [shift("2026-06-01", "night")])),
    });

    const assigned = namesForShift(rowFor(rows, "2026-06-01"), "night");
    expect(assigned).toHaveLength(2);
    expect(assigned.every((name) => members.some((member) => member.name === name))).toBe(true);
  });
});

describe("generateSchedule constraints", () => {
  it("does not assign inactive members", () => {
    const alice = createMember({ id: "alice", name: "Alice", active: false });
    const rows = runScheduler({
      members: [alice],
      availabilities: [createAvailability(alice, [shift("2026-06-01", "night")])],
    });

    expect(rowFor(rows, "2026-06-01").night).toEqual([null, null]);
  });

  it("respects max shifts", () => {
    const alice = createMember({ id: "alice", name: "Alice", maxShifts: 1 });
    const bob = createMember({ id: "bob", name: "Bob" });
    const rows = runScheduler({
      members: [alice, bob],
      availabilities: [
        createAvailability(alice, [shift("2026-06-01", "night"), shift("2026-06-02", "night")]),
        createAvailability(bob, [shift("2026-06-02", "night")]),
      ],
    });

    expect(countAssignments(rows, "Alice")).toBe(1);
    expect(namesForShift(rowFor(rows, "2026-06-02"), "night")).toContain("Bob");
  });

  it("does not assign the same member to day and night on the same day", () => {
    const alice = createMember({ id: "alice", name: "Alice" });
    const bob = createMember({ id: "bob", name: "Bob" });
    const rows = runScheduler({
      members: [alice, bob],
      availabilities: [
        createAvailability(alice, [shift("2026-06-06", "night"), shift("2026-06-06", "day")]),
        createAvailability(bob, [shift("2026-06-06", "day")]),
      ],
    });

    const saturday = rowFor(rows, "2026-06-06");
    expect(namesForShift(saturday, "night")).toContain("Alice");
    expect(namesForShift(saturday, "day")).not.toContain("Alice");
    expect(namesForShift(saturday, "day")).toContain("Bob");
  });

  it("does not assign a day shift after a previous-night shift", () => {
    const alice = createMember({ id: "alice", name: "Alice" });
    const bob = createMember({ id: "bob", name: "Bob" });
    const cara = createMember({ id: "cara", name: "Cara" });
    const rows = runScheduler({
      members: [alice, bob, cara],
      availabilities: [
        createAvailability(alice, [shift("2026-06-06", "night"), shift("2026-06-07", "day")]),
        createAvailability(bob, [shift("2026-06-07", "day")]),
        createAvailability(cara, [shift("2026-06-07", "day")]),
      ],
    });

    expect(namesForShift(rowFor(rows, "2026-06-06"), "night")).toContain("Alice");
    expect(namesForShift(rowFor(rows, "2026-06-07"), "day")).not.toContain("Alice");
    expect(namesForShift(rowFor(rows, "2026-06-07"), "day")).toContain("Bob");
  });

  it("never assigns someone outside their submitted availability", () => {
    const alice = createMember({ id: "alice", name: "Alice" });
    const bob = createMember({ id: "bob", name: "Bob" });
    const rows = runScheduler({
      members: [alice, bob],
      availabilities: [
        createAvailability(alice, [shift("2026-06-01", "night")]),
        createAvailability(bob, [shift("2026-06-02", "night")]),
      ],
    });

    expect(namesForShift(rowFor(rows, "2026-06-01"), "night")).not.toContain("Bob");
    expect(namesForShift(rowFor(rows, "2026-06-02"), "night")).not.toContain("Alice");
  });
});

describe("generateSchedule coworker preferences", () => {
  it("prefers a mutual coworker pair among equally fair candidates", () => {
    const alice = createMember({ id: "alice", name: "Alice", preferredCoworkerIds: ["bob"] });
    const bob = createMember({ id: "bob", name: "Bob", preferredCoworkerIds: ["alice"] });
    const cara = createMember({ id: "cara", name: "Cara" });
    const rows = runScheduler({
      members: [alice, bob, cara],
      availabilities: [alice, bob, cara].map((member) =>
        createAvailability(member, [shift("2026-06-01", "night")]),
      ),
    });

    expect(new Set(namesForShift(rowFor(rows, "2026-06-01"), "night"))).toEqual(new Set(["Alice", "Bob"]));
  });

  it("prefers a one-way coworker pair among equally fair candidates", () => {
    const alice = createMember({ id: "alice", name: "Alice", preferredCoworkerIds: ["bob"] });
    const bob = createMember({ id: "bob", name: "Bob" });
    const cara = createMember({ id: "cara", name: "Cara" });
    const rows = runScheduler({
      members: [alice, bob, cara],
      availabilities: [alice, bob, cara].map((member) =>
        createAvailability(member, [shift("2026-06-01", "night")]),
      ),
    });

    expect(new Set(namesForShift(rowFor(rows, "2026-06-01"), "night"))).toEqual(new Set(["Alice", "Bob"]));
  });

  it("prioritizes fairness before coworker preference", () => {
    const alice = createMember({ id: "alice", name: "Alice", preferredCoworkerIds: ["bob"] });
    const bob = createMember({ id: "bob", name: "Bob", preferredCoworkerIds: ["alice"] });
    const cara = createMember({ id: "cara", name: "Cara" });
    const dan = createMember({ id: "dan", name: "Dan" });
    const rows = runScheduler({
      members: [alice, bob, cara, dan],
      availabilities: [
        createAvailability(alice, [shift("2026-06-01", "night"), shift("2026-06-02", "night")]),
        createAvailability(bob, [shift("2026-06-02", "night")]),
        createAvailability(cara, [shift("2026-06-02", "night")]),
        createAvailability(dan, [shift("2026-06-02", "night")]),
      ],
    });

    expect(new Set(namesForShift(rowFor(rows, "2026-06-02"), "night"))).not.toEqual(new Set(["Alice", "Bob"]));
  });
});

describe("generateSchedule rebalancing", () => {
  it("moves a candidate from a fully staffed shift to fill an empty scarce shift", () => {
    const alice = createMember({ id: "alice", name: "Alice", maxShifts: 1 });
    const bob = createMember({ id: "bob", name: "Bob" });
    const rows = runScheduler({
      members: [alice, bob],
      availabilities: [
        createAvailability(alice, [shift("2026-06-01", "night"), shift("2026-06-02", "night")]),
        createAvailability(bob, [shift("2026-06-01", "night")]),
      ],
    });

    expect(namesForShift(rowFor(rows, "2026-06-01"), "night")).toContain("Bob");
    expect(namesForShift(rowFor(rows, "2026-06-02"), "night")).toContain("Alice");
  });

  it("preserves hard constraints while rebalancing", () => {
    const alice = createMember({ id: "alice", name: "Alice", maxShifts: 1 });
    const bob = createMember({ id: "bob", name: "Bob" });
    const rows = runScheduler({
      members: [alice, bob],
      availabilities: [
        createAvailability(alice, [shift("2026-06-01", "night"), shift("2026-06-02", "night")]),
        createAvailability(bob, [shift("2026-06-01", "night")]),
      ],
    });

    expect(namesForShift(rowFor(rows, "2026-06-02"), "night")).toContain("Alice");
    expect(countAssignments(rows, "Alice")).toBeLessThanOrEqual(1);
  });
});

describe("generateSchedule determinism and regression coverage", () => {
  it("produces identical output for identical inputs", () => {
    const members = ["alice", "bob", "cara", "dan", "erin"].map((id) => createMember({ id, name: id }));
    const availabilities = members.map((member, index) =>
      createAvailability(member, [
        shift("2026-06-01", "night"),
        shift("2026-06-02", "night"),
        ...(index % 2 === 0 ? [shift("2026-06-06", "day" as const)] : []),
      ]),
    );

    const first = runScheduler({ members, availabilities });
    const repeated = Array.from({ length: 5 }, () => runScheduler({ members, availabilities }));

    expect(repeated).toEqual([first, first, first, first, first]);
  });

  it("protects a realistic month-sized scheduling scenario", () => {
    const anna = createMember({ id: "anna", name: "Anna", maxShifts: 7, preferredCoworkerIds: ["ben"] });
    const ben = createMember({ id: "ben", name: "Ben", maxShifts: 7, preferredCoworkerIds: ["anna"] });
    const clara = createMember({ id: "clara", name: "Clara", maxShifts: 6 });
    const david = createMember({ id: "david", name: "David", maxShifts: 6, preferredCoworkerIds: ["eva"] });
    const eva = createMember({ id: "eva", name: "Eva", maxShifts: 6 });
    const felix = createMember({ id: "felix", name: "Felix", maxShifts: 5 });
    const members = [anna, ben, clara, david, eva, felix];
    const rows = runScheduler({
      members,
      availabilities: [
        createAvailability(anna, [
          shift("2026-06-01", "night"),
          shift("2026-06-03", "night"),
          shift("2026-06-06", "day"),
          shift("2026-06-10", "night"),
          shift("2026-06-13", "night"),
          shift("2026-06-20", "day"),
          shift("2026-06-27", "night"),
        ]),
        createAvailability(ben, [
          shift("2026-06-01", "night"),
          shift("2026-06-04", "night"),
          shift("2026-06-06", "day"),
          shift("2026-06-11", "night"),
          shift("2026-06-13", "night"),
          shift("2026-06-21", "day"),
          shift("2026-06-27", "night"),
        ]),
        createAvailability(clara, [
          shift("2026-06-02", "night"),
          shift("2026-06-05", "night"),
          shift("2026-06-07", "day"),
          shift("2026-06-12", "night"),
          shift("2026-06-14", "day"),
          shift("2026-06-22", "night"),
          shift("2026-06-28", "day"),
        ]),
        createAvailability(david, [
          shift("2026-06-02", "night"),
          shift("2026-06-06", "night"),
          shift("2026-06-07", "day"),
          shift("2026-06-15", "night"),
          shift("2026-06-20", "day"),
          shift("2026-06-23", "night"),
          shift("2026-06-28", "day"),
        ]),
        createAvailability(eva, [
          shift("2026-06-03", "night"),
          shift("2026-06-06", "night"),
          shift("2026-06-08", "night"),
          shift("2026-06-14", "day"),
          shift("2026-06-20", "day"),
          shift("2026-06-24", "night"),
          shift("2026-06-28", "day"),
        ]),
        createAvailability(felix, [
          shift("2026-06-04", "night"),
          shift("2026-06-05", "night"),
          shift("2026-06-08", "night"),
          shift("2026-06-11", "night"),
          shift("2026-06-21", "day"),
          shift("2026-06-24", "night"),
          shift("2026-06-27", "night"),
        ]),
      ],
    });

    const totalAssignments = rows.reduce((sum, row) => sum + assignedNames(row).length, 0);
    expect(totalAssignments).toBe(22);
    expect(countAssignments(rows, "Anna")).toBeLessThanOrEqual(7);
    expect(countAssignments(rows, "Felix")).toBeLessThanOrEqual(5);
    expect(namesForShift(rowFor(rows, "2026-06-06"), "day")).toContain("Anna");
    for (const row of rows) {
      expect(namesForShift(row, "night")).toHaveLength(new Set(namesForShift(row, "night")).size);
      expect(namesForShift(row, "day")).toHaveLength(new Set(namesForShift(row, "day")).size);
      expect(assignedNames(row)).toHaveLength(new Set(assignedNames(row)).size);
    }
  });
});
