import crypto from "crypto";
import {
  AuthUser,
  CompanyMember,
  Company,
  Invitation,
  Membership,
  MembershipRole,
  SchedulingProfile,
  SessionUser,
} from "@/features/auth/domain/types";
import { getAuth, getDb } from "@/features/scheduler/server/db";

type UserRecord = AuthUser;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createUserId(email: string) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 24);
}

function createCompanyId(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return `${slug || "company"}-${crypto.randomBytes(4).toString("hex")}`;
}

function usersCollection() {
  return getDb().collection("users");
}

function companiesCollection() {
  return getDb().collection("companies");
}

function membershipsCollection() {
  return getDb().collection("memberships");
}

function invitationsCollection() {
  return getDb().collection("invitations");
}

function getFirebaseWebApiKey() {
  const key = process.env.FIREBASE_WEB_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) {
    throw new Error("Missing FIREBASE_WEB_API_KEY");
  }
  return key;
}

async function getCompany(companyId: string) {
  const snapshot = await companiesCollection().doc(companyId).get();
  if (!snapshot.exists) {
    throw new Error("Company not found");
  }

  return snapshot.data() as Company;
}

function toSessionUser(user: AuthUser, membership: Membership, company: Company) {
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    companyId: company.companyId,
    companyName: company.name,
    role: membership.role as MembershipRole,
  } satisfies SessionUser;
}

function defaultSchedulingProfile(): SchedulingProfile {
  return {
    active: true,
    maxShifts: null,
    preferredCoworkerIds: [],
  };
}

function normalizeSchedulingProfile(profile?: Partial<SchedulingProfile> | null): SchedulingProfile {
  return {
    active: profile?.active ?? true,
    maxShifts: typeof profile?.maxShifts === "number" ? profile.maxShifts : null,
    preferredCoworkerIds: Array.isArray(profile?.preferredCoworkerIds)
      ? profile.preferredCoworkerIds.filter((value): value is string => typeof value === "string")
      : [],
  };
}

async function listCompanyMembershipUserIds(companyId: string, userIds: string[]) {
  const validUserIds = new Set<string>();

  for (let index = 0; index < userIds.length; index += 10) {
    const chunk = userIds.slice(index, index + 10);
    const snapshot = await membershipsCollection()
      .where("companyId", "==", companyId)
      .where("userId", "in", chunk)
      .get();

    snapshot.docs.forEach((doc) => {
      validUserIds.add((doc.data() as Membership).userId);
    });
  }

  return validUserIds;
}

function normalizeMembership(membership: Membership): Membership {
  return {
    ...membership,
    schedulingProfile: normalizeSchedulingProfile(membership.schedulingProfile),
  };
}

async function createFirebaseAuthUser(input: {
  userId: string;
  email: string;
  password: string;
  name: string;
}) {
  try {
    await getAuth().createUser({
      uid: input.userId,
      email: input.email,
      password: input.password,
      displayName: input.name,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "auth/email-already-exists"
    ) {
      throw new Error("An account with this email already exists");
    }
    throw error;
  }
}

async function signInWithFirebasePassword(email: string, password: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${getFirebaseWebApiKey()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.idToken) {
    const code = payload?.error?.message;
    if (code === "OPERATION_NOT_ALLOWED") {
      throw new Error("Email/password sign-in is disabled in Firebase Authentication");
    }
    if (code === "USER_DISABLED") {
      throw new Error("This Firebase Authentication user is disabled");
    }
    if (code === "EMAIL_NOT_FOUND" || code === "INVALID_PASSWORD" || code === "INVALID_LOGIN_CREDENTIALS") {
      throw new Error("Invalid email or password");
    }
    if (code) {
      throw new Error(`Firebase sign-in failed: ${code}`);
    }
    throw new Error("Invalid email or password");
  }

  const decoded = await getAuth().verifyIdToken(payload.idToken);
  return decoded.uid;
}

async function findUserById(userId: string) {
  const snapshot = await usersCollection().doc(userId).get();
  return snapshot.exists ? (snapshot.data() as UserRecord) : null;
}

async function findMembershipForUser(userId: string) {
  const snapshot = await membershipsCollection().where("userId", "==", userId).limit(1).get();
  if (snapshot.empty) {
    throw new Error("This account is not attached to a company yet");
  }

  return normalizeMembership(snapshot.docs[0].data() as Membership);
}

export async function registerCompanyAdmin(input: {
  companyName: string;
  name: string;
  email: string;
  password: string;
}) {
  const name = input.name.trim();
  const companyName = input.companyName.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (companyName.length < 2) throw new Error("Company name must be at least 2 characters");
  if (name.length < 2) throw new Error("Name must be at least 2 characters");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const userId = createUserId(email);
  const userRef = usersCollection().doc(userId);
  const existing = await userRef.get();
  if (existing.exists) throw new Error("An account with this email already exists");

  const now = Date.now();
  const companyId = createCompanyId(companyName);
  const user: UserRecord = {
    userId,
    name,
    email,
    createdAt: now,
  };
  const company: Company = {
    companyId,
    name: companyName,
    createdAt: now,
  };
  const membership: Membership = {
    membershipId: `${companyId}:${userId}`,
    userId,
    companyId,
    role: "admin",
    createdAt: now,
    schedulingProfile: defaultSchedulingProfile(),
  };

  await createFirebaseAuthUser({ userId, email, password, name });

  try {
    const batch = getDb().batch();
    batch.set(companiesCollection().doc(companyId), company);
    batch.set(userRef, user);
    batch.set(membershipsCollection().doc(membership.membershipId), membership);
    await batch.commit();
  } catch (error) {
    await getAuth().deleteUser(userId).catch(() => undefined);
    throw error;
  }

  return toSessionUser(user, membership, company);
}

export async function loginUser(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const userId = await signInWithFirebasePassword(email, input.password);

  const user = await findUserById(userId);
  if (!user) throw new Error("User profile not found");
  const membership = await findMembershipForUser(user.userId);
  const company = await getCompany(membership.companyId);
  return toSessionUser(user, membership, company);
}

async function findUserByEmail(email: string) {
  const snapshot = await usersCollection().where("email", "==", normalizeEmail(email)).limit(1).get();
  return snapshot.empty ? null : (snapshot.docs[0].data() as UserRecord);
}

async function expireInvitationIfNeeded(invitation: Invitation) {
  if (invitation.status === "pending" && invitation.expiresAt < Date.now()) {
    const expired: Invitation = { ...invitation, status: "expired" };
    await invitationsCollection().doc(invitation.invitationId).set({ status: "expired" }, { merge: true });
    return expired;
  }

  return invitation;
}

export async function listMembersForCompany(companyId: string) {
  const membershipsSnapshot = await membershipsCollection()
    .where("companyId", "==", companyId)
    .orderBy("createdAt", "asc")
    .get();

  const members = await Promise.all(
    membershipsSnapshot.docs.map(async (doc) => {
      const membership = doc.data() as Membership;
      const normalizedMembership = normalizeMembership(membership);
      const userSnapshot = await usersCollection().doc(membership.userId).get();
      if (!userSnapshot.exists) return null;
      const user = userSnapshot.data() as UserRecord;

      return {
        membershipId: normalizedMembership.membershipId,
        userId: normalizedMembership.userId,
        companyId: normalizedMembership.companyId,
        role: normalizedMembership.role,
        createdAt: normalizedMembership.createdAt,
        name: user.name,
        email: user.email,
        schedulingProfile: normalizedMembership.schedulingProfile,
      } satisfies CompanyMember;
    }),
  );

  return members.filter(Boolean) as CompanyMember[];
}

export async function listInvitationsForCompany(companyId: string) {
  const snapshot = await invitationsCollection()
    .where("companyId", "==", companyId)
    .orderBy("createdAt", "desc")
    .get();

  const invitations = snapshot.docs.map((doc) => doc.data() as Invitation);
  return Promise.all(invitations.map(expireInvitationIfNeeded));
}

export async function createInvitation(input: {
  companyId: string;
  companyName: string;
  invitedByUserId: string;
  email: string;
  role?: MembershipRole;
}) {
  const email = normalizeEmail(input.email);
  const role = input.role ?? "user";

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  const pendingSnapshot = await invitationsCollection()
    .where("companyId", "==", input.companyId)
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!pendingSnapshot.empty) {
    throw new Error("A pending invitation already exists for this email");
  }

  const invitationId = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const invitation: Invitation = {
    invitationId,
    companyId: input.companyId,
    companyName: input.companyName,
    email,
    role,
    status: "pending",
    invitedByUserId: input.invitedByUserId,
    createdAt: now,
    expiresAt: now + 1000 * 60 * 60 * 24 * 7,
  };

  await invitationsCollection().doc(invitationId).set(invitation);
  return invitation;
}

export async function getInvitationById(invitationId: string) {
  const snapshot = await invitationsCollection().doc(invitationId).get();
  if (!snapshot.exists) {
    throw new Error("Invitation not found");
  }

  return expireInvitationIfNeeded(snapshot.data() as Invitation);
}

export async function acceptInvitation(input: {
  invitationId: string;
  name: string;
  password: string;
}) {
  const invitation = await getInvitationById(input.invitationId);
  if (invitation.status !== "pending") {
    throw new Error("This invitation is no longer active");
  }
  if (invitation.expiresAt < Date.now()) {
    await invitationsCollection().doc(invitation.invitationId).set({ status: "expired" }, { merge: true });
    throw new Error("This invitation has expired");
  }

  const existingUser = await findUserByEmail(invitation.email);
  if (existingUser) {
    throw new Error("A user with this email already exists");
  }

  const name = input.name.trim();
  if (name.length < 2) throw new Error("Name must be at least 2 characters");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");

  const now = Date.now();
  const userId = createUserId(invitation.email);
  const user: UserRecord = {
    userId,
    name,
    email: invitation.email,
    createdAt: now,
  };
  const membership: Membership = {
    membershipId: `${invitation.companyId}:${userId}`,
    userId,
    companyId: invitation.companyId,
    role: invitation.role,
    createdAt: now,
    schedulingProfile: defaultSchedulingProfile(),
  };

  await createFirebaseAuthUser({
    userId,
    email: invitation.email,
    password: input.password,
    name,
  });

  try {
    const batch = getDb().batch();
    batch.set(usersCollection().doc(userId), user);
    batch.set(membershipsCollection().doc(membership.membershipId), membership);
    batch.set(
      invitationsCollection().doc(invitation.invitationId),
      { status: "accepted" },
      { merge: true },
    );
    await batch.commit();
  } catch (error) {
    await getAuth().deleteUser(userId).catch(() => undefined);
    throw error;
  }

  return {
    userId,
    name,
    email: invitation.email,
    companyId: invitation.companyId,
    companyName: invitation.companyName,
    role: invitation.role,
  } satisfies SessionUser;
}

export async function revokeInvitation(input: { invitationId: string; companyId: string }) {
  const invitation = await getInvitationById(input.invitationId);
  if (invitation.companyId !== input.companyId) {
    throw new Error("Forbidden");
  }
  if (invitation.status === "accepted") {
    throw new Error("Accepted invitations cannot be revoked");
  }
  if (invitation.status === "revoked") {
    return invitation;
  }

  const next = { status: "revoked" as const };
  await invitationsCollection().doc(invitation.invitationId).set(next, { merge: true });
  return { ...invitation, ...next };
}

export async function resendInvitation(input: {
  invitationId: string;
  companyId: string;
  invitedByUserId: string;
}) {
  const invitation = await getInvitationById(input.invitationId);
  if (invitation.companyId !== input.companyId) {
    throw new Error("Forbidden");
  }
  if (invitation.status === "accepted") {
    throw new Error("Accepted invitations cannot be resent");
  }

  const refreshed = {
    status: "pending" as const,
    invitedByUserId: input.invitedByUserId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  await invitationsCollection().doc(invitation.invitationId).set(refreshed, { merge: true });
  return { ...invitation, ...refreshed };
}

export async function removeCompanyMember(input: {
  companyId: string;
  targetUserId: string;
  actingUserId: string;
}) {
  if (input.targetUserId === input.actingUserId) {
    throw new Error("You cannot remove your own account");
  }

  const membershipId = `${input.companyId}:${input.targetUserId}`;
  const membershipRef = membershipsCollection().doc(membershipId);
  const membershipSnapshot = await membershipRef.get();
  if (!membershipSnapshot.exists) {
    throw new Error("Member not found");
  }

  const membership = membershipSnapshot.data() as Membership;
  if (membership.role === "admin") {
    const adminSnapshot = await membershipsCollection()
      .where("companyId", "==", input.companyId)
      .where("role", "==", "admin")
      .get();
    if (adminSnapshot.size <= 1) {
      throw new Error("You cannot remove the last admin");
    }
  }

  const companyCalendars = await getDb().collection("companies").doc(input.companyId).collection("calendars").get();
  const batch = getDb().batch();
  batch.delete(membershipRef);

  companyCalendars.forEach((calendarDoc) => {
    batch.delete(calendarDoc.ref.collection("availabilities").doc(input.targetUserId));
  });

  const remainingMemberships = await membershipsCollection().where("userId", "==", input.targetUserId).get();
  if (remainingMemberships.size <= 1) {
    batch.delete(usersCollection().doc(input.targetUserId));
  }

  await batch.commit();

  if (remainingMemberships.size <= 1) {
    await getAuth().deleteUser(input.targetUserId).catch(() => undefined);
  }
}

export async function updateCompanyMemberScheduling(input: {
  companyId: string;
  targetUserId: string;
  active: boolean;
  maxShifts: number | null;
}) {
  const membershipId = `${input.companyId}:${input.targetUserId}`;
  const membershipRef = membershipsCollection().doc(membershipId);
  const membershipSnapshot = await membershipRef.get();
  if (!membershipSnapshot.exists) {
    throw new Error("Member not found");
  }

  if (input.maxShifts !== null && (input.maxShifts < 0 || input.maxShifts > 31)) {
    throw new Error("maxShifts must be between 0 and 31");
  }

  await membershipRef.set(
    {
      schedulingProfile: normalizeSchedulingProfile({
        ...normalizeMembership(membershipSnapshot.data() as Membership).schedulingProfile,
        active: input.active,
        maxShifts: input.maxShifts,
      }),
    },
    { merge: true },
  );
}

export async function updateMemberPreferredCoworkers(input: {
  companyId: string;
  targetUserId: string;
  preferredCoworkerIds: string[];
}) {
  const membershipId = `${input.companyId}:${input.targetUserId}`;
  const membershipRef = membershipsCollection().doc(membershipId);
  const membershipSnapshot = await membershipRef.get();
  if (!membershipSnapshot.exists) {
    throw new Error("Member not found");
  }

  const candidateIds = Array.from(
    new Set(
      input.preferredCoworkerIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value !== input.targetUserId),
    ),
  );

  if (candidateIds.length > 0) {
    const validUserIds = await listCompanyMembershipUserIds(input.companyId, candidateIds);
    const invalidIds = candidateIds.filter((userId) => !validUserIds.has(userId));
    if (invalidIds.length > 0) {
      throw new Error("One or more preferred coworkers are invalid for this company");
    }
  }

  await membershipRef.set(
    {
      schedulingProfile: normalizeSchedulingProfile({
        ...normalizeMembership(membershipSnapshot.data() as Membership).schedulingProfile,
        preferredCoworkerIds: candidateIds,
      }),
    },
    { merge: true },
  );
}
