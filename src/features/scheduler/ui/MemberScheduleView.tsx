"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/features/auth/domain/types";
import { DaySchedule, MonthSnapshot, ShiftSlotRef, ShiftSwapRequest, ShiftType } from "@/features/scheduler/domain/types";
import { ScheduleTable } from "./ScheduleTable";

interface OwnShiftOption {
  key: string;
  ref: ShiftSlotRef;
  label: string;
}

interface TeammateShiftOption {
  key: string;
  ref: ShiftSlotRef;
  memberId: string;
  memberName: string;
  label: string;
}

function refKey(ref: ShiftSlotRef) {
  return `${ref.date}:${ref.shiftType}:${ref.slot}`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftKindLabel(shiftType: ShiftType) {
  return shiftType === "night" ? "Night" : "Day";
}

function shiftRefLabel(ref: ShiftSlotRef) {
  return `${shiftKindLabel(ref.shiftType)} shift · ${formatDate(ref.date)}`;
}

function buildOwnShiftOptions(assignments: DaySchedule[], userId: string): OwnShiftOption[] {
  const options: OwnShiftOption[] = [];

  for (const row of assignments) {
    (["night", "day"] as ShiftType[]).forEach((shiftType) => {
      if (shiftType === "day" && !row.weekend) return;
      const ids = shiftType === "night" ? row.nightIds : row.dayIds;

      ids.forEach((memberId, slotIndex) => {
        if (memberId !== userId) return;
        const ref: ShiftSlotRef = { date: row.date, shiftType, slot: slotIndex as 0 | 1 };
        options.push({ key: refKey(ref), ref, label: shiftRefLabel(ref) });
      });
    });
  }

  return options;
}

function buildTeammateShiftOptions(assignments: DaySchedule[], userId: string): TeammateShiftOption[] {
  const options: TeammateShiftOption[] = [];

  for (const row of assignments) {
    (["night", "day"] as ShiftType[]).forEach((shiftType) => {
      if (shiftType === "day" && !row.weekend) return;
      const ids = shiftType === "night" ? row.nightIds : row.dayIds;
      const names = shiftType === "night" ? row.night : row.day;

      ids.forEach((memberId, slotIndex) => {
        if (!memberId || memberId === userId) return;
        const ref: ShiftSlotRef = { date: row.date, shiftType, slot: slotIndex as 0 | 1 };
        const memberName = names[slotIndex] ?? "Unknown";
        options.push({
          key: refKey(ref),
          ref,
          memberId,
          memberName,
          label: `${memberName} · ${shiftRefLabel(ref)}`,
        });
      });
    });
  }

  return options.sort((left, right) => left.ref.date.localeCompare(right.ref.date));
}

function statusBadgeClasses(status: ShiftSwapRequest["status"]) {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "accepted":
      return "bg-emerald-100 text-emerald-800";
    case "declined":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

function SwapRequestCard({
  swap,
  currentUserId,
  busy,
  onRespond,
  onCancel,
}: {
  swap: ShiftSwapRequest;
  currentUserId: string;
  busy: boolean;
  onRespond: (swap: ShiftSwapRequest, accept: boolean) => void;
  onCancel: (swap: ShiftSwapRequest) => void;
}) {
  const isIncoming = swap.requesteeId === currentUserId;
  const yourShift = isIncoming ? swap.requesteeShift : swap.requesterShift;
  const theirShift = isIncoming ? swap.requesterShift : swap.requesteeShift;
  const counterpartName = isIncoming ? swap.requesterName : swap.requesteeName;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/45 bg-white/55 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl">
      <div className="space-y-1 text-sm">
        <p className="font-medium text-zinc-900">
          {isIncoming ? `${counterpartName} wants to swap with you` : `You proposed a swap to ${counterpartName}`}
        </p>
        <p className="text-zinc-600">
          Your <strong>{shiftRefLabel(yourShift)}</strong> ↔ their <strong>{shiftRefLabel(theirShift)}</strong>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusBadgeClasses(swap.status)}`}>
          {swap.status}
        </span>
        {swap.status === "pending" && isIncoming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRespond(swap, true)}
              className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-950/90 disabled:opacity-60"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRespond(swap, false)}
              className="rounded-full border border-white/50 bg-white/60 px-4 py-2 text-xs font-medium text-zinc-800 transition hover:bg-white/80 disabled:opacity-60"
            >
              Decline
            </button>
          </>
        ) : null}
        {swap.status === "pending" && !isIncoming ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(swap)}
            className="rounded-full border border-white/50 bg-white/60 px-4 py-2 text-xs font-medium text-zinc-800 transition hover:bg-white/80 disabled:opacity-60"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MemberScheduleView({
  snapshot,
  currentUser,
}: {
  snapshot: MonthSnapshot;
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [swaps, setSwaps] = useState<ShiftSwapRequest[]>([]);
  const [loadingSwaps, setLoadingSwaps] = useState(true);
  const [busySwapId, setBusySwapId] = useState<string | null>(null);
  const [ownShiftKey, setOwnShiftKey] = useState("");
  const [teammateShiftKey, setTeammateShiftKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const ownShiftOptions = useMemo(
    () => buildOwnShiftOptions(snapshot.assignments, currentUser.userId),
    [snapshot.assignments, currentUser.userId],
  );
  const teammateShiftOptions = useMemo(
    () => buildTeammateShiftOptions(snapshot.assignments, currentUser.userId),
    [snapshot.assignments, currentUser.userId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingSwaps(true);

    fetch(`/api/months/${snapshot.month.monthId}/swaps`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload?.ok) {
          setSwaps(payload.swaps as ShiftSwapRequest[]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSwaps(false);
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot.month.monthId]);

  async function submitSwapRequest() {
    setError(null);
    setSuccess(null);

    const ownShift = ownShiftOptions.find((option) => option.key === ownShiftKey);
    const teammateShift = teammateShiftOptions.find((option) => option.key === teammateShiftKey);

    if (!ownShift || !teammateShift) {
      setError("Choose both your shift and the teammate's shift you want to swap for.");
      return;
    }

    const response = await fetch(`/api/months/${snapshot.month.monthId}/swaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requesteeId: teammateShift.memberId,
        requesterShift: ownShift.ref,
        requesteeShift: teammateShift.ref,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to send swap request");
      return;
    }

    setSuccess(`Swap request sent to ${teammateShift.memberName}.`);
    setOwnShiftKey("");
    setTeammateShiftKey("");
    setSwaps((current) => [payload.swap as ShiftSwapRequest, ...current]);
  }

  async function respondToSwap(swap: ShiftSwapRequest, accept: boolean) {
    setError(null);
    setSuccess(null);
    setBusySwapId(swap.swapId);

    try {
      const response = await fetch(`/api/months/${snapshot.month.monthId}/swaps/${swap.swapId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Failed to respond to swap request");
        return;
      }

      setSwaps((current) => current.map((item) => (item.swapId === swap.swapId ? (payload.swap as ShiftSwapRequest) : item)));
      setSuccess(accept ? "Swap accepted. The schedule has been updated." : "Swap declined.");

      if (accept) {
        startTransition(() => router.refresh());
      }
    } finally {
      setBusySwapId(null);
    }
  }

  async function cancelSwap(swap: ShiftSwapRequest) {
    setError(null);
    setSuccess(null);
    setBusySwapId(swap.swapId);

    try {
      const response = await fetch(`/api/months/${snapshot.month.monthId}/swaps/${swap.swapId}/cancel`, {
        method: "POST",
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Failed to cancel swap request");
        return;
      }

      setSwaps((current) => current.map((item) => (item.swapId === swap.swapId ? (payload.swap as ShiftSwapRequest) : item)));
      setSuccess("Swap request cancelled.");
    } finally {
      setBusySwapId(null);
    }
  }

  const pendingIncoming = swaps.filter((swap) => swap.status === "pending" && swap.requesteeId === currentUser.userId);
  const others = swaps.filter((swap) => !(swap.status === "pending" && swap.requesteeId === currentUser.userId));

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.52))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-950">
              {snapshot.month.orgName} · {snapshot.month.monthId}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              {currentUser.name} · {currentUser.email} · {currentUser.companyName}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
            Schedule published
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          Your shifts are highlighted below. If a date does not work for you, propose a swap with a teammate who is
          working a different shift this month — they will get an email and can accept or decline.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
      </div>

      <ScheduleTable rows={snapshot.assignments} highlightMemberId={currentUser.userId} />

      <section className="space-y-4 rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.54))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Propose a shift swap</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Pick one of your shifts to give up and the teammate&apos;s shift you would like instead.
          </p>
        </div>

        {ownShiftOptions.length === 0 ? (
          <p className="text-sm text-zinc-600">You are not assigned to any shifts this month, so there is nothing to swap.</p>
        ) : teammateShiftOptions.length === 0 ? (
          <p className="text-sm text-zinc-600">No teammates have assigned shifts to swap with yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Your shift to give up</span>
              <select
                value={ownShiftKey}
                onChange={(event) => setOwnShiftKey(event.target.value)}
                className="rounded-xl border border-white/50 bg-white/65 px-3 py-2 text-sm text-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl"
              >
                <option value="">Select a shift…</option>
                {ownShiftOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Shift you want instead</span>
              <select
                value={teammateShiftKey}
                onChange={(event) => setTeammateShiftKey(event.target.value)}
                className="rounded-xl border border-white/50 bg-white/65 px-3 py-2 text-sm text-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl"
              >
                <option value="">Select a teammate&apos;s shift…</option>
                {teammateShiftOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={submitSwapRequest}
              disabled={!ownShiftKey || !teammateShiftKey}
              className="rounded-full bg-zinc-950/88 px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:bg-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send request
            </button>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-[2rem] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.54))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
        <h2 className="text-xl font-semibold text-zinc-950">Your swap requests</h2>
        {loadingSwaps ? (
          <p className="text-sm text-zinc-500">Loading swap requests…</p>
        ) : swaps.length === 0 ? (
          <p className="text-sm text-zinc-500">No swap requests yet.</p>
        ) : (
          <div className="space-y-3">
            {[...pendingIncoming, ...others].map((swap) => (
              <SwapRequestCard
                key={swap.swapId}
                swap={swap}
                currentUserId={currentUser.userId}
                busy={isPending || busySwapId === swap.swapId}
                onRespond={respondToSwap}
                onCancel={cancelSwap}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
