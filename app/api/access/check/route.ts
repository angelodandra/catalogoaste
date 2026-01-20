import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizePhone } from "@/lib/accessSign";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();
    const p = normalizePhone(phone || "");
    if (!p) return NextResponse.json({ ok: true, authorized: false });

    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("is_customer_active", { p_phone: p });
    if (error) throw error;

    return NextResponse.json({ ok: true, authorized: !!data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, authorized: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
