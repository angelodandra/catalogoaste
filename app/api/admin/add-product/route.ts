import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();

    const catalog_id = String(body.catalogId ?? body.catalog_id ?? "").trim();
    const box_number = String(body.boxNumber ?? body.box_number ?? "").trim();
    const progressive_number =
      body.progressiveNumber ?? body.progressive_number ?? null;
    const price_eur =
      body.priceEur ?? body.price_eur ?? null;
    const image_path =
      body.imagePath ?? body.image_path ?? null;

    if (!catalog_id) return NextResponse.json({ ok: false, error: "catalogId mancante" }, { status: 400 });
    if (!box_number) return NextResponse.json({ ok: false, error: "boxNumber mancante" }, { status: 400 });

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("products")
      .insert({
        catalog_id,
        box_number,
        progressive_number: progressive_number === null ? null : Number(progressive_number),
        price_eur: price_eur === null ? null : Number(price_eur),
        image_path: image_path ? String(image_path) : null,
        is_sold: false,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, product: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
