import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";
import { AuthForm } from "@/features/auth/ui/AuthForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <AuthForm mode="login" />
    </main>
  );
}
