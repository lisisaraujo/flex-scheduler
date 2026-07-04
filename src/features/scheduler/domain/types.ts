export type ShiftType = "night" | "day";
export type MonthStatus = "draft" | "open" | "closed" | "scheduled" | "archived";

export interface MonthDoc {
  teamId: string;
  monthId: string;
  orgName: string;
  timezone: string;
  intakeLimitPerShift: number;
  deadlineAt: number;
  status: MonthStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AvailabilityEntry {
  date: string;
  shiftType: ShiftType;
}

export interface MemberAvailability {
  memberId: string;
  name: string;
  email?: string | null;
  entries: AvailabilityEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface ShiftOverview {
  shiftType: ShiftType;
  capacity: number;
  candidateIds: string[];
  candidateNames: string[];
  isFull: boolean;
}

export interface DayOverview {
  date: string;
  weekdayLabel: string;
  weekend: boolean;
  shifts: ShiftOverview[];
}

export interface DaySchedule {
  date: string;
  weekdayLabel: string;
  weekend: boolean;
  night: [string | null, string | null];
  day: [string | null, string | null];
  nightIds: [string | null, string | null];
  dayIds: [string | null, string | null];
}

export interface MonthSnapshot {
  month: MonthDoc;
  days: DayOverview[];
  availabilities: MemberAvailability[];
  assignments: DaySchedule[];
  demoMode?: boolean;
}

export interface SchedulerMember {
  memberId: string;
  name: string;
  email?: string | null;
  active: boolean;
  maxShifts: number | null;
  preferredCoworkerIds: string[];
  availabilityDates: string[];
}

export interface SchedulerShiftRequest {
  shiftId: string;
  date: string;
  shiftType: ShiftType;
  capacity: number;
  candidateMemberIds: string[];
}

export interface SchedulerInput {
  monthId: string;
  members: SchedulerMember[];
  shiftRequests: SchedulerShiftRequest[];
}

export type SwapRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface ShiftSlotRef {
  date: string;
  shiftType: ShiftType;
  slot: 0 | 1;
}

export interface ShiftSwapRequest {
  swapId: string;
  teamId: string;
  monthId: string;
  status: SwapRequestStatus;
  requesterId: string;
  requesterName: string;
  requesteeId: string;
  requesteeName: string;
  requesterShift: ShiftSlotRef;
  requesteeShift: ShiftSlotRef;
  createdAt: number;
  updatedAt: number;
}
