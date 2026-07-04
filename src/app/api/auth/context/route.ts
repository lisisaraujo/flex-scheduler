import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/features/auth/server/session";
import { SessionUser, UserContext } from "@/features/auth/domain/types";

/**
 * Called after login when the user has multiple contexts to choose from.
 * The client sends the selected context + the tokens from the login response.
 * We build the SessionUser from that and set the cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      context: UserContext;
      userId: string;
      name: string;
      email: string;
      token: string;
      refreshToken: string;
    };

    const { context, userId, name, email, token, refreshToken } = body;

    if (!context || !token || !refreshToken) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const user: SessionUser = {
      userId,
      name,
      email,
      orgId: context.orgId,
      orgName: context.orgName,
      teamId: context.teamId ?? null,
      teamName: context.teamName ?? null,
      role: context.role,
    };

    await setAuthCookie(user, token, refreshToken);
    return NextResponse.json({ ok: true, user });
  } catch {
    return NextResponse.json({ error: "Failed to set context" }, { status: 400 });
  }
}
