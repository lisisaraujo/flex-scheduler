"use client";

import { CompanyMember, Invitation } from "@/features/auth/domain/types";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

function invitationState(invitation: Invitation) {
  if (invitation.status === "pending" && invitation.expiresAt < Date.now()) return "expired";
  return invitation.status;
}

export function CompanyAdminPanel({
  invitations,
  members,
  currentUserId,
}: {
  invitations: Invitation[];
  members: CompanyMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeInvitations = useMemo(
    () =>
      invitations.filter((invitation) => {
        const state = invitationState(invitation);
        return state === "pending" || state === "expired";
      }),
    [invitations],
  );

  async function createInvite() {
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to create invitation");
      return;
    }

    setEmail("");
    setRole("user");
    setSuccess(`Invitation email sent to ${payload.invitation.email}.`);
    startTransition(() => router.refresh());
  }

  async function resend(invitationId: string) {
    setError(null);
    setSuccess(null);
    const response = await fetch(`/api/invitations/${invitationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resend" }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to resend invitation");
      return;
    }

    setSuccess(`Invitation email resent to ${payload.invitation.email}.`);
    startTransition(() => router.refresh());
  }

  async function revoke(invitationId: string) {
    setError(null);
    setSuccess(null);
    const response = await fetch(`/api/invitations/${invitationId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to revoke invitation");
      return;
    }

    setSuccess("Invitation revoked.");
    startTransition(() => router.refresh());
  }

  async function removeMember(userId: string) {
    setError(null);
    setSuccess(null);
    const response = await fetch(`/api/members/${userId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to remove member");
      return;
    }

    setSuccess("Member removed.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Invite company members</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Send invitation emails, resend expired ones, or revoke them before they are accepted.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_160px_auto]">
          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="new.user@example.com"
              className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            />
          </label>

          <label className="grid gap-1 text-sm text-zinc-700">
            <span>Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as "user" | "admin")}
              className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <button
            type="button"
            disabled={isPending}
            onClick={createInvite}
            className="self-end rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {isPending ? "Working..." : "Create invite"}
          </button>
        </div>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Invite management</h3>
          {activeInvitations.length > 0 ? (
            activeInvitations.map((invitation) => {
              const state = invitationState(invitation);
              return (
                <div
                  key={invitation.invitationId}
                  className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="font-medium text-zinc-900">{invitation.email}</div>
                    <div className="text-zinc-600">
                      {invitation.role} · {state} · expires {new Date(invitation.expiresAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <button
                      type="button"
                      onClick={() => resend(invitation.invitationId)}
                      className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke(invitation.invitationId)}
                      className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-zinc-500">No pending or expired invitations.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Company members</h2>
          <p className="mt-1 text-sm text-zinc-600">Remove members when they should no longer access your company schedules.</p>
        </div>

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.membershipId}
              className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="font-medium text-zinc-900">{member.name}</div>
                <div className="text-zinc-600">
                  {member.email} · {member.role}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {member.userId === currentUserId ? (
                  <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800">
                    Current admin
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeMember(member.userId)}
                    className="rounded-full bg-rose-100 px-4 py-2 text-sm font-medium text-rose-800"
                  >
                    Remove member
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
