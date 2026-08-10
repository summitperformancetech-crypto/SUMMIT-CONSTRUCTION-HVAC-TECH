import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-zinc-100">
            Summit
          </span>
          <span className="hidden text-xs text-amber-500 sm:inline">
            Built on Integrity. Engineered for Excellence.
          </span>
        </Link>
        <SignOutButton />
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
