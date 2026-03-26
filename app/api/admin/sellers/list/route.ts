import { NextResponse } from "next/server";
import { readSellers } from "@/lib/sellers";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ ok: true, sellers: readSellers() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "errore server" }, { status: 500 });
  }
}
