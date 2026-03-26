import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { getSellerByPhone } from "@/lib/sellers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const p = cookieStore.get("customer_phone")?.value || "";
    if (!p) return NextResponse.json({ ok: false, error: "not_logged" }, { status: 401 });

    // 👉 PRIMA controlla venditori
    const seller = getSellerByPhone(p);
    if (seller) {
      return NextResponse.json({
        ok: true,
        customer: {
          name: seller.name + " (VENDITORE)",
          company: null,
          phone: seller.phone,
          status: "active",
          role: "seller",
        },
      });
    }

    // 👉 poi clienti normali
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

    try {
      await supabase.from("customer_logins").insert({ customer_phone: p });
    } catch (e) {
      console.error("LOGIN LOG ERROR", e);
    }

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
