import Link from "next/link";
import { SessionUser } from "@/features/auth/domain/types";
import { LogoutButton } from "./LogoutButton";

export function AppHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-zinc-950">
          Flex Scheduler
        </Link>

        <nav className="flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-700">
            Home
          </Link>
          {user ? (
            <>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">
                {user.companyName} · {user.name} · {user.role}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">
                Log in
              </Link>
              <Link href="/register" className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
