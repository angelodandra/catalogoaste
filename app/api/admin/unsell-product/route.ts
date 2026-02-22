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

    const { error } = await supabase
      .from("products")
      .update({ is_sold: false })
      .eq("id", productId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
