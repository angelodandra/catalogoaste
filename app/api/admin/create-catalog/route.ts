import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { title } = await req.json();
    if (!title) {
      return NextResponse.json({ error: "Titolo mancante" }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("catalogs")
      .insert({ title, is_active: true })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, catalog: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore" }, { status: 500 });
  }
}
