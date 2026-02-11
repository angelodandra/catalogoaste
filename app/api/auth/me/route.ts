import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const p = cookieStore.get("customer_phone")?.value || "";
    if (!p) return NextResponse.json({ ok: false, error: "not_logged" }, { status: 401 });

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("customers")
      .select("name,company,phone,status")
      .eq("phone", p)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "not_registered" }, { status: 401 });
    if (String(data.status).toLowerCase() !== "active") {
      return NextResponse.json({ ok: false, error: "not_active" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
