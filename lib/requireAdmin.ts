import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

function parseList(s: string | undefined | null) {
  return (s || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function extractAccessTokenFromCookieValue(v: string): string | null {
  const raw = (v || "").trim();
  if (!raw) return null;

  if (raw.startsWith("eyJ")) return raw;

  try {
    const j: any = JSON.parse(raw);
    if (typeof j?.access_token === "string" && j.access_token) return j.access_token;
    if (Array.isArray(j)) {
      const first = j[0];
      if (typeof first === "string" && first.startsWith("eyJ")) return first;
      if (typeof first?.access_token === "string" && first.access_token) return first.access_token;
    }
  } catch {}

  return null;
}

async function getSupabaseAccessToken(): Promise<string | null> {
  // 0) Authorization: Bearer <jwt>
  try {
    const hs = await headers();
    const auth = (hs.get("authorization") || hs.get("Authorization") || "").trim();
    if (auth.toLowerCase().startsWith("bearer ")) {
      const tok = auth.slice(7).trim();
      if (tok) return tok;
    }
  } catch {}

  const store = await cookies();

  const direct =
    store.get("sb-access-token")?.value ||
    store.get("supabase-auth-token")?.value ||
    store.get("access_token")?.value;

  const t1 = direct ? extractAccessTokenFromCookieValue(direct) : null;
  if (t1) return t1;

  const all = store.getAll();
  const authCookie = all.find((c) => c.name.endsWith("-auth-token") || c.name.includes("auth-token"));
  if (authCookie?.value) {
    const t2 = extractAccessTokenFromCookieValue(authCookie.value);
    if (t2) return t2;
  }

  for (const c of all) {
    const maybe = extractAccessTokenFromCookieValue(c.value || "");
    if (maybe) return maybe;
  }

  return null;
}

export async function requireAdmin() {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error("admin_unauthorized_no_token");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("admin_unauthorized_invalid_token");
  }

  const email = (data.user.email || "").toLowerCase();
  const allow = parseList(process.env.NEXT_PUBLIC_ADMIN_EMAILS);

  if (!email || (allow.length > 0 && !allow.includes(email))) {
    throw new Error("admin_forbidden_email_not_allowed");
  }

  return { user: data.user, email };
}

// Helper: usa questa nei route handler per avere status corretti (401/403) invece di 500
export function adminErrorResponse(e: any) {
  const msg = String(e?.message || "Errore");
  if (msg.startsWith("admin_unauthorized_")) {
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
  if (msg.startsWith("admin_forbidden_")) {
    return NextResponse.json({ ok: false, error: msg }, { status: 403 });
  }
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}
