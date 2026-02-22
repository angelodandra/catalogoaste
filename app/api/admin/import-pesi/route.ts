import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import * as XLSX from "xlsx";

import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

// Livello 2: preview + conferma (apply)
// - POST multipart/form-data
// - fields: catalogId, mode = "preview" | "apply", file (csv/xlsx)

type ParsedRow = {
  progressive_number: number;
  peso_interno_kg: number;
  rowIndex: number;
};

function toNum(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const form = await req.formData();
    const catalogId = (form.get("catalogId") as string | null)?.trim() || "";
    const mode = ((form.get("mode") as string | null)?.trim() || "preview") as "preview" | "apply";
    const file = form.get("file") as File | null;

    if (!catalogId) return NextResponse.json({ error: "catalogId mancante" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "file mancante" }, { status: 400 });
    if (mode !== "preview" && mode !== "apply") return NextResponse.json({ error: "mode non valido" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());

    // parse: prima colonna progressivo, seconda colonna peso (senza header)
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });

    const parsed: ParsedRow[] = [];
    const invalid: { rowIndex: number; reason: string; a: any; b: any }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as any[];
      if (!r || r.length === 0) continue;

      const a = r[0];
      const b = r[1];

      const pn = toNum(a);
      const pk = toNum(b);

      // salta righe totalmente vuote
      if (pn == null && pk == null) continue;

      if (pn == null || !Number.isInteger(pn) || pn <= 0) {
        invalid.push({ rowIndex: i + 1, reason: "progressivo non valido", a, b });
        continue;
      }
      if (pk == null || pk <= 0) {
        invalid.push({ rowIndex: i + 1, reason: "peso non valido", a, b });
        continue;
      }

      parsed.push({ progressive_number: pn, peso_interno_kg: Math.round(pk * 100) / 100, rowIndex: i + 1 });
    }

    if (parsed.length === 0) {
      return NextResponse.json({ error: "Nessuna riga valida nel file", invalid }, { status: 400 });
    }

    // normalizza duplicati: ultima riga vince
    const map = new Map<number, ParsedRow>();
    for (const r of parsed) map.set(r.progressive_number, r);
    const unique = Array.from(map.values()).sort((a, b) => a.progressive_number - b.progressive_number);

    const supabase = supabaseServer();

    // carico i prodotti del catalogo per matching
    const { data: prods, error: pErr } = await supabase
      .from("products")
      .select("id,progressive_number,peso_interno_kg")
      .eq("catalog_id", catalogId);

    if (pErr) throw pErr;

    const prodByProg = new Map<number, { id: string; progressive_number: number; peso_interno_kg: number | null }>();
    for (const p of (prods || []) as any[]) prodByProg.set(p.progressive_number, p);

    const matched: { progressive_number: number; peso_interno_kg: number; productId: string }[] = [];
    const notFound: { progressive_number: number; peso_interno_kg: number }[] = [];

    for (const r of unique) {
      const p = prodByProg.get(r.progressive_number);
      if (!p) {
        notFound.push({ progressive_number: r.progressive_number, peso_interno_kg: r.peso_interno_kg });
        continue;
      }
      matched.push({ progressive_number: r.progressive_number, peso_interno_kg: r.peso_interno_kg, productId: p.id });
    }

    const missingInFile = Array.from(prodByProg.values())
      .filter((p) => !map.has(p.progressive_number))
      .map((p) => p.progressive_number)
      .sort((a, b) => a - b);

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode,
        totals: {
          rowsRead: rows.length,
          validUnique: unique.length,
          matched: matched.length,
          notFound: notFound.length,
          invalid: invalid.length,
          missingInFile: missingInFile.length,
        },
        sample: {
          matched: matched.slice(0, 20),
          notFound: notFound.slice(0, 20),
          invalid: invalid.slice(0, 20),
          missingInFile: missingInFile.slice(0, 50),
        },
      });
    }

    // apply: aggiorna products.peso_interno_kg (UPDATE, non UPSERT)
    // Facciamo update per riga con batch di concorrenza per restare veloci ma sicuri.
    let updatedCount = 0;

    const concurrency = 20;
    for (let i = 0; i < matched.length; i += concurrency) {
      const batch = matched.slice(i, i + concurrency);

      const results = await Promise.all(
        batch.map((m) =>
          supabase
            .from("products")
            .update({ peso_interno_kg: m.peso_interno_kg })
            .eq("id", m.productId)
        )
      );

      for (const r of results) {
        if (r.error) throw r.error;
        updatedCount += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      updatedCount,
      totals: {
        validUnique: unique.length,
        matched: matched.length,
        notFound: notFound.length,
        invalid: invalid.length,
        missingInFile: missingInFile.length,
      },
      sample: {
        notFound: notFound.slice(0, 50),
        invalid: invalid.slice(0, 50),
        missingInFile: missingInFile.slice(0, 200),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
