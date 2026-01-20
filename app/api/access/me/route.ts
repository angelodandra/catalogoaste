import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const phone = cookieStore.get("customer_phone")?.value || "";

  if (!phone) {
    return NextResponse.json({ ok: false, error: "not_logged" }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("customers")
    .select("name, company, phone, status")
    .eq("phone", phone)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (data.status !== "active") {
    return NextResponse.json({ ok: false, error: "not_active" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, customer: data });
}
