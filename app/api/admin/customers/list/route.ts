import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const supabase = supabaseServer();

    let query = supabase
      .from("customers")
      .select("id,name,company,phone,status,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, customers: data || [] });
  } catch (e: any) {
    const msg = String(e?.message || "Errore");
    const status =
      msg.startsWith("admin_unauthorized") ? 401 :
      msg.startsWith("admin_forbidden") ? 403 :
      500;

    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
