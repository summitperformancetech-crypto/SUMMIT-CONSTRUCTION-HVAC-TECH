"use client";

// SUMMIT-REPORT-STANDARD.md Section 4: "Org identity (name, license #,
// logo) pulls from the contractor's account/org profile - never
// hardcoded, never left as a bracketed placeholder in a shipped report."
// This is the form that actually lets an admin enter that real data -
// license_number/logo_data_uri start null (see the migration that added
// them) and stay that way, correctly blocking a real report's branding
// section, until someone fills this in.
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type OrgBrandingRow = {
  name: string;
  license_number: string | null;
  logo_data_uri: string | null;
};

// Keeps the single-self-contained-HTML-file report (Section 2) actually
// self-contained - logos are stored as data: URIs, not Storage URLs, so
// nothing external has to be fetched at render time. 200KB keeps a
// reasonable report file size; a contractor logo doesn't need to be huge.
const MAX_LOGO_BYTES = 200_000;

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function OrgBrandingSettings({
  orgId,
  initial,
}: {
  orgId: string;
  initial: OrgBrandingRow;
}) {
  const [name, setName] = useState(initial.name);
  const [licenseNumber, setLicenseNumber] = useState(initial.license_number ?? "");
  const [logoDataUri, setLogoDataUri] = useState(initial.logo_data_uri);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setMessageIsError(true);
      setMessage(`Logo file is too large (${Math.round(file.size / 1024)}KB) - keep it under ${Math.round(MAX_LOGO_BYTES / 1024)}KB so generated reports stay a reasonable size.`);
      return;
    }
    const dataUri = await readFileAsDataUri(file);
    setLogoDataUri(dataUri);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    setMessageIsError(false);
    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: name.trim(),
        license_number: licenseNumber.trim() || null,
        logo_data_uri: logoDataUri,
      })
      .eq("id", orgId);
    setSaving(false);
    if (error) {
      setMessageIsError(true);
      setMessage(error.message);
      return;
    }
    setMessage("Saved. This information will appear on every report generated from now on.");
  }

  const reportReady = name.trim().length > 0 && licenseNumber.trim().length > 0;

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-gold">Report Branding</h2>
      <p className="mb-4 text-sm text-brand-grey-text">
        Shown on the cover page and footer of every generated report - a report cannot
        show a real license number or logo until these are entered here, and will show an
        explicit &ldquo;not on file&rdquo; state rather than a blank or fabricated value if
        they&apos;re missing.
      </p>
      {!reportReady && (
        <p className="mb-4 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">
          Organization name and license number are both required before reports can show
          complete branding.
        </p>
      )}
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Organization Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-md rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Contractor License Number
          </label>
          <input
            type="text"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="e.g. TACLA92868E"
            className="w-full max-w-md rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">Logo</label>
          <div className="flex items-center gap-3">
            {logoDataUri && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoDataUri} alt="Org logo preview" className="h-12 rounded bg-white p-1" />
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-gold transition hover:bg-brand-gold/10"
            >
              {logoDataUri ? "Replace logo" : "Upload logo"}
            </button>
            {logoDataUri && (
              <button
                onClick={() => setLogoDataUri(null)}
                className="text-xs text-brand-grey-text underline decoration-dotted hover:text-red-400"
              >
                Remove
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>
        </div>
        <div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Branding"}
          </button>
        </div>
        {message && (
          <p className={`text-sm ${messageIsError ? "text-red-400" : "text-brand-silver"}`} role={messageIsError ? "alert" : undefined}>
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
