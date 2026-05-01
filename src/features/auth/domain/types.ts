export type MembershipRole = "user" | "admin";

export interface SchedulingProfile {
  active: boolean;
  maxShifts: number | null;
  preferredCoworkerIds: string[];
}

export interface Company {
  companyId: string;
  name: string;
  createdAt: number;
}

export interface AuthUser {
  userId: string;
  name: string;
  email: string;
  createdAt: number;
}

export interface Membership {
  membershipId: string;
  userId: string;
  companyId: string;
  role: MembershipRole;
  createdAt: number;
  schedulingProfile: SchedulingProfile;
}

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  role: MembershipRole;
}

export interface Invitation {
  invitationId: string;
  companyId: string;
  companyName: string;
  email: string;
  role: MembershipRole;
  status: "pending" | "accepted" | "expired" | "revoked";
  invitedByUserId: string;
  createdAt: number;
  expiresAt: number;
}

export interface CompanyMember {
  membershipId: string;
  userId: string;
  companyId: string;
  role: MembershipRole;
  createdAt: number;
  name: string;
  email: string;
  schedulingProfile: SchedulingProfile;
}
