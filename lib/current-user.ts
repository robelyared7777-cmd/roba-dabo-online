import { supabaseBrowser } from "@/lib/supabase-browser";

export async function getCurrentProfile() {
  const sb = supabaseBrowser();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return null;
  }

  const {
    data: profile,
    error,
  } = await sb
    .from("profiles")
    .select(
      "id,full_name,role,active,phone,employee_code,email"
    )
    .eq("id", user.id)
    .single();

  if (error || !profile?.active) {
    return null;
  }

  return {
    ...profile,
    authEmail: user.email ?? "",
  };
}