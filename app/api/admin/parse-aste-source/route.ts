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
  // Campi costo (opzionali — disponibili dal PDF e dall'XLSX se contiene le colonne)
  prezzo_eur_kg: number | null;
  totale_eur: number | null;
  casse: number | null;
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
  // Pass path via an `any` variable so TypeScript skips static module resolution,
  // and webpackIgnore so Turbopack/webpack also skips bundling it.
  // pdfjs-dist v5 has an empty exports map; the file is resolved at Node.js runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _pdfPath: any = "pdfjs-dist/legacy/build/pdf.mjs";
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const pdfjsLib: any = await import(/* webpackIgnore: true */ _pdfPath);
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
    const prezzo = parseItalianNum(m[4]);
    const totale = parseItalianNum(m[5]);
    const casse = parseInt(m[6], 10);

    if (!Number.isFinite(peso) || peso <= 0) continue;

    rowIndex++;
    lots.push({
      numero_interno_cassa: coopNum,
      specie,
      peso_interno_kg: Math.round(peso * 100) / 100,
      prezzo_eur_kg: Number.isFinite(prezzo) && prezzo > 0 ? Math.round(prezzo * 10000) / 10000 : null,
      totale_eur: Number.isFinite(totale) && totale > 0 ? Math.round(totale * 100) / 100 : null,
      casse: Number.isFinite(casse) && casse > 0 ? casse : null,
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
// Per i campi costo (prezzo €/kg, totale €, casse) tentiamo header detection
// poiché la posizione varia tra esportazioni.
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
    // ── Header detection per i campi costo ────────────────────────
    // Ricerco la riga 0 (header) per individuare le colonne di prezzo/totale/casse
    const header = (rows[0] as any[]) || [];
    const headerLow = header.map((h) => String(h ?? "").toLowerCase().trim());

    const findCol = (...needles: string[]) => {
      for (let i = 0; i < headerLow.length; i++) {
        const h = headerLow[i];
        for (const n of needles) {
          if (h.includes(n)) return i;
        }
      }
      return -1;
    };

    // Colonne note/probabili
    const idxPrezzo = findCol("prezzo", "€/kg", "eur/kg", "prz");
    const idxTotale = findCol("totale", "importo", "valore");
    const idxCasse = findCol("casse", "n.casse", "n. casse", "n_casse", "casse n");

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

      // Campi costo (opzionali)
      const prezzoRaw = idxPrezzo >= 0 ? r[idxPrezzo] : null;
      const totaleRaw = idxTotale >= 0 ? r[idxTotale] : null;
      const casseRaw = idxCasse >= 0 ? r[idxCasse] : null;

      const prezzo = prezzoRaw != null && prezzoRaw !== "" ? Number(prezzoRaw) : NaN;
      const totale = totaleRaw != null && totaleRaw !== "" ? Number(totaleRaw) : NaN;
      const casse = casseRaw != null && casseRaw !== "" ? Number(casseRaw) : NaN;

      lots.push({
        numero_interno_cassa: coopNum,
        specie,
        peso_interno_kg: Math.round(peso * 100) / 100,
        prezzo_eur_kg: Number.isFinite(prezzo) && prezzo > 0 ? Math.round(prezzo * 10000) / 10000 : null,
        totale_eur: Number.isFinite(totale) && totale > 0 ? Math.round(totale * 100) / 100 : null,
        casse: Number.isFinite(casse) && casse > 0 ? Math.round(casse) : null,
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

        // Pivot format: col 1 = prezzo/kg (se presente), col 2 = "1" (1 cassa)
        const prezzoRaw = r[1];
        const prezzo = prezzoRaw != null ? Number(prezzoRaw) : NaN;
        const totale = Number.isFinite(prezzo) && prezzo > 0 ? Math.round(peso * prezzo * 100) / 100 : null;

        rowIndex++;
        lots.push({
          numero_interno_cassa: null, // pivot format has no coop number
          specie: currentSpecie,
          peso_interno_kg: Math.round(peso * 100) / 100,
          prezzo_eur_kg: Number.isFinite(prezzo) && prezzo > 0 ? Math.round(prezzo * 10000) / 10000 : null,
          totale_eur: totale,
          casse: 1, // pivot format = 1 cassa per riga
          rowIndex,
        });
      }
    }
  }

  return lots;
}

// ────────────────────────────────────────────────
// Cost calculation (per asta type)
// ────────────────────────────────────────────────

type AstaType = "civitavecchia" | "none";

type CivitavecchiaParams = {
  boxCost: number;          // €/cassa
  transportBoxCost: number; // €/cassa trasporto
  commissionRate: number;   // % su imponibile
};

type AstaParams = CivitavecchiaParams | Record<string, never>;

/**
 * Calcola il costo reale del lotto secondo la formula dell'asta scelta.
 * Civitavecchia: costo = totale + (casse × boxCost) + (casse × transportBoxCost) + (totale × commissionRate%)
 * none: costo = totale (grezzo)
 * Restituisce null se i dati minimi non sono disponibili.
 */
function computeCost(
  lot: ParsedLot,
  astaType: AstaType,
  params: AstaParams
): number | null {
  if (lot.totale_eur == null || lot.totale_eur <= 0) return null;

  if (astaType === "civitavecchia") {
    const p = params as CivitavecchiaParams;
    const casse = lot.casse ?? 1;
    const totale = lot.totale_eur;
    const boxCost = Number(p.boxCost) || 0;
    const transportBoxCost = Number(p.transportBoxCost) || 0;
    const commissionRate = (Number(p.commissionRate) || 0) / 100;

    const extra =
      casse * boxCost + casse * transportBoxCost + totale * commissionRate;
    return Math.round((totale + extra) * 100) / 100;
  }

  // Default: no extras
  return Math.round(lot.totale_eur * 100) / 100;
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

    // Parametri asta (opzionali — se assenti il costo viene salvato senza maggiorazioni)
    const astaTypeRaw = (form.get("astaType") as string | null)?.trim().toLowerCase() || "";
    const astaType: AstaType = astaTypeRaw === "civitavecchia" ? "civitavecchia" : "none";

    const astaParams: AstaParams =
      astaType === "civitavecchia"
        ? {
            boxCost: parseFloat((form.get("boxCost") as string | null) || "1") || 0,
            transportBoxCost:
              parseFloat((form.get("transportBoxCost") as string | null) || "2") || 0,
            commissionRate:
              parseFloat((form.get("commissionRate") as string | null) || "2") || 0,
          }
        : {};

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
      prezzo_eur_kg: number | null;
      totale_eur: number | null;
      casse: number | null;
      cost_eur: number | null;
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
      const cost = computeCost(lots[i], astaType, astaParams);
      matched.push({
        lotRowIndex: lots[i].rowIndex,
        numero_interno_cassa: lots[i].numero_interno_cassa,
        specie: lots[i].specie,
        peso_interno_kg: lots[i].peso_interno_kg,
        prezzo_eur_kg: lots[i].prezzo_eur_kg,
        totale_eur: lots[i].totale_eur,
        casse: lots[i].casse,
        cost_eur: cost,
        progressive_number: prod.progressive_number,
        productId: prod.id,
      });
    }

    // Statistiche costi (utili per la preview)
    const matchedWithCost = matched.filter((m) => m.cost_eur != null);
    const totalCost = matchedWithCost.reduce((s, m) => s + (m.cost_eur || 0), 0);

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        mode,
        fileType,
        astaType,
        astaParams,
        totals: {
          lotsFound: lots.length,
          matched: matched.length,
          unmatched: unmatched.length,
          catalogProducts: allProds.length,
          startAtProgressive: allProds[startIdx]?.progressive_number ?? null,
          withCost: matchedWithCost.length,
          totalCost: Math.round(totalCost * 100) / 100,
        },
        sample: {
          matched: matched.slice(0, 30),
          unmatched: unmatched.slice(0, 20),
        },
      });
    }

    // Apply: persist asta_type/params on catalog (best effort) + update products in batches
    if (astaType !== "none") {
      const { error: cErr } = await supabase
        .from("catalogs")
        .update({ asta_type: astaType, asta_params: astaParams as any })
        .eq("id", catalogId);
      // Non blocchiamo se le colonne non esistono ancora (migrazione non ancora applicata)
      if (cErr) console.warn("[parse-aste-source] update catalog asta_type failed:", cErr.message);
    }

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
              // Campi costo (presenti solo se la migrazione è applicata)
              ...(m.cost_eur != null ? { cost_eur: m.cost_eur } : {}),
              ...(m.totale_eur != null ? { auction_total_eur: m.totale_eur } : {}),
              ...(m.prezzo_eur_kg != null ? { auction_price_per_kg: m.prezzo_eur_kg } : {}),
              ...(m.casse != null ? { auction_boxes_count: m.casse } : {}),
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
      astaType,
      astaParams,
      updatedCount,
      totals: {
        lotsFound: lots.length,
        matched: matched.length,
        unmatched: unmatched.length,
        withCost: matchedWithCost.length,
        totalCost: Math.round(totalCost * 100) / 100,
      },
      sample: {
        unmatched: unmatched.slice(0, 20),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Errore server" }, { status: 500 });
  }
}
