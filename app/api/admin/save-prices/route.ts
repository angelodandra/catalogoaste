import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Row = { productId: string; price: number | null; weightKg?: number | null };

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    const { catalogId, rows } = await req.json();
    if (!catalogId || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const supabase = supabaseServer();

    for (const r of rows as Row[]) {
      if (!r.productId) continue;

      const price = toNumberOrNull(r.price);
      const weight = toNumberOrNull((r as any).weightKg);

      const { error } = await supabase
        .from("products")
        .update({ price_eur: price, weight_kg: weight })
        .eq("id", r.productId)
        .eq("catalog_id", catalogId);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
