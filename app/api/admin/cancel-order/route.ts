import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { orderId, deletePdf } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    // 1) recupera i prodotti dell'ordine
    const { data: items, error: itErr } = await supabase
      .from("order_items")
      .select("product_id")
      .eq("order_id", orderId);

    if (itErr) throw itErr;

    const productIds = (items || []).map((x: any) => x.product_id).filter(Boolean);

    // 2) rimetti in vendita i prodotti
    if (productIds.length > 0) {
      const { error: pErr } = await supabase.from("products").update({ is_sold: false }).in("id", productIds);
      if (pErr) throw pErr;
    }

    // 3) cancella righe ordine
    const { error: delItemsErr } = await supabase.from("order_items").delete().eq("order_id", orderId);
    if (delItemsErr) throw delItemsErr;

    // 4) cancella ordine
    const { error: delOrderErr } = await supabase.from("orders").delete().eq("id", orderId);
    if (delOrderErr) throw delOrderErr;

    // 5) opzionale: cancella pdf (se esiste)
    let deletedPdf = false;
    if (deletePdf) {
      const path = `orders/${orderId}.pdf`;
      const { error: sErr } = await supabase.storage.from("order-pdfs").remove([path]);
      if (sErr) throw sErr;
      deletedPdf = true;
    }

    return NextResponse.json({
      ok: true,
      removed: true,
      restoredProducts: productIds.length,
      deletedPdf,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
