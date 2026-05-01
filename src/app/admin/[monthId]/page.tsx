import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";
import { getMonthSnapshotForCompany } from "@/features/scheduler/server/repository";
import { AdminMonthView } from "@/features/scheduler/ui/AdminMonthView";

export default async function AdminMonthPage({ params }: { params: Promise<{ monthId: string }> }) {
  const { monthId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.role !== "admin") {
    redirect("/");
  }

  try {
    const snapshot = await getMonthSnapshotForCompany(currentUser.companyId, monthId);
    return (
      <main className="relative mx-auto min-h-screen max-w-7xl px-6 py-12">
        <div className="pointer-events-none absolute inset-x-6 top-4 h-56 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
        <AdminMonthView snapshot={snapshot} />
      </main>
    );
  } catch {
    notFound();
  }
}
