import { z } from "zod";
import { NextResponse } from "next/server";
import {
  removeCompanyMember,
  updateCompanyMemberScheduling,
  updateMemberPreferredCoworkers,
} from "@/features/auth/server/repository";
import { requireCurrentUser, requireRole } from "@/features/auth/server/session";

const adminSchedulingBodySchema = z.object({
  active: z.boolean(),
  maxShifts: z.number().int().min(0).max(31).nullable(),
});

const coworkerPreferencesBodySchema = z.object({
  preferredCoworkerIds: z.array(z.string()).max(50),
});

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

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const currentUser = await requireCurrentUser();
    const { userId } = await context.params;
    const payload = await request.json();

    if (currentUser.role === "admin") {
      const parsed = adminSchedulingBodySchema.parse(payload);
      await updateCompanyMemberScheduling({
        companyId: currentUser.companyId,
        targetUserId: userId,
        active: parsed.active,
        maxShifts: parsed.maxShifts,
      });
      return NextResponse.json({ ok: true });
    }

    if (currentUser.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = coworkerPreferencesBodySchema.parse(payload);
    await updateMemberPreferredCoworkers({
      companyId: currentUser.companyId,
      targetUserId: userId,
      preferredCoworkerIds: parsed.preferredCoworkerIds,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update member scheduling";
    const status =
      message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
