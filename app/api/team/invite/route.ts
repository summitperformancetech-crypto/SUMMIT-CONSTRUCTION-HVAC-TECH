import { NextResponse } from "next/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const VALID_ROLES = ["field_tech", "estimator", "admin"] as const;
type Role = (typeof VALID_ROLES)[number];

// This route's whole reason to exist: profiles.org_id is NOT NULL and
// there is no trigger creating a profiles row on auth.users signup (see
// supabase/migrations/20260809180000_base_schema_organizations_profiles.sql's
// own comment) - a brand-new user has nothing to sign in as until an
// admin both creates their auth identity AND attaches a profile. Both
// steps need the service-role key (auth.admin.* is not reachable through
// the normal RLS-scoped client this app uses everywhere else) - the
// first real use of elevated privileges inside the app itself, not just
// a one-off script, so scoped tightly: this route re-verifies the
// caller is an admin itself before touching anything, rather than
// trusting the client to only call it from an already-gated page.
export async function POST(request: Request) {
  let body: { email?: string; full_name?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const fullName = body.full_name?.trim();
  const role = body.role;

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "email, full_name, and role are required" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role as Role)) {
    return NextResponse.json({ error: "role must be field_tech, estimator, or admin" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", caller.id)
    .maybeSingle<{ org_id: string; role: string }>();

  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Only an admin can invite team members" }, { status: 403 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server" },
      { status: 500 },
    );
  }
  const admin = createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  // Two real cases, not one: the email may already have a real
  // auth.users row (e.g. someone created outside this flow, or a
  // second account of an existing user) with no profile yet - inviting
  // them again would fail ("already registered"), and they don't need
  // a new invite email, just the org/role attachment they're actually
  // missing. Try invite first (the common case for a genuinely new
  // teammate); only fall back to the existing-user lookup when the
  // invite itself reports the email is already registered, rather than
  // guessing which case this is up front.
  const origin = new URL(request.url).origin;
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/set-password`,
  });

  let userId: string;
  let alreadyExisted = false;

  if (inviteError) {
    const looksAlreadyRegistered = /already.*registered|already.*exists/i.test(inviteError.message);
    if (!looksAlreadyRegistered) {
      return NextResponse.json({ error: inviteError.message }, { status: 502 });
    }
    // Paginated - this org's whole user base is realistically small
    // enough for a single page during this phase; revisit if that stops
    // being true.
    const { data: listData, error: listError } = await admin.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 502 });
    }
    const existing = listData.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) {
      return NextResponse.json(
        { error: "This email is registered but could not be located to attach a profile." },
        { status: 502 },
      );
    }
    userId = existing.id;
    alreadyExisted = true;
  } else {
    userId = inviteData.user.id;
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    org_id: callerProfile.org_id,
    full_name: fullName,
    role,
    email,
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    alreadyExisted,
    message: alreadyExisted
      ? "This email already had an account - it's now attached to your organization with the role you chose. They can sign in with their existing password."
      : "Invite sent - they'll get an email to set their password and sign in.",
  });
}
