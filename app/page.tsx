import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export default async function HomePage() {
  // 1) check login (cookie customer_phone)
  const h = await headers();
  const host = h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const base = `${proto}://${host}`;

  const meRes = await fetch(`${base}/api/access/me`, { cache: "no-store" }).catch(() => null);
  if (!meRes || !meRes.ok) {
    redirect("/register");
  }

  // 2) se loggato -> catalogo attivo
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
