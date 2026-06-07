import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listMembersForCompany } from "@/features/auth/server/repository";
import { sendSwapRequestEmail } from "@/features/auth/server/mailer";
import { requireCurrentUser } from "@/features/auth/server/session";
import { createSwapRequest, listSwapRequestsForUser } from "@/features/scheduler/server/repository";

const shiftSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftType: z.enum(["night", "day"]),
  slot: z.union([z.literal(0), z.literal(1)]),
});

const createSwapBodySchema = z.object({
  requesteeId: z.string().min(1),
  requesterShift: shiftSlotSchema,
  requesteeShift: shiftSlotSchema,
});

function statusFromMessage(message: string) {
  return message === "Forbidden" ? 403 : message === "Authentication required" ? 401 : 400;
}

export async function GET(_: NextRequest, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { monthId } = await context.params;
    const swaps = await listSwapRequestsForUser({
      companyId: user.companyId,
      monthId,
      userId: user.userId,
    });

    return NextResponse.json({ ok: true, swaps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load swap requests";
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (user.role === "admin") {
      return NextResponse.json({ error: "Admins do not hold shifts and cannot request swaps." }, { status: 403 });
    }

    const { monthId } = await context.params;
    const parsed = createSwapBodySchema.parse(await request.json());

    const swap = await createSwapRequest({
      companyId: user.companyId,
      monthId,
      currentUser: user,
      requesteeId: parsed.requesteeId,
      requesterShift: parsed.requesterShift,
      requesteeShift: parsed.requesteeShift,
    });

    const members = await listMembersForCompany(user.companyId);
    const requestee = members.find((member) => member.userId === swap.requesteeId);
    if (requestee?.email) {
      await sendSwapRequestEmail({ swap, requesteeEmail: requestee.email });
    }

    return NextResponse.json({ ok: true, swap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create swap request";
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}
