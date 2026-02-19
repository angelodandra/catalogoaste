import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizePhone } from "@/lib/accessSign";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();
    const p = normalizePhone(String(phone || ""));
    if (!p) return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("customers")
      .select("status")
      .eq("phone", p)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "not_registered" }, { status: 404 });
    if (String(data.status).toLowerCase() !== "active") {
      return NextResponse.json({ ok: false, error: "not_active" }, { status: 403 });
    }

    // === LOGIN LOG (customer_logins) ===

    try {

      await supabase.from("customer_logins").insert({ customer_phone: p });

    } catch (e) {

      console.error("LOGIN LOG ERROR", e);

    }

    // === END LOGIN LOG ===


    const res = NextResponse.json({ ok: true });
    res.cookies.set("customer_phone", p, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
