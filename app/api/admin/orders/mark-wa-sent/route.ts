import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId mancante" }, { status: 400 });

    const supabase = supabaseServer();

    const { error } = await supabase
      .from("orders")
      .update({
        wa_status: "sent",
        wa_error: null,
        wa_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
