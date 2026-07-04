import Link from "next/link";
import { getSession } from "@/features/auth/server/session";
import { api } from "@/lib/backend";
import { CompanyAdminPanel } from "@/features/auth/ui/CompanyAdminPanel";
import { UserCoworkerPreferencesPanel } from "@/features/auth/ui/UserCoworkerPreferencesPanel";
import { CreateMonthForm } from "@/features/scheduler/ui/CreateMonthForm";
import { MonthDoc } from "@/features/scheduler/domain/types";
import { TeamMember, Invitation } from "@/features/auth/domain/types";

export default async function HomePage() {
  const session = await getSession();
  const user = session?.user ?? null;

  const isAdmin = user?.role === "team_admin" || user?.role === "org_admin";

  const [allMonths, invitations, members] = await Promise.all([
    session
      ? api.get<{ months: MonthDoc[] }>("/api/v1/months", session).then((d) => d.months).catch(() => [])
      : Promise.resolve([] as MonthDoc[]),
    session && isAdmin
      ? api.get<{ invitations: Invitation[] }>("/api/v1/invitations", session).then((d) => d.invitations).catch(() => [])
      : Promise.resolve([] as Invitation[]),
    session
      ? api.get<{ members: TeamMember[] }>("/api/v1/members", session).then((d) => d.members).catch(() => [])
      : Promise.resolve([] as TeamMember[]),
  ]);

  const months = isAdmin
    ? allMonths
    : allMonths.filter((m) => m.status !== "draft" && m.status !== "archived");

  const currentMember = user ? (members.find((m) => m.userId === user.userId) ?? null) : null;
  const currentMonthId = new Date().toISOString().slice(0, 7);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-14">
      <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">Flex Scheduler</p>
            <h1 className="max-w-xl text-5xl font-semibold tracking-tight text-zinc-950">
              Month-based shift scheduling for your team.
            </h1>
            <p className="max-w-xl text-lg text-zinc-600">
              Submit availability, generate schedules, and manage shift swaps — all in one place.
            </p>
            <p className="max-w-xl text-sm text-zinc-700">
              {user
                ? `Signed in as ${user.name} (${user.email})${user.teamName ? ` · ${user.teamName}` : ` · ${user.orgName}`}.`
                : "Sign in to access your team schedule."}
            </p>
          </div>

          <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Quick actions</h2>
            <ul className="grid gap-2 text-sm text-zinc-700">
              <li>Submit your monthly shift availability</li>
              <li>See who is already on each shift</li>
              <li>Request shift swaps with colleagues</li>
              {isAdmin && <li>Generate and edit the schedule</li>}
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
        </div>

        {isAdmin && user ? (
          <div className="grid gap-6">
            <CreateMonthForm defaultOrgName={user.teamName ?? user.orgName} />
            <CompanyAdminPanel invitations={invitations} members={members} currentUserId={user.userId} />
          </div>
        ) : user ? (
          <div className="grid gap-4">
            <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-950">Team member view</h2>
              <p className="text-sm text-zinc-600">
                You are signed in as a team member of {user.teamName ?? user.orgName}. Published months will appear
                below once an admin creates them.
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
            <h2 className="text-xl font-semibold text-zinc-950">Welcome to Flex Scheduler</h2>
            <p className="text-sm text-zinc-600">
              You need an invitation to join a team. If you already have an account, log in below.
            </p>
            <div className="flex gap-3">
              <Link href="/login" className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
                Log in
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="mt-12 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-950">Months</h2>
            <p className="mt-1 text-sm text-zinc-600">Open the availability view or admin control for any month.</p>
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
                  {isAdmin ? (
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
              No months yet.{isAdmin ? " Create the first month using the form above." : ""}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
