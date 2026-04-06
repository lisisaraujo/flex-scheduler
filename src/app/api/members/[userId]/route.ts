import { NextResponse } from "next/server";
import { removeCompanyMember } from "@/features/auth/server/repository";
import { requireRole } from "@/features/auth/server/session";

export async function DELETE(_: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const currentUser = await requireRole("admin");
    const { userId } = await context.params;
    await removeCompanyMember({
      companyId: currentUser.companyId,
      targetUserId: userId,
      actingUserId: currentUser.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove member";
    const status =
      message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
