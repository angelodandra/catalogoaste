import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizePhone, verifyAccess } from "@/lib/accessSign";

export const runtime = "nodejs";

/**
 * LOGIN:
 * - PROD: richiede phone+exp+sig (link firmato)
 * - DEV (localhost/127.0.0.1): consente anche solo ?phone=... se il cliente è ACTIVE
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const hostHeader = req.headers.get("host") || url.host;
  const origin = `${proto}://${hostHeader}`;

  const rawPhone = url.searchParams.get("phone") || "";
  const phone = normalizePhone(rawPhone);

  // firma (modalità prod)
  const exp = url.searchParams.get("exp") || "";
  const sig = url.searchParams.get("sig") || "";

  // DEV host check
  const host = url.host || "";
  const isDevHost =
    host.includes("127.0.0.1") ||
    host.includes("localhost") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  // Se non ho exp/sig e non sono su devhost -> 400
  const hasSignedParams = !!(phone && exp && sig);

  if (!phone) return new NextResponse("Dati mancanti", { status: 400 });

  if (!hasSignedParams) {
    if (!isDevHost) return new NextResponse("Dati mancanti", { status: 400 });

    // DEV: verifica cliente active
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("customers")
      .select("phone,status")
      .eq("phone", phone)
      .maybeSingle();

    if (error || !data) return new NextResponse("Cliente non trovato", { status: 404 });
    if (data.status !== "active") return new NextResponse("Cliente non attivo", { status: 403 });

    const res = NextResponse.redirect(new URL("/", origin));
    res.cookies.set("customer_phone", phone, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  // SIGNED: verifica firma + scadenza
  const ok = verifyAccess({ phone, exp, action: "login", sig });
  if (!ok) return new NextResponse("Link non valido o scaduto", { status: 401 });

  // exp può arrivare come UNIX seconds (es. 1771058608) oppure come data ISO
  let expMs = Number(exp);
  if (Number.isFinite(expMs) && expMs > 0) {
    if (expMs < 10_000_000_000) expMs = expMs * 1000; // seconds -> ms
  } else {
    expMs = Date.parse(exp);
  }
  if (!Number.isFinite(expMs) || expMs < Date.now()) {
    return new NextResponse("Link scaduto", { status: 410 });
  }

  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.set("customer_phone", phone, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
