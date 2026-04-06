import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createInvitation } from "@/features/auth/server/repository";
import { sendInvitationEmail } from "@/features/auth/server/mailer";
import { requireRole } from "@/features/auth/server/session";

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["user", "admin"]).default("user"),
});

export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireRole("admin");
    const parsed = bodySchema.parse(await request.json());
    const invitation = await createInvitation({
      companyId: currentUser.companyId,
      companyName: currentUser.companyName,
      invitedByUserId: currentUser.userId,
      email: parsed.email,
      role: parsed.role,
    });
    await sendInvitationEmail(invitation);

    return NextResponse.json({ ok: true, invitation, delivered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create invitation";
    const status = message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
