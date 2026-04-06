import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getCurrentUser } from "@/features/auth/server/session";
import { AppHeader } from "@/features/auth/ui/AppHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flex Scheduler MVP",
  description: "Month-based availability intake and admin scheduling MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userPromise = getCurrentUser();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RootShell userPromise={userPromise}>{children}</RootShell>
      </body>
    </html>
  );
}

async function RootShell({
  children,
  userPromise,
}: Readonly<{
  children: React.ReactNode;
  userPromise: ReturnType<typeof getCurrentUser>;
}>) {
  const user = await userPromise;
  return (
    <>
      <AppHeader user={user} />
      <div>
        {children}
      </div>
    </>
  );
}
