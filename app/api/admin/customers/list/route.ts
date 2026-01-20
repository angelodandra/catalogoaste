import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const supabase = supabaseServer();

    let query = supabase
      .from("customers")
      .select("id,name,company,phone,status,created_at,updated_at")
      .order("created_at", { ascending: false });

    // filtro semplice lato SQL (ilike)
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, customers: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
