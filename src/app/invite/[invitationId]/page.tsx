import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";
import { api } from "@/lib/backend";
import { AcceptInvitationForm } from "@/features/auth/ui/AcceptInvitationForm";
import { Invitation } from "@/features/auth/domain/types";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect("/");

  const { invitationId } = await params;

  let invitation: Invitation;
  try {
    const data = await api.getPublic<{ ok: boolean; invitation: Invitation }>(
      `/api/v1/invitations/${invitationId}`,
    );
    invitation = data.invitation;
  } catch {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-950">Invitation not found</h1>
          <p className="mt-2 text-sm text-zinc-600">
            This invitation link is invalid. Ask your admin to send a new one.
          </p>
        </div>
      </main>
    );
  }

  if (invitation.status !== "pending" || invitation.expiresAt < Date.now()) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-950">Invitation unavailable</h1>
          <p className="mt-2 text-sm text-zinc-600">
            This invitation is no longer active. Ask your admin to send a new one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <AcceptInvitationForm
        invitationId={invitation.invitationId}
        email={invitation.email}
        teamName={invitation.teamName}
        role={invitation.role}
      />
    </main>
  );
}
