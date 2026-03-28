import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

type Row = { productId: string; price: number | null; weightKg?: number | null; pesoInternoKg?: number | null };

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const { catalogId, rows } = await req.json();
    if (!catalogId || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const supabase = supabaseServer();

    for (const r of rows as Row[]) {
      if (!r.productId) continue;

      const price = toNumberOrNull(r.price);
      const weight = toNumberOrNull(r.weightKg);

      // Aggiorna solo price_eur e weight_kg; peso_interno_kg è gestito
      // esclusivamente dall'import CSV e non va mai sovrascritto da qui.
      const updatePayload: Record<string, any> = { price_eur: price, weight_kg: weight };

      // Solo se pesoInternoKg è esplicitamente presente nel payload lo aggiorniamo
      if ("pesoInternoKg" in r) {
        updatePayload.peso_interno_kg = toNumberOrNull(r.pesoInternoKg);
      }

      const { error } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", r.productId)
        .eq("catalog_id", catalogId);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
