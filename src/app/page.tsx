import Link from "next/link";
import { getCurrentUser } from "@/features/auth/server/session";
import { listInvitationsForCompany, listMembersForCompany } from "@/features/auth/server/repository";
import { CompanyAdminPanel } from "@/features/auth/ui/CompanyAdminPanel";
import { UserCoworkerPreferencesPanel } from "@/features/auth/ui/UserCoworkerPreferencesPanel";
import { CreateMonthForm } from "@/features/scheduler/ui/CreateMonthForm";
import { isFirestoreConfigured } from "@/features/scheduler/server/db";
import { listMonths } from "@/features/scheduler/server/repository";

export default async function HomePage() {
  const user = await getCurrentUser();
  const configured = isFirestoreConfigured();
  const allMonths = configured && user ? await listMonths(user.companyId).catch(() => []) : [];
  const months =
    user?.role === "admin"
      ? allMonths
      : allMonths.filter((month) => month.status !== "draft" && month.status !== "archived");
  const invitations =
    configured && user?.role === "admin" ? await listInvitationsForCompany(user.companyId).catch(() => []) : [];
  const members = configured && user ? await listMembersForCompany(user.companyId).catch(() => []) : [];
  const currentMember = user ? members.find((member) => member.userId === user.userId) ?? null : null;
  const currentMonthId = new Date().toISOString().slice(0, 7);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-14">
      <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">Scheduler MVP</p>
            <h1 className="max-w-xl text-5xl font-semibold tracking-tight text-zinc-950">
              Restructured around month intake, admin scheduling, and a simpler path to the real product.
            </h1>
            <p className="max-w-xl text-lg text-zinc-600">
              This version keeps the MVP honest: one month at a time, explicit shift-level availability, public day
              visibility, admin controls, and a generated schedule table.
            </p>
            <p className="max-w-xl text-sm text-zinc-700">
              {user
                ? `Signed in as ${user.name} (${user.email}) in ${user.companyName}.`
                : "No account session yet. Create a company first, then log into it."}
            </p>
          </div>

          <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Current MVP scope</h2>
            <ul className="grid gap-2 text-sm text-zinc-700">
              <li>Public month page for availability intake</li>
              <li>Visible names already available on each shift</li>
              <li>Per-shift cap managed by admin</li>
              <li>Manual schedule generation with a simple rule set</li>
              <li>Schedule table ready for later PDF/email work</li>
            </ul>
            <div className="pt-2">
              <Link
                href={`/m/${currentMonthId}?demo=1`}
                className="inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-950"
              >
                Open this month in demo mode
              </Link>
            </div>
          </div>

          {!configured ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
              Firestore is not configured yet. Use the demo month above to test the calendar UI, or add
              `FIREBASE_SERVICE_ACCOUNT` to create real months.
            </div>
          ) : null}
        </div>

        {user?.role === "admin" ? (
          <div className="grid gap-6">
            <CreateMonthForm defaultOrgName={user.companyName} />
            <CompanyAdminPanel invitations={invitations} members={members} currentUserId={user.userId} />
          </div>
        ) : user ? (
          <div className="grid gap-4">
            <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-950">Company member view</h2>
              <p className="text-sm text-zinc-600">
                You are signed in as a user. Published months for {user.companyName} will appear below once an admin creates them.
              </p>
            </div>
            <UserCoworkerPreferencesPanel
              currentUserId={user.userId}
              currentPreferredCoworkerIds={currentMember?.schedulingProfile.preferredCoworkerIds ?? []}
              members={members}
              showMembershipWarning={!currentMember}
            />
          </div>
        ) : (
          <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Create a company first</h2>
            <p className="text-sm text-zinc-600">
              The app now uses company-scoped accounts. Register your company to create the first admin account.
            </p>
            <div className="flex gap-3">
              <Link href="/register" className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
                Create company
              </Link>
              <Link href="/login" className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">
                Log in
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="mt-12 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-950">Existing months</h2>
            <p className="mt-1 text-sm text-zinc-600">Open the public intake or admin control view for any month.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {months.length > 0 ? (
            months.map((month) => (
              <article key={month.monthId} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-950">{month.monthId}</h3>
                    <p className="mt-1 text-sm text-zinc-600">{month.orgName}</p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-700">
                    {month.status}
                  </span>
                </div>

                <div className="mt-4 text-sm text-zinc-600">
                  <div>Deadline: {new Date(month.deadlineAt).toLocaleString()}</div>
                  <div>Cap per shift: {month.intakeLimitPerShift}</div>
                </div>

                <div className="mt-5 flex gap-3">
                  <Link
                    href={`/m/${month.monthId}`}
                    className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
                  >
                    Open month
                  </Link>
                  {user?.role === "admin" ? (
                    <Link
                      href={`/admin/${month.monthId}`}
                      className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900"
                    >
                      Admin view
                    </Link>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
              No months yet. Create the first month using the form above.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
