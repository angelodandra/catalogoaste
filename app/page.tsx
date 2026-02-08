import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export default async function HomePage() {
  const cookieStore = await cookies();
  const customerPhone = cookieStore.get("customer_phone")?.value || "";

  // se NON loggato -> registrazione
  if (!customerPhone) redirect("/register");

  // se loggato -> ultimo catalogo attivo
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("catalogs")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const id = data?.[0]?.id as string | undefined;
  if (id) redirect(`/catalog/${id}`);

  redirect("/register");
}
