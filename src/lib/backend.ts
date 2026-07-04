import { Session } from "@/features/auth/server/session";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function req<T>(
  method: string,
  path: string,
  session: Session | null,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (session) {
    headers["Authorization"] = `Bearer ${session.idToken}`;
    if (session.user.teamId) headers["X-Team-Id"] = session.user.teamId;
  }

  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) throw new ApiError(await parseErrorMessage(res), res.status);
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, session: Session) => req<T>("GET", path, session),
  post: <T>(path: string, session: Session, body?: unknown) => req<T>("POST", path, session, body),
  patch: <T>(path: string, session: Session, body: unknown) => req<T>("PATCH", path, session, body),
  del: <T>(path: string, session: Session) => req<T>("DELETE", path, session),
  getPublic: <T>(path: string) => req<T>("GET", path, null),
  postPublic: <T>(path: string, body: unknown) => req<T>("POST", path, null, body),
};
