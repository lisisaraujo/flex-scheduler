import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/server/session";
import { api } from "@/lib/backend";
import { buildDemoMonthSnapshot } from "@/features/scheduler/server/demo";
import { MemberScheduleView } from "@/features/scheduler/ui/MemberScheduleView";
import { PublicMonthView } from "@/features/scheduler/ui/PublicMonthView";
import { MonthSnapshot } from "@/features/scheduler/domain/types";

export default async function PublicMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ monthId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { monthId } = await params;
  const { demo } = await searchParams;
  const session = await getSession();

  if (!session) redirect("/login");

  const { user } = session;
  const isAdmin = user.role === "team_admin" || user.role === "org_admin";

  try {
    const snapshot = await api.get<MonthSnapshot & { ok: boolean }>(`/api/v1/months/${monthId}`, session);

    if (!isAdmin && (snapshot.month.status === "draft" || snapshot.month.status === "archived")) {
      notFound();
    }

    const showMemberView = !isAdmin && snapshot.month.status === "scheduled";

    return (
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
        {showMemberView ? (
          <MemberScheduleView snapshot={snapshot} currentUser={user} />
        ) : (
          <PublicMonthView snapshot={snapshot} currentUser={user} />
        )}
      </main>
    );
  } catch {
    if (demo === "1") {
      const snapshot = buildDemoMonthSnapshot(monthId);
      return (
        <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
          <PublicMonthView snapshot={snapshot} currentUser={user} />
        </main>
      );
    }
    notFound();
  }
}
