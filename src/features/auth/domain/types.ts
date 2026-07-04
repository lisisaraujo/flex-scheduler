export type MembershipRole = "org_admin" | "team_admin" | "team_member";

export interface SchedulingProfile {
  active: boolean;
  maxShifts: number | null;
  preferredCoworkerIds: string[];
}

export interface AuthUser {
  userId: string;
  name: string;
  email: string;
  createdAt: number;
}

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  orgName: string;
  teamId: string | null;    // null = org-level context (no team selected)
  teamName: string | null;
  role: MembershipRole;
}

export interface UserContext {
  type: "org" | "team";
  orgId: string;
  orgName: string;
  teamId?: string | null;
  teamName?: string | null;
  role: MembershipRole;
}

export interface Invitation {
  invitationId: string;
  teamId: string;
  teamName: string;
  email: string;
  role: MembershipRole;
  status: "pending" | "accepted" | "expired" | "revoked";
  invitedByUserId: string;
  createdAt: number;
  expiresAt: number;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  teamId: string;
  role: MembershipRole;
  createdAt: number;
  name: string;
  email: string;
  schedulingProfile: SchedulingProfile;
}

/** @deprecated use TeamMember */
export type CompanyMember = TeamMember;
