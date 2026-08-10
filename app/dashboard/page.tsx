import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Project = {
  id: string;
  name: string;
  project_type: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  created_at: string;
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, project_type, address_line1, city, state, zip, created_at")
    .order("created_at", { ascending: false })
    .returns<Project[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-brand-silver-highlight">Projects</h1>
        <Link
          href="/dashboard/new"
          className="rounded-md bg-brand-bronze px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-bronze-hover"
        >
          New Project
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-300">
          Couldn&apos;t load projects: {error.message}
        </p>
      )}

      {!error && projects && projects.length === 0 && (
        <p className="rounded-md border border-zinc-800 bg-brand-bg px-4 py-6 text-center text-sm text-brand-grey-text">
          No projects yet. Create your first one to get started.
        </p>
      )}

      {!error && projects && projects.length > 0 && (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-brand-bg">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/dashboard/${project.id}`}
                className="flex items-center justify-between px-4 py-4 transition hover:bg-zinc-900"
              >
                <div>
                  <p className="font-medium text-brand-silver-highlight">{project.name}</p>
                  <p className="text-sm text-brand-grey-text">
                    {project.address_line1}, {project.city}, {project.state}{" "}
                    {project.zip}
                  </p>
                </div>
                <span className="rounded-full border border-brand-bronze/40 px-3 py-1 text-xs font-medium text-brand-bronze-text">
                  {PROJECT_TYPE_LABEL[project.project_type] ?? project.project_type}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
