import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/features/auth/server/session";
import { cancelSwapRequest } from "@/features/scheduler/server/repository";

function statusFromMessage(message: string) {
  return message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
}

export async function POST(_: NextRequest, context: { params: Promise<{ monthId: string; swapId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { monthId, swapId } = await context.params;

    const swap = await cancelSwapRequest({
      companyId: user.companyId,
      monthId,
      swapId,
      currentUser: user,
    });

    return NextResponse.json({ ok: true, swap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel swap request";
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
