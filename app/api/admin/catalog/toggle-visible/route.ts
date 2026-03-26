import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const { id, value } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id mancante" }, { status: 400 });
    }

    const supabase = supabaseServer();

    const { error } = await supabase
      .from("catalogs")
      .update({ is_visible: !!value })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "errore server" }, { status: 500 });
  }
}
