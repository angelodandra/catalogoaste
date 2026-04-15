import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OP_DOMAIN = "@op.interno";

function parseList(s: string | undefined | null) {
  return (s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowed(email: string): boolean {
  const e = email.toLowerCase();
  if (e.endsWith(OP_DOMAIN)) return true;
  const admins = parseList(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  return admins.includes(e);
}

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = (userData.user.email || "").toLowerCase();
  if (!isAllowed(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get phones from body
  const body = await req.json().catch(() => ({}));
  const phones: string[] = Array.isArray(body.phones) ? body.phones : [];
  if (!phones.length) return NextResponse.json({ companies: {} });

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("phone, company")
    .in("phone", phones);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companies: Record<string, string | null> = {};
  for (const row of (data || []) as any[]) {
    companies[String(row.phone).trim()] = row.company ?? null;
  }

  return NextResponse.json({ companies });
}
