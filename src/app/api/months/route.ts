import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/features/auth/server/session";
import { createMonth } from "@/features/scheduler/server/repository";

const bodySchema = z.object({
  monthId: z.string(),
  orgName: z.string().min(2).max(100),
  timezone: z.string().min(2).max(100),
  deadlineAt: z.number().int().positive(),
  intakeLimitPerShift: z.number().int().min(1).max(20),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("admin");
    const parsed = bodySchema.parse(await request.json());
    const month = await createMonth({ ...parsed, companyId: user.companyId });
    return NextResponse.json({ ok: true, month });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create month" },
      { status: error instanceof Error && error.message === "Forbidden" ? 403 : 400 },
    );
  }
}
