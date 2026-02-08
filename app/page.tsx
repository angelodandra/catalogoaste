import { supabaseServer } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function HomePage() {
  const supabase = supabaseServer();

  const { data: catalog, error } = await supabase
    .from("catalogs")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && catalog?.id) {
    redirect(`/catalog/${catalog.id}`);
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Nessun catalogo disponibile</h1>
        <p className="mt-2 text-sm text-gray-600">
          Al momento non risultano cataloghi attivi. Riprova più tardi.
        </p>
      </div>
    </div>
  );
}
