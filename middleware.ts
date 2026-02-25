import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CANONICAL_HOST = "ordini.fratellidandrassi.com";

export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  const { nextUrl } = req;
  const host = req.headers.get("host") || "";

  // Forza dominio canonico SOLO per /admin (e sottopagine)
  if (nextUrl.pathname.startsWith("/admin") && host !== CANONICAL_HOST) {
    const url = nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
