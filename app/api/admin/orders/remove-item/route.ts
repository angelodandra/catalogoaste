import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const orderId = body?.orderId as string | undefined;
    const productId = body?.productId as string | undefined;
    const restock = !!body?.restock;

    if (!orderId || !productId) {
      return NextResponse.json({ error: "orderId/productId mancanti" }, { status: 400 });
    }

    const supabase = supabaseServer();

    // 1) rimuovi riga dall'ordine
    const { error: delErr } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId)
      .eq("product_id", productId);

    if (delErr) throw delErr;

    // 2) se richiesto: rimetti in vendita il prodotto
    if (restock) {
      const { error: pErr } = await supabase
        .from("products")
        .update({ is_sold: false })
        .eq("id", productId);

      if (pErr) throw pErr;
    }

    // 3) segna l'ordine come "da reinviare"
    // (così in admin vedi che è stato modificato)
    await supabase
      .from("orders")
      .update({ wa_status: "pending", wa_error: null })
      .eq("id", orderId);

    return NextResponse.json({ ok: true, restock });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
