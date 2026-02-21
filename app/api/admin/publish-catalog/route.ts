import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { catalogId } = await req.json();
    if (!catalogId) return NextResponse.json({ error: "catalogId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    const { error } = await supabase
      .from("products")
      .update({ is_published: true })
      .eq("catalog_id", catalogId)
      .not("price_eur", "is", null);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
