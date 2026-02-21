import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const catalogId = (body.catalogId || "").toString().trim();
    const all = Boolean(body.all);

    if (!all && !catalogId) {
      return NextResponse.json({ ok: false, error: "missing catalogId (or set all:true)" }, { status: 400 });
    }

    const supabase = supabaseServer();

    let q = supabase.from("products").update({ is_sold: false });

    if (!all) q = q.eq("catalog_id", catalogId);

    const { data, error } = await q.select("id");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      updated: (data || []).length,
      scope: all ? "all" : `catalog:${catalogId}`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
