import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ ok: false, error: "missing orderId" }, { status: 400 });

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("orders")
      .select("id,status,created_at,customer_name,customer_phone,wa_status,wa_error,wa_last_attempt_at")
      .eq("id", orderId)
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, order: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
