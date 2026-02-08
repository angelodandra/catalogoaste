import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export default async function HomePage({ searchParams }: { searchParams: { pwa?: string } }) {
  // Se apertura da PWA -> vai al catalogo attivo più recente
  if (searchParams?.pwa === "1") {
    const supabase = supabaseServer();
    const { data } = await supabase
      .from("catalogs")
      .select("id,is_active,created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const id = data?.[0]?.id as string | undefined;
    if (id) redirect(`/catalog/${id}`);
  }

  // fallback: vai al catalogo (se vuoi cambiamo dopo)
  redirect("/admin");
}
