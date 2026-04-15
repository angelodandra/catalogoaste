import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

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

function bearerFromAuthHeader(auth: string | null | undefined): string | null {
  const a = (auth || "").trim();
  if (!a) return null;
  if (a.toLowerCase().startsWith("bearer ")) {
    const tok = a.slice(7).trim();
    return tok || null;
  }
  return null;
}

async function getSupabaseAccessToken(req?: Request): Promise<string | null> {
  try {
    const tReq = bearerFromAuthHeader(req?.headers?.get("authorization") || req?.headers?.get("Authorization"));
    if (tReq) return tReq;
  } catch {}

  try {
    const hs = await headers();
    const tHs = bearerFromAuthHeader(hs.get("authorization") || hs.get("Authorization"));
    if (tHs) return tHs;
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

export function operatorErrorResponse(e: any) {
  const msg = e?.message ?? "Errore";
  const status = msg.startsWith("operator_unauthorized") ? 401 : msg.startsWith("operator_forbidden") ? 403 : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Verifica che l'utente sia un operatore (NEXT_PUBLIC_OPERATOR_EMAILS) */
export async function requireOperator(req?: Request) {
  const token = await getSupabaseAccessToken(req);
  if (!token) throw new Error("operator_unauthorized_no_token");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error("operator_unauthorized_invalid_token");

  const email = (data.user.email || "").toLowerCase();
  const allow = parseList(process.env.NEXT_PUBLIC_OPERATOR_EMAILS);

  if (!email) throw new Error("operator_forbidden_email_missing");
  if (allow.length > 0 && !allow.includes(email)) throw new Error("operator_forbidden_email_not_allowed");

  return { user: data.user, email };
}

/** Verifica che l'utente sia admin O operatore (per API condivise) */
export async function requireAdminOrOperator(req?: Request) {
  const token = await getSupabaseAccessToken(req);
  if (!token) throw new Error("operator_unauthorized_no_token");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error("operator_unauthorized_invalid_token");

  const email = (data.user.email || "").toLowerCase();
  const admins = parseList(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  const operators = parseList(process.env.NEXT_PUBLIC_OPERATOR_EMAILS);
  const allAllowed = [...admins, ...operators];

  if (!email) throw new Error("operator_forbidden_email_missing");
  if (allAllowed.length > 0 && !allAllowed.includes(email))
    throw new Error("operator_forbidden_email_not_allowed");

  const role: "admin" | "operator" = admins.includes(email) ? "admin" : "operator";
  return { user: data.user, email, role };
}
