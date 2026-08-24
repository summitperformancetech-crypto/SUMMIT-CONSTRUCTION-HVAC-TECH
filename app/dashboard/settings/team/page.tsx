import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamManagementSection, type TeamMemberRow } from "@/components/team-management-section";

type Profile = {
  org_id: string;
  role: string;
};

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile) {
    redirect("/dashboard");
  }

  if (profile.role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-6 text-center text-sm text-brand-grey-text">
          Team members are managed by your organization&apos;s admins.
        </p>
      </div>
    );
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true })
    .returns<TeamMemberRow[]>();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="mb-4 inline-block text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
      >
        ← Back to Projects
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-brand-gold">Team</h1>
      <TeamManagementSection currentUserId={user.id} members={members ?? []} />
    </div>
  );
}
