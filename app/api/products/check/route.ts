import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const body = await req.json();

  const productIds: string[] = body.productIds || [];

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ ok: false, error: "productIds mancanti" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("products")
    .select("id,is_sold")
    .in("id", productIds);

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  const sold = (data || []).filter((p) => p.is_sold).map((p) => p.id);

  return NextResponse.json({ ok: true, sold });
}
