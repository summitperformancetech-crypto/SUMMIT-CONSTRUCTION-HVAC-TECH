"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ProjectType = "residential" | "commercial" | "industrial";

type FormState = {
  name: string;
  projectType: ProjectType;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
};

const INITIAL_STATE: FormState = {
  name: "",
  projectType: "residential",
  addressLine1: "",
  city: "",
  state: "",
  zip: "",
};

export default function NewProjectPage() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [savedProject, setSavedProject] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be signed in to create a project.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.org_id) {
      setError("Couldn't determine your organization. Contact an admin.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("projects").insert({
      name: form.name,
      project_type: form.projectType,
      address_line1: form.addressLine1,
      city: form.city,
      state: form.state,
      zip: form.zip,
      org_id: profile.org_id,
      created_by: user.id,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSavedProject(form);
  }

  if (savedProject) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-lg border border-amber-500/40 bg-zinc-950 p-6">
          <h1 className="mb-1 text-lg font-semibold text-zinc-100">
            Project created
          </h1>
          <p className="mb-6 text-sm text-zinc-400">
            The following project was saved to Summit.
          </p>

          <dl className="space-y-3 text-sm">
            <Row label="Name" value={savedProject.name} />
            <Row
              label="Type"
              value={
                savedProject.projectType.charAt(0).toUpperCase() +
                savedProject.projectType.slice(1)
              }
            />
            <Row label="Address" value={savedProject.addressLine1} />
            <Row
              label="City / State / Zip"
              value={`${savedProject.city}, ${savedProject.state} ${savedProject.zip}`}
            />
          </dl>

          <div className="mt-6 flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
            >
              Back to dashboard
            </Link>
            <button
              onClick={() => {
                setForm(INITIAL_STATE);
                setSavedProject(null);
              }}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
            >
              Add another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-semibold text-zinc-100">New Project</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950 p-6"
      >
        <Field label="Project name" htmlFor="name">
          <input
            id="name"
            required
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Project type" htmlFor="projectType">
          <select
            id="projectType"
            value={form.projectType}
            onChange={(e) =>
              updateField("projectType", e.target.value as ProjectType)
            }
            className={inputClass}
          >
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="industrial">Industrial</option>
          </select>
        </Field>

        <Field label="Address line 1" htmlFor="addressLine1">
          <input
            id="addressLine1"
            required
            value={form.addressLine1}
            onChange={(e) => updateField("addressLine1", e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="City" htmlFor="city" className="col-span-3 sm:col-span-1">
            <input
              id="city"
              required
              value={form.city}
              onChange={(e) => updateField("city", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="State" htmlFor="state">
            <input
              id="state"
              required
              maxLength={2}
              value={form.state}
              onChange={(e) => updateField("state", e.target.value.toUpperCase())}
              className={inputClass}
            />
          </Field>
          <Field label="Zip" htmlFor="zip">
            <input
              id="zip"
              required
              value={form.zip}
              onChange={(e) => updateField("zip", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save project"}
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500";

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-zinc-300">
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-800 pb-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="text-right font-medium text-zinc-100">{value}</dd>
    </div>
  );
}
