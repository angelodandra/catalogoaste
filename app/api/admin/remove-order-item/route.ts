import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const { orderId, productId } = await req.json();
    if (!orderId || !productId) {
      return NextResponse.json({ error: "orderId/productId mancanti" }, { status: 400 });
    }

    const supabase = supabaseServer();

    // 1) elimina riga ordine
    const { error: delErr } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId)
      .eq("product_id", productId);

    if (delErr) throw delErr;

    // 2) rimetti in vendita prodotto
    const { error: pErr } = await supabase
      .from("products")
      .update({ is_sold: false })
      .eq("id", productId);

    if (pErr) throw pErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
