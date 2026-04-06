import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acceptInvitation } from "@/features/auth/server/repository";
import { createSessionToken, setSessionCookie } from "@/features/auth/server/session";

const bodySchema = z.object({
  invitationId: z.string().min(10),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.parse(await request.json());
    const user = await acceptInvitation(parsed);
    await setSessionCookie(createSessionToken(user));
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept invitation" },
      { status: 400 },
    );
  }
}
