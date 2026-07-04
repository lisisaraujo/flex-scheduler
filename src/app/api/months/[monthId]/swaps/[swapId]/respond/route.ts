import { NextResponse } from "next/server";
import { requireIdToken } from "@/features/auth/server/session";
import { api, ApiError } from "@/lib/backend";

function handleError(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  const msg = err instanceof Error ? err.message : "Server error";
  const status = msg === "Authentication required" ? 401 : msg === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ monthId: string; swapId: string }> },
) {
  try {
    const session = await requireIdToken();
    const { monthId, swapId } = await context.params;
    const body = await request.json();
    const data = await api.post(`/api/v1/months/${monthId}/swaps/${swapId}/respond`, session, body);
    return NextResponse.json(data);
  } catch (err) {
    return handleError(err);
  }
}
