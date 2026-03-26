import { NextResponse } from "next/server";
import { readSellers, writeSellers } from "@/lib/sellers";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const { name, phone } = await req.json();
    if (!name || !phone) {
      return NextResponse.json({ error: "name o phone mancanti" }, { status: 400 });
    }

    const sellers = readSellers();

    if (sellers.find((s) => s.phone === phone)) {
      return NextResponse.json({ error: "venditore già esistente" }, { status: 400 });
    }

    sellers.push({
      name,
      phone,
      active: true,
    });

    writeSellers(sellers);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "errore server" }, { status: 500 });
  }
}
