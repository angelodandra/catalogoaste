import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const { productId } = await req.json();
    if (!productId) return NextResponse.json({ error: "productId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    // Rimette in vendita: is_sold=false + is_published=true
    // (is_published potrebbe essere false se era stato nascosto con "Elimina venduti")
    const { error } = await supabase
      .from("products")
      .update({ is_sold: false, is_published: true })
      .eq("id", productId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
