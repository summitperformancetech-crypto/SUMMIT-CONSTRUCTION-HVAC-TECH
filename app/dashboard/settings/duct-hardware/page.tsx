import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DuctHardwareDefaultsSettings,
  type DiffuserDefaultRow,
  type DuctMaterialDefaultRow,
} from "@/components/duct-hardware-defaults-settings";

type Profile = {
  org_id: string;
  role: string;
};

type PatternTypeRow = {
  code: string;
  tag_code: string;
  description: string;
};

type DiffuserOrgDefaultRow = {
  pattern_type: string;
  manufacturer: string;
  model: string | null;
};

type MaterialSpecRow = {
  code: string;
  display_name: string;
};

type MaterialOrgDefaultRow = {
  material_code: string;
  manufacturer: string;
  product_line: string | null;
};

export default async function DuctHardwareSettingsPage() {
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
          Duct hardware defaults are managed by your organization&apos;s admins.
        </p>
      </div>
    );
  }

  const [{ data: patternTypes }, { data: diffuserDefaults }, { data: materialSpecs }, { data: materialDefaults }] =
    await Promise.all([
      supabase
        .from("duct_diffuser_pattern_types")
        .select("code, tag_code, description")
        .order("code")
        .returns<PatternTypeRow[]>(),
      supabase
        .from("diffuser_org_defaults")
        .select("pattern_type, manufacturer, model")
        .eq("org_id", profile.org_id)
        .returns<DiffuserOrgDefaultRow[]>(),
      supabase
        .from("duct_material_specs")
        .select("code, display_name")
        .order("code")
        .returns<MaterialSpecRow[]>(),
      supabase
        .from("duct_material_org_defaults")
        .select("material_code, manufacturer, product_line")
        .eq("org_id", profile.org_id)
        .returns<MaterialOrgDefaultRow[]>(),
    ]);

  const diffuserDefaultByType = new Map((diffuserDefaults ?? []).map((d) => [d.pattern_type, d]));
  const diffuserRows: DiffuserDefaultRow[] = (patternTypes ?? []).map((pt) => {
    const def = diffuserDefaultByType.get(pt.code);
    return {
      patternType: pt.code,
      tagCode: pt.tag_code,
      description: pt.description,
      manufacturer: def?.manufacturer ?? "",
      model: def?.model ?? null,
    };
  });

  const materialDefaultByCode = new Map((materialDefaults ?? []).map((d) => [d.material_code, d]));
  const materialRows: DuctMaterialDefaultRow[] = (materialSpecs ?? []).map((m) => {
    const def = materialDefaultByCode.get(m.code);
    return {
      materialCode: m.code,
      displayName: m.display_name,
      manufacturer: def?.manufacturer ?? "",
      productLine: def?.product_line ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
      >
        ← Back to projects
      </Link>
      <h1 className="mb-2 text-xl font-semibold text-brand-gold">Duct Hardware Defaults</h1>
      <p className="mb-6 text-sm text-brand-grey-text">
        Set your organization&apos;s default diffuser and duct-material manufacturer/product line
        per pattern type and material tier - used by the install package generator whenever a
        project hasn&apos;t specified its own selection.
      </p>
      <DuctHardwareDefaultsSettings
        orgId={profile.org_id}
        initialDiffuserRows={diffuserRows}
        initialMaterialRows={materialRows}
      />
    </div>
  );
}
