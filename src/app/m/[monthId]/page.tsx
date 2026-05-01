import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";
import { buildDemoMonthSnapshot } from "@/features/scheduler/server/demo";
import { getMonthSnapshotForCompany } from "@/features/scheduler/server/repository";
import { PublicMonthView } from "@/features/scheduler/ui/PublicMonthView";

export default async function PublicMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ monthId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { monthId } = await params;
  const { demo } = await searchParams;
  const currentUser = await getCurrentUser();

  try {
    if (!currentUser) {
      redirect("/login");
    }

    const snapshot = await getMonthSnapshotForCompany(currentUser.companyId, monthId);
    if (currentUser.role !== "admin" && (snapshot.month.status === "draft" || snapshot.month.status === "archived")) {
      notFound();
    }

    return (
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
        <PublicMonthView snapshot={snapshot} currentUser={currentUser} />
      </main>
    );
  } catch {
    if (demo === "1") {
      const snapshot = buildDemoMonthSnapshot(monthId);
      return (
        <main className="mx-auto min-h-screen max-w-7xl px-6 py-12">
          <PublicMonthView snapshot={snapshot} currentUser={currentUser} />
        </main>
      );
    }
    notFound();
  }
}
