import { NextResponse } from "next/server";
import { requireIdToken } from "@/features/auth/server/session";
import { api, ApiError } from "@/lib/backend";

function handleError(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  const msg = err instanceof Error ? err.message : "Server error";
  const status = msg === "Authentication required" ? 401 : msg === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: msg }, { status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  try {
    const session = await requireIdToken();
    const { invitationId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await api.patch(`/api/v1/invitations/${invitationId}`, session, body);
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  try {
    const session = await requireIdToken();
    const { invitationId } = await context.params;
    const data = await api.del(`/api/v1/invitations/${invitationId}`, session);
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err);
  }
}
