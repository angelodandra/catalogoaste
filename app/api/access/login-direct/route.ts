import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizePhone } from "@/lib/accessSign";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();
    const p = normalizePhone(phone || "");
    if (!p) {
      return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("customers")
      .select("status")
      .eq("phone", p)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "not_registered" }, { status: 404 });
    }

    if (data.status !== "active") {
      return NextResponse.json({ ok: false, error: "not_active" }, { status: 403 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("customer_phone", p, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
