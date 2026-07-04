import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/server/session";
import { api } from "@/lib/backend";
import { AdminMonthView } from "@/features/scheduler/ui/AdminMonthView";
import { MonthSnapshot } from "@/features/scheduler/domain/types";
import { TeamMember } from "@/features/auth/domain/types";

export default async function AdminMonthPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = await params;
  const session = await getSession();

  if (!session) redirect("/login");

  const { user } = session;
  const isAdmin = user.role === "team_admin" || user.role === "org_admin";
  if (!isAdmin) redirect("/");

  try {
    const [snapshot, membersData] = await Promise.all([
      api.get<MonthSnapshot & { ok: boolean }>(`/api/v1/months/${monthId}`, session),
      api.get<{ ok: boolean; members: TeamMember[] }>("/api/v1/members", session).catch(() => ({ ok: true, members: [] as TeamMember[] })),
    ]);

    return (
      <main className="relative mx-auto min-h-screen max-w-7xl px-6 py-12">
        <div className="pointer-events-none absolute inset-x-6 top-4 h-56 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
        <AdminMonthView snapshot={snapshot} members={membersData.members} />
      </main>
    );
  } catch {
    notFound();
  }
}
