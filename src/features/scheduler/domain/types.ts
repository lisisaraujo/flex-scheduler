export type ShiftType = "night" | "day";
export type MonthStatus = "draft" | "open" | "closed" | "scheduled";

export interface MonthDoc {
  companyId: string;
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
}

export interface MonthSnapshot {
  month: MonthDoc;
  days: DayOverview[];
  availabilities: MemberAvailability[];
  assignments: DaySchedule[];
  demoMode?: boolean;
}
