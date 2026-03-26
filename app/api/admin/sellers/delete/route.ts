import { NextResponse } from "next/server";
import { readSellers, writeSellers } from "@/lib/sellers";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const { phone } = await req.json();
    if (!phone) return NextResponse.json({ error: "phone mancante" }, { status: 400 });

    const sellers = readSellers().filter((s) => s.phone !== phone);
    writeSellers(sellers);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "errore server" }, { status: 500 });
  }
}
