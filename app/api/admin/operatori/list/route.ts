import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin, adminErrorResponse } from "@/lib/requireAdmin";

const OP_DOMAIN = "@op.interno";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch (e) {
    return adminErrorResponse(e);
  }

  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const operators = (data.users || [])
      .filter((u) => (u.email || "").endsWith(OP_DOMAIN))
      .map((u) => ({
        id: u.id,
        username: (u.email || "").replace(OP_DOMAIN, ""),
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));

    return NextResponse.json({ ok: true, operators });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Errore" }, { status: 500 });
  }
}
