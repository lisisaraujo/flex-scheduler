import { NextResponse } from "next/server";
import { DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { createElement, ReactElement } from "react";
import { requireRole } from "@/features/auth/server/session";
import { getMonthSnapshotForCompany } from "@/features/scheduler/server/repository";
import { SchedulePdfDocument } from "@/features/scheduler/ui/SchedulePdfDocument";

function clampScale(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(1, Math.max(0.75, parsed));
}

export async function GET(request: Request, context: { params: Promise<{ monthId: string }> }) {
  try {
    const user = await requireRole("admin");
    const { monthId } = await context.params;
    const url = new URL(request.url);
    const scale = clampScale(url.searchParams.get("scale"));
    const preview = url.searchParams.get("preview") === "1";
    const snapshot = await getMonthSnapshotForCompany(user.companyId, monthId);
    const document = createElement(SchedulePdfDocument, {
      orgName: snapshot.month.orgName,
      monthId: snapshot.month.monthId,
      rows: snapshot.assignments,
      scale,
    }) as unknown as ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(document);
    const pdfBytes = new Uint8Array(buffer);

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${snapshot.month.monthId}-schedule.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 400 },
    );
  }
}
