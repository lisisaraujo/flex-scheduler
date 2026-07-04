import { NextRequest, NextResponse } from "next/server";
import { api, ApiError } from "@/lib/backend";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await api.postPublic<{
      ok: boolean;
      userId: string;
      name: string;
      email: string;
      token: string;
      refreshToken: string;
    }>("/api/v1/auth/register", body);
    // Registration no longer auto-assigns a context — the super_admin sets that up.
    // Return the userId so the dev can use the super-admin API to assign themselves org_admin.
    return NextResponse.json({ ok: true, userId: data.userId, token: data.token, refreshToken: data.refreshToken });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to register" }, { status: 400 });
  }
}
