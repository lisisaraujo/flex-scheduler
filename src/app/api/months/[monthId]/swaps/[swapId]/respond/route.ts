import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listMembersForCompany } from "@/features/auth/server/repository";
import { sendSwapResponseEmail } from "@/features/auth/server/mailer";
import { requireCurrentUser } from "@/features/auth/server/session";
import { respondToSwapRequest } from "@/features/scheduler/server/repository";

const bodySchema = z.object({
  accept: z.boolean(),
});

function statusFromMessage(message: string) {
  return message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ monthId: string; swapId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { monthId, swapId } = await context.params;
    const parsed = bodySchema.parse(await request.json());

    const swap = await respondToSwapRequest({
      companyId: user.companyId,
      monthId,
      swapId,
      currentUser: user,
      accept: parsed.accept,
    });

    const members = await listMembersForCompany(user.companyId);
    const requester = members.find((member) => member.userId === swap.requesterId);
    if (requester?.email) {
      await sendSwapResponseEmail({ swap, requesterEmail: requester.email, accepted: parsed.accept });
    }

    return NextResponse.json({ ok: true, swap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to respond to swap request";
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
