import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Row = { productId: string; price: number | null };

export async function POST(req: Request) {
  try {
    const { catalogId, rows } = await req.json();
    if (!catalogId || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const supabase = supabaseServer();

    for (const r of rows as Row[]) {
      if (!r.productId) continue;

      const price =
        r.price === null || r.price === undefined || Number.isNaN(Number(r.price))
          ? null
          : Number(r.price);

      const { error } = await supabase
        .from("products")
        .update({ price_eur: price })
        .eq("id", r.productId)
        .eq("catalog_id", catalogId);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
