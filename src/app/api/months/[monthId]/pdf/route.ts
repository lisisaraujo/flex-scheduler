import { NextResponse } from "next/server";
import { DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { createElement, ReactElement } from "react";
import { requireIdToken } from "@/features/auth/server/session";
import { api, ApiError } from "@/lib/backend";
import { SchedulePdfDocument } from "@/features/scheduler/ui/SchedulePdfDocument";
import { MonthSnapshot } from "@/features/scheduler/domain/types";

function clampScale(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0.75, parsed)) : 1;
}

export async function GET(request: Request, context: { params: Promise<{ monthId: string }> }) {
  try {
    const session = await requireIdToken();
    const { user } = session;
    if (user.role === "team_member") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { monthId } = await context.params;
    const url = new URL(request.url);
    const scale = clampScale(url.searchParams.get("scale"));
    const preview = url.searchParams.get("preview") === "1";

    const snapshot = await api.get<MonthSnapshot & { ok: boolean }>(`/api/v1/months/${monthId}`, session);

    const document = createElement(SchedulePdfDocument, {
      orgName: snapshot.month.orgName,
      monthId: snapshot.month.monthId,
      rows: snapshot.assignments,
      scale,
    }) as unknown as ReactElement<DocumentProps>;

    const buffer = await renderToBuffer(document);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${snapshot.month.monthId}-schedule.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate PDF" },
      { status: 400 },
    );
  }
}
