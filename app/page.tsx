import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export default async function HomePage() {
  const supabase = supabaseServer();

  const { data } = await supabase
    .from("catalogs")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const id = data?.[0]?.id as string | undefined;

  if (id) redirect(`/catalog/${id}`);

  // fallback cliente (mai admin)
  redirect("/access");
}
