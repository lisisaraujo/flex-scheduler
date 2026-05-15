import { NextResponse } from "next/server";
import { requireRole } from "@/features/auth/server/session";
import { generateMonthScheduleForCompany, updateMonthAssignmentsForCompany } from "@/features/scheduler/server/repository";
import { z } from "zod";

const assignmentBodySchema = z.object({
  assignments: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      weekend: z.boolean(),
      night: z.tuple([z.string().nullable(), z.string().nullable()]),
      day: z.tuple([z.string().nullable(), z.string().nullable()]),
    }),
  ),
});

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

export async function PATCH(request: Request, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireRole("admin");
    const { monthId } = await context.params;
    const parsed = assignmentBodySchema.parse(await request.json());
    const assignments = await updateMonthAssignmentsForCompany({
      companyId: user.companyId,
      monthId,
      assignments: parsed.assignments,
    });
    return NextResponse.json({ ok: true, assignments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save schedule edits" },
      { status: 400 },
    );
  }
}
