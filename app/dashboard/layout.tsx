import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { OfflineStatusBanner } from "@/components/offline-status-banner";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string }>();
    isAdmin = profile?.role === "admin";
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-brand-gold/50 px-6 py-4">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-brand-silver-highlight">
            Summit
          </span>
          <span className="hidden text-xs text-brand-gold sm:inline">
            Built on Integrity. Engineered for Excellence.
          </span>
        </Link>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/dashboard/settings/team"
              className="text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
            >
              Team
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/settings/equipment"
              className="text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
            >
              Equipment Preferences
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/settings/branding"
              className="text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
            >
              Report Branding
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>
      <OfflineStatusBanner />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
