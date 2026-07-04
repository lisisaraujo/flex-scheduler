import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/features/auth/server/session";
import { api, ApiError } from "@/lib/backend";
import { SessionUser, UserContext } from "@/features/auth/domain/types";

interface LoginResponse {
  ok: boolean;
  userId: string;
  name: string;
  email: string;
  token: string;
  refreshToken: string;
  user: SessionUser | null;
  contexts: UserContext[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await api.postPublic<LoginResponse>("/api/v1/auth/login", body);

    if (data.user && data.contexts.length === 1) {
      await setAuthCookie(data.user, data.token, data.refreshToken);
      return NextResponse.json({ ok: true, user: data.user, redirect: "/" });
    }

    if (data.contexts.length === 0) {
      return NextResponse.json(
        { error: "No team or organization access. Contact your administrator." },
        { status: 403 },
      );
    }

    // Multiple contexts — return them so the context-picker page can let the user choose.
    // Tokens are passed back to the client temporarily; the session cookie is set after picking.
    return NextResponse.json({
      ok: true,
      userId: data.userId,
      name: data.name,
      email: data.email,
      token: data.token,
      refreshToken: data.refreshToken,
      contexts: data.contexts,
      redirect: "/context",
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to log in" }, { status: 401 });
  }
}
