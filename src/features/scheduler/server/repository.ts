import { SessionUser } from "@/features/auth/domain/types";
import { buildDayOverviews, selectableShifts } from "@/features/scheduler/domain/calendar";
import { generateSchedule } from "@/features/scheduler/domain/assignment";
import {
  AvailabilityEntry,
  DaySchedule,
  MemberAvailability,
  MonthDoc,
  MonthSnapshot,
  MonthStatus,
} from "@/features/scheduler/domain/types";
import { getDb } from "./db";

function monthCollection(companyId: string, monthId: string) {
  return getDb().collection("companies").doc(companyId).collection("calendars").doc(monthId);
}

function dedupeEntries(entries: AvailabilityEntry[]) {
  const map = new Map<string, AvailabilityEntry>();
  for (const entry of entries) {
    map.set(entry.date, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function validateEntries(entries: AvailabilityEntry[]) {
  const seenDates = new Set<string>();

  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      throw new Error(`Invalid date: ${entry.date}`);
    }

    if (!selectableShifts(entry.date).includes(entry.shiftType)) {
      throw new Error(`Shift ${entry.shiftType} is not allowed for ${entry.date}`);
    }

    if (seenDates.has(entry.date)) {
      throw new Error(`Only one shift can be selected per day: ${entry.date}`);
    }

    seenDates.add(entry.date);
  }
}

function sortStatuses(months: MonthDoc[]) {
  const statusOrder: Record<MonthStatus, number> = {
    draft: 0,
    open: 1,
    closed: 2,
    scheduled: 3,
  };

  return months.sort((left, right) => {
    if (left.monthId !== right.monthId) {
      return right.monthId.localeCompare(left.monthId);
    }

    return statusOrder[left.status] - statusOrder[right.status];
  });
}

export async function listMonths(companyId: string) {
  const snapshot = await getDb().collection("companies").doc(companyId).collection("calendars").get();
  return sortStatuses(snapshot.docs.map((doc) => doc.data() as MonthDoc));
}

export async function createMonth(input: {
  companyId: string;
  monthId: string;
  orgName: string;
  timezone: string;
  deadlineAt: number;
  intakeLimitPerShift: number;
}) {
  const monthId = input.monthId.trim();
  if (!/^\d{4}-\d{2}$/.test(monthId)) {
    throw new Error("monthId must use yyyy-mm format");
  }

  const ref = monthCollection(input.companyId, monthId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new Error(`Month ${monthId} already exists`);
  }

  const now = Date.now();
  const doc: MonthDoc = {
    companyId: input.companyId,
    monthId,
    orgName: input.orgName.trim(),
    timezone: input.timezone.trim() || "Europe/Berlin",
    deadlineAt: input.deadlineAt,
    intakeLimitPerShift: input.intakeLimitPerShift,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(doc);
  return doc;
}

async function readMonth(companyId: string, monthId: string) {
  const ref = monthCollection(companyId, monthId);
  const monthSnap = await ref.get();
  if (!monthSnap.exists) {
    throw new Error(`Month ${monthId} not found`);
  }

  const [availabilitySnap, assignmentSnap] = await Promise.all([
    ref.collection("availabilities").get(),
    ref.collection("assignments").get(),
  ]);

  const month = monthSnap.data() as MonthDoc;
  const availabilities = availabilitySnap.docs.map((doc) => ({
    memberId: doc.id,
    ...(doc.data() as Omit<MemberAvailability, "memberId">),
  }));
  const assignments = assignmentSnap.docs
    .map((doc) => doc.data() as DaySchedule)
    .sort((left, right) => left.date.localeCompare(right.date));

  return { month, availabilities, assignments, ref };
}

export async function getMonthSnapshotForCompany(companyId: string, monthId: string): Promise<MonthSnapshot> {
  const { month, availabilities, assignments } = await readMonth(companyId, monthId);
  return {
    month,
    availabilities,
    assignments,
    days: buildDayOverviews(month.monthId, month.intakeLimitPerShift, availabilities),
  };
}

export async function updateAvailability(input: {
  companyId: string;
  currentUser: SessionUser;
  monthId: string;
  entries: AvailabilityEntry[];
}) {
  const name = input.currentUser.name.trim();
  if (name.length < 2) {
    throw new Error("Name must be at least 2 characters");
  }

  validateEntries(input.entries);
  const entries = dedupeEntries(input.entries);
  const memberId = input.currentUser.userId;
  const { month, availabilities, ref } = await readMonth(input.companyId, input.monthId);

  if (month.status !== "open") {
    throw new Error("This month is not open for availability");
  }

  if (Date.now() > month.deadlineAt) {
    throw new Error("The intake deadline has passed");
  }

  const counts = new Map<string, number>();
  for (const availability of availabilities) {
    if (availability.memberId === memberId) continue;
    for (const entry of availability.entries) {
      const key = `${entry.date}:${entry.shiftType}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  for (const entry of entries) {
    const key = `${entry.date}:${entry.shiftType}`;
    if ((counts.get(key) ?? 0) >= month.intakeLimitPerShift) {
      throw new Error(`The ${entry.shiftType} shift on ${entry.date} is already full`);
    }
  }

  const existing = availabilities.find((availability) => availability.memberId === memberId);
  const now = Date.now();

  const payload: Omit<MemberAvailability, "memberId"> = {
    name,
    email: input.currentUser.email?.trim() || null,
    entries,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await ref.collection("availabilities").doc(memberId).set(payload, { merge: false });
  return memberId;
}

export async function updateMonthSettings(input: {
  companyId: string;
  monthId: string;
  deadlineAt: number;
  intakeLimitPerShift: number;
  status: MonthStatus;
}) {
  const { ref, month } = await readMonth(input.companyId, input.monthId);
  if (month.status === "scheduled" && input.status !== "scheduled") {
    const snapshot = await ref.collection("assignments").get();
    const batch = getDb().batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  await ref.set(
    {
      deadlineAt: input.deadlineAt,
      intakeLimitPerShift: input.intakeLimitPerShift,
      status: input.status,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function generateMonthScheduleForCompany(companyId: string, monthId: string) {
  const { month, availabilities, ref } = await readMonth(companyId, monthId);
  const assignments = generateSchedule(month.monthId, month.intakeLimitPerShift, availabilities);
  const batch = getDb().batch();
  const assignmentsRef = ref.collection("assignments");
  const existingAssignments = await assignmentsRef.get();

  existingAssignments.forEach((doc) => batch.delete(doc.ref));
  assignments.forEach((assignment) => batch.set(assignmentsRef.doc(assignment.date), assignment));
  batch.set(
    ref,
    {
      status: "scheduled",
      updatedAt: Date.now(),
    },
    { merge: true },
  );

  await batch.commit();
  return assignments;
}
