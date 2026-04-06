import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registerCompanyAdmin } from "@/features/auth/server/repository";
import { createSessionToken, setSessionCookie } from "@/features/auth/server/session";

const bodySchema = z.object({
  companyName: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.parse(await request.json());
    const user = await registerCompanyAdmin(parsed);
    await setSessionCookie(createSessionToken(user));
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register" },
      { status: 400 },
    );
  }
}
