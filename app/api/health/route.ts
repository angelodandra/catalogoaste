import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  return NextResponse.json({
    ok: true,
    hasSupabaseUrl: !!supabaseUrl,
    supabaseUrlStart: supabaseUrl ? supabaseUrl.slice(0, 24) + "..." : null,
    hasAnonKey: !!anon,
    anonKeyStart: anon ? anon.slice(0, 10) + "..." : null,
    hasServiceRoleKey: !!service,
    serviceRoleKeyStart: service ? service.slice(0, 10) + "..." : null,
  });
}
