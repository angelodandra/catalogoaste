import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

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

    const res = NextResponse.json({ ok: true, customers: data || [] });
    res.headers.set("x-admin-guard", "1");
    return res;
  } catch (e: any) {
    const msg = String(e?.message || "admin_unauthorized");
    const status = msg.includes("forbidden") ? 403 : 401;
    return NextResponse.json(
      { ok: false, error: msg },
      { status, headers: { "x-admin-guard": "0" } }
    );
  }
}
