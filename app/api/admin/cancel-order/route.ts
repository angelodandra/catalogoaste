import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    // 1) prendi righe ordine
    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select("product_id")
      .eq("order_id", orderId);

    if (iErr) throw iErr;

    const productIds = (items || []).map((x: any) => x.product_id).filter(Boolean);

    // 2) rimetti in vendita i prodotti
    if (productIds.length) {
      const { error: pErr } = await supabase
        .from("products")
        .update({ is_sold: false })
        .in("id", productIds);

      if (pErr) throw pErr;
    }

    // 3) aggiorna ordine
    const { error: oErr } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId);

    if (oErr) throw oErr;

    return NextResponse.json({ ok: true, restored: productIds.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
