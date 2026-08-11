"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-brand-silver transition hover:border-brand-gold-hover hover:text-brand-gold-hover"
    >
      Sign out
    </button>
  );
}
