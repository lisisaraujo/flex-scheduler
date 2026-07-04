"use client";

import { CompanyMember, Invitation } from "@/features/auth/domain/types";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

function invitationState(invitation: Invitation) {
  if (invitation.status === "pending" && invitation.expiresAt < Date.now()) return "expired";
  return invitation.status;
}

interface SchedulingFormState {
  active: boolean;
  maxShifts: string;
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
  const [role, setRole] = useState<"team_member" | "team_admin">("team_member");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [memberSettings, setMemberSettings] = useState<Record<string, SchedulingFormState>>(() =>
    Object.fromEntries(
      members.map((member) => [
        member.userId,
        {
          active: member.schedulingProfile.active,
          maxShifts: member.schedulingProfile.maxShifts?.toString() ?? "",
        },
      ]),
    ),
  );

  const activeInvitations = useMemo(
    () =>
      invitations.filter((invitation) => {
        const state = invitationState(invitation);
        return state === "pending" || state === "expired";
      }),
    [invitations],
  );

  function updateMemberSettings(userId: string, next: Partial<SchedulingFormState>) {
    setMemberSettings((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? {
          active: true,
          maxShifts: "",
        }),
        ...next,
      },
    }));
  }

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
    setRole("team_member");
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

  async function saveScheduling(userId: string) {
    setError(null);
    setSuccess(null);

    const settings = memberSettings[userId];
    if (!settings) {
      setError("Missing scheduling settings for this member.");
      return;
    }

    const normalizedMaxShifts = settings.maxShifts.trim() === "" ? null : Number(settings.maxShifts);
    if (normalizedMaxShifts !== null && (!Number.isInteger(normalizedMaxShifts) || normalizedMaxShifts < 0)) {
      setError("Max shifts must be a whole number or left empty.");
      return;
    }

    const response = await fetch(`/api/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        active: settings.active,
        maxShifts: normalizedMaxShifts,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to update member scheduling");
      return;
    }

    setSuccess("Member scheduling settings updated.");
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
              onChange={(event) => setRole(event.target.value as "team_member" | "team_admin")}
              className="rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-900"
            >
              <option value="team_member">Team Member</option>
              <option value="team_admin">Team Admin</option>
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
          <p className="mt-1 text-sm text-zinc-600">
            Manage scheduler participation, max shifts, and member access in one place.
          </p>
        </div>

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.membershipId}
              className="grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm"
            >
              <div>
                <div className="font-medium text-zinc-900">{member.name}</div>
                <div className="text-zinc-600">
                  {member.email} · {member.role}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[140px_160px_auto] md:items-start">
                <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={memberSettings[member.userId]?.active ?? true}
                    onChange={(event) => updateMemberSettings(member.userId, { active: event.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Active in scheduler</span>
                </label>

                <label className="grid gap-1 text-sm text-zinc-700 md:max-w-[160px]">
                  <span>Max shifts</span>
                  <input
                    type="number"
                    min={0}
                    max={31}
                    value={memberSettings[member.userId]?.maxShifts ?? ""}
                    onChange={(event) => updateMemberSettings(member.userId, { maxShifts: event.target.value })}
                    placeholder="No limit"
                    className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-zinc-900"
                  />
                </label>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => saveScheduling(member.userId)}
                    className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
                  >
                    Save settings
                  </button>
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
