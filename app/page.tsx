import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    redirect("/admin");
  }

  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

  const { data: active, error } = await supabase
    .from("catalogs")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !active?.id) {
    redirect("/admin");
  }

  redirect(`/catalog/${active.id}`);
}
