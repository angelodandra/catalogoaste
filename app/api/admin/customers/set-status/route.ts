import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { customerId, status } = await req.json();
    if (!customerId) return NextResponse.json({ error: "customerId mancante" }, { status: 400 });
    if (!status || !["active", "revoked"].includes(status))
      return NextResponse.json({ error: "status non valido" }, { status: 400 });

    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("customers")
      .update({ status })
      .eq("id", customerId)
      .select("id,name,company,phone,status,created_at,updated_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
