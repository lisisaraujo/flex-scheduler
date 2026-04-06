"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isPending}
      className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-60"
    >
      {isPending ? "Logging out..." : "Log out"}
    </button>
  );
}
