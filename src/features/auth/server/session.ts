import crypto from "crypto";
import { cookies } from "next/headers";
import { MembershipRole, SessionUser } from "@/features/auth/domain/types";

const SESSION_COOKIE = "flex_scheduler_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface SessionPayload extends SessionUser {
  idToken: string;
  refreshToken: string;
  tokenIssuedAt: number;
  exp: number;
}

export interface Session {
  user: SessionUser;
  idToken: string;
}

function getSessionSecret() {
  return process.env.AUTH_SECRET || "dev-auth-secret-change-me";
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function encodeSession(payload: SessionPayload): string {
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

function decodeSession(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(decode(encodedPayload)) as SessionPayload;
  } catch {
    return null;
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

async function tryRefreshIdToken(
  refreshToken: string,
): Promise<{ idToken: string; refreshToken: string } | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { idToken: data.id_token as string, refreshToken: data.refresh_token as string };
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Set the auth cookie after login / register / accept-invitation / context switch. */
export async function setAuthCookie(user: SessionUser, idToken: string, refreshToken: string) {
  const payload: SessionPayload = {
    ...user,
    idToken,
    refreshToken,
    tokenIssuedAt: Date.now(),
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  };
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(payload), COOKIE_OPTIONS);
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    ...COOKIE_OPTIONS,
    maxAge: 0,
    expires: new Date(0),
  });
}

/** Read the current user from the session (no token refresh). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = decodeSession(raw);
  if (!payload || payload.exp < Date.now()) return null;
  return extractUser(payload);
}

/**
 * For server-component pages: returns user + a best-effort valid idToken.
 * If the stored token is near-expiry the Firebase token refresh API is called
 * but the cookie is NOT updated (cookies are read-only in Server Components).
 * Route Handlers update the cookie on every mutation so the cookie stays fresh.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const payload = decodeSession(raw);
  if (!payload || payload.exp < Date.now()) return null;

  const user = extractUser(payload);

  if (Date.now() - payload.tokenIssuedAt > 55 * 60 * 1000) {
    const refreshed = await tryRefreshIdToken(payload.refreshToken);
    if (!refreshed) return null;
    return { user, idToken: refreshed.idToken };
  }

  return { user, idToken: payload.idToken };
}

/**
 * For Route Handlers: returns user + fresh idToken, refreshing and updating
 * the cookie if the token is near-expiry. Throws if not authenticated.
 */
export async function requireIdToken(): Promise<Session> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) throw new Error("Authentication required");

  const payload = decodeSession(raw);
  if (!payload || payload.exp < Date.now()) throw new Error("Authentication required");

  const user = extractUser(payload);

  if (Date.now() - payload.tokenIssuedAt > 55 * 60 * 1000) {
    const refreshed = await tryRefreshIdToken(payload.refreshToken);
    if (!refreshed) throw new Error("Authentication required");
    const newPayload: SessionPayload = {
      ...payload,
      idToken: refreshed.idToken,
      refreshToken: refreshed.refreshToken,
      tokenIssuedAt: Date.now(),
    };
    cookieStore.set(SESSION_COOKIE, encodeSession(newPayload), COOKIE_OPTIONS);
    return { user, idToken: refreshed.idToken };
  }

  return { user, idToken: payload.idToken };
}

export async function requireCurrentUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Authentication required");
  return session.user;
}

export async function requireRole(role: MembershipRole): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (user.role !== role) throw new Error("Forbidden");
  return user;
}

function extractUser(payload: SessionPayload): SessionUser {
  return {
    userId: payload.userId,
    name: payload.name,
    email: payload.email,
    orgId: payload.orgId,
    orgName: payload.orgName,
    teamId: payload.teamId,
    teamName: payload.teamName,
    role: payload.role,
  };
}
