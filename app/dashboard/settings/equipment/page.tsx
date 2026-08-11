import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EquipmentPreferencesSettings,
  type EquipmentPreferenceRow,
} from "@/components/equipment-preferences-settings";

type Profile = {
  org_id: string;
  role: string;
};

type EquipmentCatalogRow = {
  id: string;
  manufacturer: string;
  model_number: string;
  equipment_type: string;
};

type EquipmentOrgPreferenceRow = {
  equipment_id: string;
  is_preferred: boolean;
  is_exclusive: boolean;
};

export default async function EquipmentSettingsPage() {
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
          Equipment preferences are managed by your organization&apos;s admins.
        </p>
      </div>
    );
  }

  const [{ data: catalog }, { data: preferences }] = await Promise.all([
    supabase
      .from("equipment_catalog")
      .select("id, manufacturer, model_number, equipment_type")
      .order("manufacturer", { ascending: true })
      .returns<EquipmentCatalogRow[]>(),
    supabase
      .from("equipment_org_preferences")
      .select("equipment_id, is_preferred, is_exclusive")
      .eq("org_id", profile.org_id)
      .returns<EquipmentOrgPreferenceRow[]>(),
  ]);

  const preferenceByEquipmentId = new Map(
    (preferences ?? []).map((p) => [p.equipment_id, p]),
  );

  const rows: EquipmentPreferenceRow[] = (catalog ?? []).map((c) => {
    const pref = preferenceByEquipmentId.get(c.id);
    return {
      equipmentId: c.id,
      manufacturer: c.manufacturer,
      modelNumber: c.model_number,
      equipmentType: c.equipment_type,
      isPreferred: pref?.is_preferred ?? false,
      isExclusive: pref?.is_exclusive ?? false,
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
      >
        ← Back to projects
      </Link>
      <h1 className="mb-2 text-xl font-semibold text-brand-gold">Equipment Preferences</h1>
      <p className="mb-6 text-sm text-brand-grey-text">
        Flag equipment lines your organization carries preferentially or distributes
        exclusively - used only to break ties/near-ties in Manual S equipment selection
        results.
      </p>
      <EquipmentPreferencesSettings orgId={profile.org_id} initialRows={rows} />
    </div>
  );
}
