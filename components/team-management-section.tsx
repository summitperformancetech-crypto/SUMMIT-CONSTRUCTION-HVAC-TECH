"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export type TeamMemberRow = {
  id: string;
  email: string | null;
  full_name: string;
  role: string;
  created_at: string;
};

const ROLE_OPTIONS = [
  { value: "field_tech", label: "Field Tech" },
  { value: "estimator", label: "Estimator" },
  { value: "admin", label: "Admin" },
] as const;

export function TeamManagementSection({
  currentUserId,
  members: initialMembers,
}: {
  currentUserId: string;
  members: TeamMemberRow[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("field_tech");
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const adminCount = members.filter((m) => m.role === "admin").length;

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMessage(null);
    setInviteError(null);

    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName, role }),
    });
    const result = await res.json();

    setInviting(false);

    if (!res.ok) {
      setInviteError(result.error ?? "Something went wrong");
      return;
    }

    setInviteMessage(result.message);
    setEmail("");
    setFullName("");
    setRole("field_tech");

    // Re-fetch rather than optimistically append - the invite route ran
    // under the service role, so this client's own RLS-scoped read is
    // the real confirmation the row exists and this admin can see it.
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: true })
      .returns<TeamMemberRow[]>();
    if (data) setMembers(data);
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    setRowError(null);
    const member = members.find((m) => m.id === memberId);
    if (member?.role === "admin" && newRole !== "admin" && adminCount <= 1) {
      setRowError("Can't change this member's role - your organization needs at least one admin.");
      return;
    }
    setBusyId(memberId);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", memberId);
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
  }

  async function handleRemove(memberId: string) {
    setRowError(null);
    const member = members.find((m) => m.id === memberId);
    if (member?.role === "admin" && adminCount <= 1) {
      setRowError("Can't remove this member - your organization needs at least one admin.");
      return;
    }
    if (!window.confirm(`Remove ${member?.full_name ?? "this member"} from your organization?`)) return;
    setBusyId(memberId);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").delete().eq("id", memberId);
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-brand-gold/50 bg-brand-bg p-4">
        <h2 className="mb-3 text-sm font-semibold text-brand-silver-highlight">Current members</h2>
        <ul className="divide-y divide-brand-gold/20">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-brand-silver-highlight">
                  {member.full_name}
                  {member.id === currentUserId && (
                    <span className="ml-2 text-xs text-brand-grey-text">(you)</span>
                  )}
                </p>
                <p className="text-xs text-brand-grey-text">{member.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  disabled={busyId === member.id}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleRemove(member.id)}
                  disabled={busyId === member.id}
                  className="text-xs text-red-400 underline decoration-dotted hover:text-red-300 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        {rowError && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {rowError}
          </p>
        )}
      </div>

      <form
        onSubmit={handleInvite}
        className="space-y-4 rounded-lg border border-brand-gold/50 bg-brand-bg p-4"
      >
        <h2 className="text-sm font-semibold text-brand-silver-highlight">Invite a team member</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="invite-name" className="mb-1 block text-xs text-brand-silver">
              Full name
            </label>
            <input
              id="invite-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            />
          </div>
          <div>
            <label htmlFor="invite-email" className="mb-1 block text-xs text-brand-silver">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            />
          </div>
        </div>
        <div>
          <label htmlFor="invite-role" className="mb-1 block text-xs text-brand-silver">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold sm:w-56"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {inviteError && (
          <p className="text-sm text-red-400" role="alert">
            {inviteError}
          </p>
        )}
        {inviteMessage && <p className="text-sm text-brand-success">{inviteMessage}</p>}

        <button
          type="submit"
          disabled={inviting}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {inviting ? "Sending…" : "Send invite"}
        </button>
      </form>
    </div>
  );
}
