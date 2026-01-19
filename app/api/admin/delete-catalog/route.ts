import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { catalogId } = await req.json();
    if (!catalogId) return NextResponse.json({ error: "catalogId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    // 1) Prendi i file delle immagini da cancellare
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("image_path")
      .eq("catalog_id", catalogId);

    if (pErr) throw pErr;

    const paths = (products || []).map((p: any) => p.image_path).filter(Boolean);

    // 2) Cancella immagini dallo storage (se esistono)
    if (paths.length > 0) {
      const { error: sErr } = await supabase.storage.from("catalog-images").remove(paths);
      if (sErr) throw sErr;
    }

    // 3) Cancella catalogo (cascade elimina products, orders, order_items)
    const { error: cErr } = await supabase.from("catalogs").delete().eq("id", catalogId);
    if (cErr) throw cErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
