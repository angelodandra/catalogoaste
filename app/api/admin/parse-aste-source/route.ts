import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

type ParsedLot = {
  numero_interno_cassa: string | null; // cooperative lot number (may be null for XLSX without it)
  specie: string | null;
  peso_interno_kg: number;
  rowIndex: number; // 1-based position in source file
};

// ────────────────────────────────────────────────
// PDF parser — "Dettaglio lotti (F8)" format
// Columns: Prg. | Specie | Peso (Kg) | Prezzo (€) | Totale (€) | Casse
// ────────────────────────────────────────────────

// Regex: line starting with integer (Prg.), then species (non-greedy text), then 3 Italian decimals, then casse integer
// Italian decimals use comma: "1,45" → 1.45
const PDF_ROW_RE = /^(\d+)\s+(.+?)\s+(\d+[,.]?\d*)\s+(\d+[,.]?\d*)\s+(\d+[,.]?\d*)\s+(\d+)$/;

function parseItalianNum(s: string): number {
  return parseFloat(s.replace(",", "."));
}

/** Stub DOM types that pdf.js evaluates at module load time in Node.js */
function stubMissingDomApis() {
  const g = globalThis as Record<string, unknown>;
  if (!g["DOMMatrix"]) {
    // Minimal DOMMatrix stub — only needs to exist; actual maths not called for text extraction
    function FakeDOMMatrix(this: any) {
      this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;
      this.m11=1;this.m12=0;this.m13=0;this.m14=0;
      this.m21=0;this.m22=1;this.m23=0;this.m24=0;
      this.m31=0;this.m32=0;this.m33=1;this.m34=0;
      this.m41=0;this.m42=0;this.m43=0;this.m44=1;
      this.is2D=true;this.isIdentity=true;
    }
    FakeDOMMatrix.prototype.scale = function() { return new (FakeDOMMatrix as any)(); };
    FakeDOMMatrix.prototype.translate = function() { return new (FakeDOMMatrix as any)(); };
    FakeDOMMatrix.prototype.multiply = function() { return new (FakeDOMMatrix as any)(); };
    FakeDOMMatrix.prototype.inverse = function() { return new (FakeDOMMatrix as any)(); };
    g["DOMMatrix"] = FakeDOMMatrix;
  }
  if (!g["ImageData"]) {
    g["ImageData"] = class { constructor(public data: any, public width: number, public height: number = 0) {} };
  }
  if (!g["Path2D"]) {
    g["Path2D"] = class { moveTo(){}; lineTo(){}; closePath(){}; addPath(){} };
  }
}

async function parsePdf(buf: Buffer): Promise<ParsedLot[]> {
  // pdfjs-dist v5 legacy build — designed for Node.js environments.
  // Build a proper file:// URL using pathToFileURL (handles all platforms correctly).
  const nodePath = await import("path");
  const nodeUrl  = await import("url");
  const workerAbs = nodePath.default.join(
    process.cwd(),
    "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"
  );
  // webpackIgnore: tell Turbopack/webpack not to statically resolve this path
  // (pdfjs-dist has an empty exports map; the file is resolved at runtime by Node.js)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const pdfjsLib = await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = nodeUrl.pathToFileURL(workerAbs).href;

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
  });

  const pdf = await loadingTask.promise;
  let rawText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;

    // Reconstruct lines by grouping items with the same Y coordinate.
    // Items on the same line are separated by a space; Y changes → newline.
    let prevY: number | null = null;
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (prevY !== null) {
        if (Math.abs(y - prevY) > 2) {
          rawText += "\n"; // different row
        } else if (!rawText.endsWith(" ")) {
          rawText += " "; // same row — space between items
        }
      }
      rawText += item.str;
      prevY = y;
    }
    rawText += "\n";
  }

  const lines = rawText.split("\n");

  const lots: ParsedLot[] = [];
  let rowIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(PDF_ROW_RE);
    if (!m) continue;

    const coopNum = m[1]; // Prg. column = cooperative cassa number
    const specie = m[2].trim() || null;
    const peso = parseItalianNum(m[3]);

    if (!Number.isFinite(peso) || peso <= 0) continue;

    rowIndex++;
    lots.push({
      numero_interno_cassa: coopNum,
      specie,
      peso_interno_kg: Math.round(peso * 100) / 100,
      rowIndex,
    });
  }

  return lots;
}

// ────────────────────────────────────────────────
// XLSX parser — "Acquisti Mercati" format
// Sheet "ACQUISTI": row 0 = header, then one row per box
//   col 2 = N. della vendita (lot number = coop box number)
//   col 8 = Specie, nome in un'altra lingua (Italian name)
//   col 15 = Peso netto (kg)
// ────────────────────────────────────────────────

function parseXlsxAcquisti(buf: Buffer): ParsedLot[] {
  const wb = XLSX.read(buf, { type: "buffer" });

  // Prefer "ACQUISTI" sheet; fallback to first sheet
  let sheetName = wb.SheetNames.find((n) => n.toUpperCase() === "ACQUISTI");
  let isAcquistiFormat = !!sheetName;
  if (!sheetName) sheetName = wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });

  const lots: ParsedLot[] = [];

  if (isAcquistiFormat) {
    // Skip header row (row 0)
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as any[];
      if (!r || r.length < 16) continue;

      const coopNum = r[2] != null && String(r[2]).trim() !== "" ? String(r[2]).trim() : null;
      // col 8 = Italian name; col 6 = FAO abbreviation (fallback)
      const specieRaw = r[8] ?? r[6] ?? null;
      const specie = specieRaw != null && String(specieRaw).trim() !== "" ? String(specieRaw).trim() : null;
      const pesoRaw = r[15];
      const peso = pesoRaw != null ? Number(pesoRaw) : NaN;

      if (!Number.isFinite(peso) || peso <= 0) continue;

      lots.push({
        numero_interno_cassa: coopNum,
        specie,
        peso_interno_kg: Math.round(peso * 100) / 100,
        rowIndex: i, // 1-based position (header = 0)
      });
    }
  } else {
    // Generic pivot format: Foglio1 with species headers + weight rows
    // Row format:
    //   string row  → species header (col 0 = species name, col 2 = count)
    //   numeric row → individual box (col 0 = weight, col 1 = price/kg, col 2 = 1)
    // Skip first row if it is the header ["Etichette di riga",...]
    let currentSpecie: string | null = null;
    let rowIndex = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as any[];
      if (!r || r.length === 0) continue;

      const col0 = r[0];
      if (typeof col0 === "string" && col0.trim() !== "") {
        // Could be header or species row
        const t = col0.trim().toLowerCase();
        if (t === "etichette di riga" || t === "totale complessivo") continue;
        // Species header row
        currentSpecie = col0.trim();
        continue;
      }

      if (typeof col0 === "number" && currentSpecie !== null) {
        const peso = Number(col0);
        if (!Number.isFinite(peso) || peso <= 0) continue;

        rowIndex++;
        lots.push({
          numero_interno_cassa: null, // pivot format has no coop number
          specie: currentSpecie,
          peso_interno_kg: Math.round(peso * 100) / 100,
          rowIndex,
        });
      }
    }
  }

  return lots;
}

// ────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const form = await req.formData();
    const catalogId = (form.get("catalogId") as string | null)?.trim() || "";
    const mode = ((form.get("mode") as string | null)?.trim() || "preview") as "preview" | "apply";
    const file = form.get("file") as File | null;
    const progressiveStartRaw = form.get("progressiveStart");
    const progressiveStart = progressiveStartRaw != null ? parseInt(String(progressiveStartRaw), 10) : null;

    if (!catalogId) return NextResponse.json({ error: "catalogId mancante" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "file mancante" }, { status: 400 });
    if (mode !== "preview" && mode !== "apply")
      return NextResponse.json({ error: "mode non valido" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();

    // Parse source file
    let lots: ParsedLot[];
    let fileType: "pdf" | "xlsx";

    if (fileName.endsWith(".pdf")) {
      fileType = "pdf";
      lots = await parsePdf(buf);
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      fileType = "xlsx";
      lots = parseXlsxAcquisti(buf);
    } else {
      return NextResponse.json({ error: "Formato file non supportato. Usa PDF o XLSX." }, { status: 400 });
    }

    if (lots.length === 0) {
      return NextResponse.json({ error: "Nessun lotto trovato nel file.", fileType }, { status: 400 });
    }

    const supabase = supabaseServer();

    // Load catalog products ordered by progressive_number
    const { data: prods, error: pErr } = await supabase
      .from("products")
      .select("id, progressive_number, peso_interno_kg, specie")
      .eq("catalog_id", catalogId)
      .order("progressive_number", { ascending: true });

    if (pErr) throw pErr;

    const allProds = (prods || []) as {
      id: string;
      progressive_number: number;
      peso_interno_kg: number | null;
      specie: string | null;
    }[];

    if (allProds.length === 0) {
      return NextResponse.json({ error: "Nessun prodotto trovato nel catalogo." }, { status: 400 });
    }

    // Determine starting offset:
    // - If progressiveStart provided → find the product with that progressive_number (or nearest >= )
    // - Otherwise → use the first product without peso_interno_kg, or first product
    let startIdx = 0;
    if (progressiveStart != null && Number.isFinite(progressiveStart)) {
      const idx = allProds.findIndex((p) => p.progressive_number >= progressiveStart);
      startIdx = idx >= 0 ? idx : allProds.length;
    } else {
      const idx = allProds.findIndex((p) => p.peso_interno_kg == null);
      startIdx = idx >= 0 ? idx : 0;
    }

    // Match: lot[i] → product at (startIdx + i)
    type MatchedRow = {
      lotRowIndex: number;
      numero_interno_cassa: string | null;
      specie: string | null;
      peso_interno_kg: number;
      progressive_number: number;
      productId: string;
    };

    const matched: MatchedRow[] = [];
    const unmatched: { lotRowIndex: number; reason: string }[] = [];

    for (let i = 0; i < lots.length; i++) {
      const prodIdx = startIdx + i;
      if (prodIdx >= allProds.length) {
        unmatched.push({ lotRowIndex: lots[i].rowIndex, reason: "Nessun prodotto disponibile" });
        continue;
      }
      const prod = allProds[prodIdx];
      matched.push({
        lotRowIndex: lots[i].rowIndex,
        numero_interno_cassa: lots[i].numero_interno_cassa,
        specie: lots[i].specie,
        peso_interno_kg: lots[i].peso_interno_kg,
        progressive_number: prod.progressive_number,
        productId: prod.id,
      });
    }

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode,
        fileType,
        totals: {
          lotsFound: lots.length,
          matched: matched.length,
          unmatched: unmatched.length,
          catalogProducts: allProds.length,
          startAtProgressive: allProds[startIdx]?.progressive_number ?? null,
        },
        sample: {
          matched: matched.slice(0, 30),
          unmatched: unmatched.slice(0, 20),
        },
      });
    }

    // Apply: update products in batches
    const concurrency = 20;
    let updatedCount = 0;

    for (let i = 0; i < matched.length; i += concurrency) {
      const batch = matched.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((m) =>
          supabase
            .from("products")
            .update({
              peso_interno_kg: m.peso_interno_kg,
              weight_kg: Math.round((m.peso_interno_kg + 0.2) * 100) / 100,
              specie: m.specie,
              ...(m.numero_interno_cassa !== null ? { numero_interno_cassa: m.numero_interno_cassa } : {}),
            })
            .eq("id", m.productId)
        )
      );

      for (const r of results) {
        if (r.error) throw r.error;
        updatedCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      fileType,
      updatedCount,
      totals: {
        lotsFound: lots.length,
        matched: matched.length,
        unmatched: unmatched.length,
      },
      sample: {
        unmatched: unmatched.slice(0, 20),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
