import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/features/auth/server/session";
import { updateAvailability } from "@/features/scheduler/server/repository";

const bodySchema = z.object({
  entries: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shiftType: z.enum(["night", "day"]),
      }),
    )
    .max(31),
});

export async function POST(request: NextRequest, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { monthId } = await context.params;
    const parsed = bodySchema.parse(await request.json());
    const memberId = await updateAvailability({
      companyId: user.companyId,
      currentUser: user,
      monthId,
      entries: parsed.entries,
    });

    return NextResponse.json({ ok: true, memberId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save availability" },
      { status: 400 },
    );
  }
}
