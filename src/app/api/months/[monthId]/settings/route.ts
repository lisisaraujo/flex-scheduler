import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/features/auth/server/session";
import { updateMonthSettings } from "@/features/scheduler/server/repository";

const bodySchema = z.object({
  deadlineAt: z.number().int().positive(),
  intakeLimitPerShift: z.number().int().min(1).max(20),
  status: z.enum(["draft", "open", "closed", "scheduled", "archived"]),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireRole("admin");
    const { monthId } = await context.params;
    const parsed = bodySchema.parse(await request.json());
    await updateMonthSettings({
      companyId: user.companyId,
      monthId,
      deadlineAt: parsed.deadlineAt,
      intakeLimitPerShift: parsed.intakeLimitPerShift,
      status: parsed.status,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update month" },
      { status: 400 },
    );
  }
}
