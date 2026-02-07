import { NextResponse } from "next/server";
import { normalizePhone, verifyAccess } from "@/lib/accessSign";

export const runtime = "nodejs";

/**
 * /entra (link pulito):
 * - richiede phone + exp + sig (link firmato)
 * - setta cookie customer_phone e reindirizza a /
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const hostHeader = req.headers.get("host") || url.host;
  const origin = `${proto}://${hostHeader}`;

  const rawPhone = url.searchParams.get("phone") || "";
  const phone = normalizePhone(rawPhone);

  const exp = url.searchParams.get("exp") || "";
  const sig = url.searchParams.get("sig") || "";

  if (!phone || !exp || !sig) return new NextResponse("Dati mancanti", { status: 400 });

  const ok = verifyAccess({ phone, exp, action: "login", sig });
  if (!ok) return new NextResponse("Link non valido o scaduto", { status: 401 });

    // exp può arrivare come UNIX seconds (es. 1771062152) oppure come data ISO
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
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
