import { redirect } from "next/navigation";
import { getInvitationById } from "@/features/auth/server/repository";
import { getCurrentUser } from "@/features/auth/server/session";
import { AcceptInvitationForm } from "@/features/auth/ui/AcceptInvitationForm";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/");
  }

  const { invitationId } = await params;
  const invitation = await getInvitationById(invitationId);

  if (invitation.status !== "pending" || invitation.expiresAt < Date.now()) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-950">Invitation unavailable</h1>
          <p className="mt-2 text-sm text-zinc-600">This invitation is no longer active. Ask your admin to send a new one.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <AcceptInvitationForm
        invitationId={invitation.invitationId}
        email={invitation.email}
        companyName={invitation.companyName}
        role={invitation.role}
      />
    </main>
  );
}
