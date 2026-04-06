import { NextResponse } from "next/server";
import { resendInvitation, revokeInvitation } from "@/features/auth/server/repository";
import { sendInvitationEmail } from "@/features/auth/server/mailer";
import { requireRole } from "@/features/auth/server/session";

export async function PATCH(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  try {
    const currentUser = await requireRole("admin");
    const { invitationId } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as { action?: string };

    if (payload.action === "resend") {
      const invitation = await resendInvitation({
        invitationId,
        companyId: currentUser.companyId,
        invitedByUserId: currentUser.userId,
      });
      await sendInvitationEmail(invitation);
      return NextResponse.json({ ok: true, invitation });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update invitation";
    const status =
      message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ invitationId: string }> }) {
  try {
    const currentUser = await requireRole("admin");
    const { invitationId } = await context.params;
    const invitation = await revokeInvitation({
      invitationId,
      companyId: currentUser.companyId,
    });
    return NextResponse.json({ ok: true, invitation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke invitation";
    const status =
      message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
