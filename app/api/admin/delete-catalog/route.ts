import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { catalogId } = await req.json();
    if (!catalogId) return NextResponse.json({ ok: false, error: "missing catalogId" }, { status: 400 });

    const supabase = supabaseServer();

    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select("id")
      .eq("catalog_id", catalogId);

    if (oErr) throw oErr;
    const orderIds = (orders || []).map((o: any) => o.id);

    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id,image_path")
      .eq("catalog_id", catalogId);

    if (pErr) throw pErr;

    const productIds = (products || []).map((p: any) => p.id);
    const imagePaths = (products || [])
      .map((p: any) => String(p.image_path || "").trim())
      .filter(Boolean);

    if (orderIds.length > 0) {
      const { error: diErr } = await supabase.from("order_items").delete().in("order_id", orderIds);
      if (diErr) throw diErr;

      const { error: doErr } = await supabase.from("orders").delete().in("id", orderIds);
      if (doErr) throw doErr;
    }

    if (productIds.length > 0) {
      const { error: di2Err } = await supabase.from("order_items").delete().in("product_id", productIds);
      if (di2Err) throw di2Err;
    }

    const { error: delProdErr } = await supabase.from("products").delete().eq("catalog_id", catalogId);
    if (delProdErr) throw delProdErr;

    if (imagePaths.length > 0) {
      const { error: sErr } = await supabase.storage.from("catalog-images").remove(imagePaths);
      if (sErr) console.warn("storage remove error:", sErr.message);
    }

    const { error: cErr } = await supabase.from("catalogs").delete().eq("id", catalogId);
    if (cErr) throw cErr;

    return NextResponse.json({
      ok: true,
      deletedOrders: orderIds.length,
      deletedProducts: productIds.length,
      deletedImages: imagePaths.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
