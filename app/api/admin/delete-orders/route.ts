import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * Body:
 * {
 *   mode: "all" | "range",
 *   from?: "YYYY-MM-DD",
 *   to?: "YYYY-MM-DD",
 *   deletePdfs?: boolean
 * }
 */
export async function POST(req: Request) {
  try {
    const { mode, from, to, deletePdfs } = await req.json();

    if (mode !== "all" && mode !== "range") {
      return NextResponse.json({ error: "mode non valido" }, { status: 400 });
    }

    if (mode === "range" && (!from || !to)) {
      return NextResponse.json({ error: "Inserisci from e to (YYYY-MM-DD)" }, { status: 400 });
    }

    const supabase = supabaseServer();

    const fromIso = mode === "range" ? `${from}T00:00:00Z` : null;
    const toIso = mode === "range" ? `${to}T23:59:59Z` : null;

    let q = supabase.from("orders").select("id");
    if (mode === "range") {
      q = q.gte("created_at", fromIso!).lte("created_at", toIso!);
    }

    const { data: orders, error: oErr } = await q;
    if (oErr) throw oErr;

    const orderIds = (orders || []).map((x: any) => x.id);
    if (orderIds.length === 0) {
      return NextResponse.json({ ok: true, deletedOrders: 0, deletedItems: 0, deletedPdfs: 0, releasedProducts: 0 });
    }

    const { data: oi, error: oiErr } = await supabase
      .from("order_items")
      .select("product_id")
      .in("order_id", orderIds);

    if (oiErr) throw oiErr;

    const productIds = Array.from(new Set((oi || []).map((x: any) => x.product_id).filter(Boolean)));

    let releasedProducts = 0;
    if (productIds.length > 0) {
      const { error: pErr, count: pCount } = await supabase
        .from("products")
        .update({ is_sold: false }, { count: "exact" })
        .in("id", productIds);

      if (pErr) throw pErr;
      releasedProducts = pCount ?? productIds.length;
    }

    const { error: iErr, count: itemsCount } = await supabase
      .from("order_items")
      .delete({ count: "exact" })
      .in("order_id", orderIds);

    if (iErr) throw iErr;

    const { error: dErr, count: ordersCount } = await supabase
      .from("orders")
      .delete({ count: "exact" })
      .in("id", orderIds);

    if (dErr) throw dErr;

    let deletedPdfs = 0;
    if (deletePdfs) {
      const paths = orderIds.map((id) => `orders/${id}.pdf`);
      const { error: sErr } = await supabase.storage.from("order-pdfs").remove(paths);
      if (sErr) throw sErr;
      deletedPdfs = paths.length;
    }

    return NextResponse.json({
      ok: true,
      deletedOrders: ordersCount ?? orderIds.length,
      deletedItems: itemsCount ?? 0,
      deletedPdfs,
      releasedProducts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
