import { supabaseServer } from "@/lib/supabaseServer";

export default async function TestSupabasePage() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("catalogs")
    .select("id,title,is_active,created_at")
    .order("created_at", { ascending: false });

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Test Supabase</h1>

      {error && (
        <pre style={{ background: "#fee", padding: 12 }}>
          Errore: {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <pre style={{ background: "#f6f6f6", padding: 12 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
