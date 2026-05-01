import { NextResponse } from "next/server";
import { requireRole } from "@/features/auth/server/session";
import { deleteMonthForCompany } from "@/features/scheduler/server/repository";

export async function DELETE(_request: Request, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireRole("admin");
    const { monthId } = await context.params;
    await deleteMonthForCompany(user.companyId, monthId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete month";
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
