import { NextResponse } from "next/server";
import { requireRole } from "@/features/auth/server/session";
import { generateMonthScheduleForCompany } from "@/features/scheduler/server/repository";

export async function POST(_: Request, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireRole("admin");
    const { monthId } = await context.params;
    const assignments = await generateMonthScheduleForCompany(user.companyId, monthId);
    return NextResponse.json({ ok: true, assignments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate schedule" },
      { status: 400 },
    );
  }
}
