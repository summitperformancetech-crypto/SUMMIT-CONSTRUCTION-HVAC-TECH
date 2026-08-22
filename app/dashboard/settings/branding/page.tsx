import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrgBrandingSettings, type OrgBrandingRow } from "@/components/org-branding-settings";

type Profile = {
  org_id: string;
  role: string;
};

export default async function BrandingSettingsPage() {
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
          Report branding is managed by your organization&apos;s admins.
        </p>
      </div>
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name, license_number, logo_data_uri")
    .eq("id", profile.org_id)
    .single<OrgBrandingRow>();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
      >
        ← Back to projects
      </Link>
      <h1 className="mb-2 text-xl font-semibold text-brand-gold">Report Branding</h1>
      <p className="mb-6 text-sm text-brand-grey-text">
        Controls what appears on the cover page and footer of every report generated for
        this organization.
      </p>
      <OrgBrandingSettings
        orgId={profile.org_id}
        initial={org ?? { name: "", license_number: null, logo_data_uri: null }}
      />
    </div>
  );
}
