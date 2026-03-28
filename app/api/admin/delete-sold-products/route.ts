import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

/**
 * "Elimina venduti" — non cancella nulla.
 * Imposta is_published=false sui prodotti venduti del catalogo:
 *   - scompaiono dal catalogo clienti (filtro is_published=true)
 *   - record e foto rimangono intatti
 *   - se l'admin rimette in vendita un prodotto (unsell), viene ripubblicato
 */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const { catalogId } = await req.json();
    if (!catalogId)
      return NextResponse.json({ ok: false, error: "missing catalogId" }, { status: 400 });

    const supabase = supabaseServer();

    // Conta prima quanti prodotti venduti ci sono
    const { data: soldProducts, error: spErr } = await supabase
      .from("products")
      .select("id")
      .eq("catalog_id", catalogId)
      .eq("is_sold", true)
      .eq("is_published", true); // solo quelli ancora pubblicati

    if (spErr) throw spErr;
    if (!soldProducts?.length) {
      return NextResponse.json({ ok: true, hidden: 0, message: "Nessun prodotto venduto visibile da nascondere" });
    }

    const productIds = soldProducts.map((p: any) => p.id);

    // Imposta is_published=false → spariscono dal catalogo clienti
    const { error: updErr } = await supabase
      .from("products")
      .update({ is_published: false })
      .in("id", productIds);

    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      hidden: productIds.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
