"use client";

import { CompanyMember } from "@/features/auth/domain/types";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export function UserCoworkerPreferencesPanel({
  currentUserId,
  currentPreferredCoworkerIds,
  members,
  showMembershipWarning = false,
}: {
  currentUserId: string;
  currentPreferredCoworkerIds: string[];
  members: CompanyMember[];
  showMembershipWarning?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preferredCoworkerIds, setPreferredCoworkerIds] = useState(currentPreferredCoworkerIds);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const memberOptions = useMemo(
    () =>
      members
        .filter((member) => member.userId !== currentUserId)
        .map((member) => ({
          userId: member.userId,
          label: `${member.name} · ${member.email}`,
        })),
    [currentUserId, members],
  );

  async function savePreferences() {
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/members/${currentUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredCoworkerIds }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to update preferred coworkers");
      return;
    }

    setSuccess("Preferred coworkers updated.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-zinc-950">Your coworker preferences</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Choose coworkers you prefer to be scheduled with. This is a personal preference, not an admin setting.
        </p>
        {showMembershipWarning ? (
          <p className="mt-2 text-sm text-amber-700">
            Your member profile could not be fully resolved from the company membership list, so existing saved
            preferences may not have loaded yet. You can still choose and save preferences below.
          </p>
        ) : null}
      </div>

      <label className="grid gap-1 text-sm text-zinc-700">
        <span>Preferred coworkers</span>
        <select
          multiple
          value={preferredCoworkerIds}
          onChange={(event) => setPreferredCoworkerIds(Array.from(event.target.selectedOptions, (option) => option.value))}
          className="min-h-[180px] rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-zinc-900"
        >
          {memberOptions.map((option) => (
            <option key={option.userId} value={option.userId}>
              {option.label}
            </option>
          ))}
        </select>
        {memberOptions.length === 0 ? (
          <span className="text-sm text-zinc-500">No other company members are available to select yet.</span>
        ) : null}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={savePreferences}
          className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save preferences"}
        </button>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      </div>
    </div>
  );
}
