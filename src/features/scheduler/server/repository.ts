import { listMembersForCompany } from "@/features/auth/server/repository";
import { buildSchedulerInput } from "@/features/scheduler/domain/scheduler-input";
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
  ShiftType,
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
    archived: 4,
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

async function deleteDocsInChunks(
  refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[],
  chunkSize = 400,
) {
  for (let index = 0; index < refs.length; index += chunkSize) {
    const batch = getDb().batch();
    refs.slice(index, index + chunkSize).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function deleteMonthForCompany(companyId: string, monthId: string) {
  const { month, ref } = await readMonth(companyId, monthId);

  if (!["draft", "archived"].includes(month.status)) {
    throw new Error("Only draft or archived months can be deleted permanently");
  }

  const [availabilitySnap, assignmentSnap] = await Promise.all([
    ref.collection("availabilities").get(),
    ref.collection("assignments").get(),
  ]);

  await deleteDocsInChunks([
    ...availabilitySnap.docs.map((doc) => doc.ref),
    ...assignmentSnap.docs.map((doc) => doc.ref),
  ]);

  await ref.delete();
}

export async function generateMonthScheduleForCompany(companyId: string, monthId: string) {
  const { month, availabilities, ref } = await readMonth(companyId, monthId);

  if (!["open", "closed", "scheduled"].includes(month.status)) {
    throw new Error("Only open, closed, or scheduled months can generate a schedule");
  }

  const companyMembers = await listMembersForCompany(companyId);
  const schedulerInput = buildSchedulerInput({
    monthId: month.monthId,
    intakeLimitPerShift: month.intakeLimitPerShift,
    availabilities,
    companyMembers,
  });
  const assignments = generateSchedule({
    monthId: month.monthId,
    intakeLimitPerShift: month.intakeLimitPerShift,
    availabilities,
    schedulerInput,
  });
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

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}

function validateEditedAssignments(input: {
  assignments: Array<{
    date: string;
    weekend: boolean;
    night: [string | null, string | null];
    day: [string | null, string | null];
  }>;
  availabilities: MemberAvailability[];
  companyMembers: Awaited<ReturnType<typeof listMembersForCompany>>;
}) {
  const memberById = new Map(input.companyMembers.map((member) => [member.userId, member]));
  const availabilityByShift = new Map<string, Set<string>>();

  for (const availability of input.availabilities) {
    for (const entry of availability.entries) {
      const key = `${entry.date}:${entry.shiftType}`;
      const existing = availabilityByShift.get(key) ?? new Set<string>();
      existing.add(availability.memberId);
      availabilityByShift.set(key, existing);
    }
  }

  const assignmentsByMember = new Map<string, Set<string>>();
  const assignmentCountByMember = new Map<string, number>();

  const validateSlot = (memberId: string | null, date: string, shiftType: ShiftType) => {
    if (!memberId) return;

    const member = memberById.get(memberId);
    if (!member) {
      throw new Error(`Unknown member selected for ${date} ${shiftType}`);
    }
    if (!member.schedulingProfile.active) {
      throw new Error(`${member.name} is inactive and cannot be assigned`);
    }

    const availableMembers = availabilityByShift.get(`${date}:${shiftType}`) ?? new Set<string>();
    if (!availableMembers.has(memberId)) {
      throw new Error(`${member.name} did not submit availability for ${date} ${shiftType}`);
    }

    const existing = assignmentsByMember.get(memberId) ?? new Set<string>();
    if (existing.has(`${date}:night`) || existing.has(`${date}:day`)) {
      throw new Error(`${member.name} cannot be assigned twice on ${date}`);
    }
    if (shiftType === "day" && existing.has(`${previousDate(date)}:night`)) {
      throw new Error(`${member.name} cannot work a day shift on ${date} after a night shift the previous day`);
    }

    const nextCount = (assignmentCountByMember.get(memberId) ?? 0) + 1;
    if (member.schedulingProfile.maxShifts !== null && nextCount > member.schedulingProfile.maxShifts) {
      throw new Error(`${member.name} exceeds their max shifts`);
    }

    existing.add(`${date}:${shiftType}`);
    assignmentsByMember.set(memberId, existing);
    assignmentCountByMember.set(memberId, nextCount);
  };

  for (const assignment of input.assignments.sort((left, right) => left.date.localeCompare(right.date))) {
    validateSlot(assignment.night[0], assignment.date, "night");
    validateSlot(assignment.night[1], assignment.date, "night");
    if (assignment.weekend) {
      validateSlot(assignment.day[0], assignment.date, "day");
      validateSlot(assignment.day[1], assignment.date, "day");
    }
  }
}

export async function updateMonthAssignmentsForCompany(input: {
  companyId: string;
  monthId: string;
  assignments: Array<{
    date: string;
    weekend: boolean;
    night: [string | null, string | null];
    day: [string | null, string | null];
  }>;
}) {
  const { month, availabilities, ref } = await readMonth(input.companyId, input.monthId);
  const companyMembers = await listMembersForCompany(input.companyId);
  const dayByDate = new Map(
    buildDayOverviews(month.monthId, month.intakeLimitPerShift, availabilities).map((day) => [day.date, day]),
  );

  validateEditedAssignments({
    assignments: input.assignments,
    availabilities,
    companyMembers,
  });

  const nameByMemberId = new Map(companyMembers.map((member) => [member.userId, member.name]));
  const normalizedAssignments: DaySchedule[] = input.assignments
    .map((assignment) => ({
      date: assignment.date,
      weekdayLabel: dayByDate.get(assignment.date)?.weekdayLabel ?? assignment.date,
      weekend: assignment.weekend,
      night: [
        assignment.night[0] ? nameByMemberId.get(assignment.night[0]) ?? null : null,
        assignment.night[1] ? nameByMemberId.get(assignment.night[1]) ?? null : null,
      ] as [string | null, string | null],
      day: [
        assignment.day[0] ? nameByMemberId.get(assignment.day[0]) ?? null : null,
        assignment.day[1] ? nameByMemberId.get(assignment.day[1]) ?? null : null,
      ] as [string | null, string | null],
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const batch = getDb().batch();
  const assignmentsRef = ref.collection("assignments");
  const existingAssignments = await assignmentsRef.get();
  existingAssignments.forEach((doc) => batch.delete(doc.ref));
  normalizedAssignments.forEach((assignment) => batch.set(assignmentsRef.doc(assignment.date), assignment));
  batch.set(
    ref,
    {
      status: "scheduled",
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  await batch.commit();

  return normalizedAssignments;
}
