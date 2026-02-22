import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const supabase = supabaseServer();
    const url = new URL(req.url);
    const catalogId = url.searchParams.get("catalogId");

    if (!catalogId) {
      return NextResponse.json({ ok: false, error: "catalogId mancante (usa ?catalogId=...)" }, { status: 400 });
    }

    // Provo a prendere un prodotto NON venduto.
    // Se hai anche is_published nella tabella, lo gestiamo dopo: qui andiamo sul sicuro.
    const { data, error } = await supabase
      .from("products")
      .select("id,catalog_id,box_number,progressive_number,is_sold,price_eur,image_path")
      .eq("catalog_id", catalogId)
      .eq("is_sold", false)
      .order("progressive_number", { ascending: true })
      .limit(1);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, product: (data || [])[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
