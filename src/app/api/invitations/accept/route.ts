import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/features/auth/server/session";
import { api, ApiError } from "@/lib/backend";
import { SessionUser } from "@/features/auth/domain/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await api.postPublic<{ ok: boolean; user: SessionUser; token: string; refreshToken: string }>(
      "/api/v1/invitations/accept",
      body,
    );
    await setAuthCookie(data.user, data.token, data.refreshToken);
    return NextResponse.json({ ok: true, user: data.user });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to accept invitation" }, { status: 400 });
  }
}
