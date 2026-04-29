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
  fao: string | null; // codice FAO specie (es. "OCC", "MUR") — disponibile per XLSX esteri
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
      fao: null, // PDF Civitavecchia non ha colonna FAO esplicita
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
    // Note: per "casse" cerchiamo "casse" e "scatol" — il file Agde ha
    // colonna "Scatole" (numero scatole = numero casse).
    const idxPrezzo = findCol("prezzo", "€/kg", "eur/kg", "prz");
    const idxTotale = findCol("totale", "importo", "valore");
    const idxCasse = findCol("casse", "scatol", "n.casse", "n. casse", "n_casse", "casse n");
    // FAO specie: cerca header "fao specie" (o "fao") — nei file Agde è col 5
    // (header esatto "FAO specie").
    const idxFao = findCol("fao specie", "cod fao", "codice fao");

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

      // FAO specie (per detection cefalopodi a Agde)
      const faoRaw = idxFao >= 0 ? r[idxFao] : r[5];
      const fao =
        faoRaw != null && String(faoRaw).trim() !== ""
          ? String(faoRaw).trim().toUpperCase()
          : null;

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
        fao,
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
          fao: null,
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

type AstaType =
  | "civitavecchia"
  | "agde"
  | "sete"
  | "tarragona"
  | "roses"
  | "none";

const FR_AUCTIONS: AstaType[] = ["agde", "sete"];
const BCN_AUCTIONS: AstaType[] = ["tarragona", "roses"];
const FOREIGN_AUCTIONS: AstaType[] = [...FR_AUCTIONS, ...BCN_AUCTIONS];

// Codici FAO cefalopodi (no ghiacciatura ad Agde)
// Replica esatta del set in ANALISI VENDITA/public/aste.html
const CEPHALO_FAO = new Set([
  "OCC", "OCP", "OCT", "OCI", "OCM",
  "CTL", "CTC", "SQC", "SQZ", "SQA",
  "ILL", "PROC", "SEIC", "ENCO", "PISS",
]);

type CivitavecchiaParams = {
  boxCost: number;          // €/cassa
  transportBoxCost: number; // €/cassa trasporto
  commissionRate: number;   // % su imponibile
};

type AgdeParams = {
  cassa: number;     // €/cassa
  cop: number;       // €/coperchio (6 per pallet)
  pal: number;       // €/pallet (1 ogni 40 casse)
  rev: number;       // % redevance équipement
  tc: number;        // % taxe de criée
  td: number;        // % taxe vente à distance
  mul: number;       // €/kg muletto
  ghi: number;       // €/kg ghiacciatura (no cefalopodi)
  car: number;       // €/cassa carta bac
  amm: number;       // €/spedizione spese amministrative
  surcarb: number;   // % surcharge OLANO
};

type SeteParams = {
  rec: number;       // €/bac reconditionnement
  pal: number;       // €/pallet
  gest: number;      // % gestion
  td: number;        // % taxe acheteur distance
  rev: number;       // % redev. équipement
  frais: number;     // €/giorno frais divers
  surcarb: number;   // % surcharge OLANO
};

type TarrParams = {
  cgr: number;       // €/cassa grande
  cpe: number;       // €/cassa piccola
  man: number;       // €/cassa manipolació porex
  pal: number;       // €/pallet
  etq: number;       // €/lotto etiquetes
  rec: number;       // €/cassa recollida
  ret: number;       // % retencio confraria
  surcarb: number;   // % surcharge OLANO
};

type RoseParams = {
  imp: number;       // % impost ports
  car: number;       // % càrrec confraria
  cai: number;       // €/cassa caixes noves (1/lotto)
  surcarb: number;   // % surcharge OLANO
};

type AstaParams =
  | CivitavecchiaParams
  | AgdeParams
  | SeteParams
  | TarrParams
  | RoseParams
  | Record<string, never>;

// ── OLANO transport (replica di olanoTariff in aste.html) ──
function olanoTransport(kg: number, surcarb: number, zone: "FR" | "BCN") {
  const s = (Number(surcarb) || 0) / 100;
  const amm = 4.5;
  let base = 0;
  if (zone === "FR") {
    if (kg <= 100) base = 90.56; // forfait fisso
    else if (kg <= 500) base = (905.65 * kg) / 1000;
    else if (kg <= 1000) base = (717.64 * kg) / 1000;
    else if (kg <= 3000) base = (611.03 * kg) / 1000;
    else base = (550.27 * kg) / 1000;
  } else {
    if (kg <= 100) base = 65.0;
    else base = (654 * kg) / 1000;
  }
  const sur = base * s;
  return base + sur + amm;
}

// ── Calcolo aggregato criée per i mercati esteri ──
// Replica delle formule in aste.html → calcCriee per ogni mercato.
function calcCrieeAggregate(
  astaType: AstaType,
  params: AstaParams,
  totals: { vb: number; kg: number; nCasse: number; nLotti: number; cephaloKg: number }
): number {
  const { vb, kg, nCasse, nLotti, cephaloKg } = totals;
  const pesiNonCephalo = Math.max(0, kg - cephaloKg);

  switch (astaType) {
    case "agde": {
      const p = params as AgdeParams;
      const nPal = Math.max(1, Math.ceil(nCasse / 40));
      const nCop = nPal * 6;
      return (
        nCasse * p.cassa +
        nCop * p.cop +
        nPal * p.pal +
        (vb * p.rev) / 100 +
        (vb * p.tc) / 100 +
        (vb * p.td) / 100 +
        kg * p.mul +
        pesiNonCephalo * p.ghi +
        nCasse * p.car +
        p.amm
      );
    }
    case "sete": {
      const p = params as SeteParams;
      return (
        nCasse * p.rec +
        p.pal +
        (vb * p.gest) / 100 +
        (vb * p.td) / 100 +
        (vb * p.rev) / 100 +
        p.frais
      );
    }
    case "tarragona": {
      const p = params as TarrParams;
      const nGr = Math.round(nCasse * 0.8);
      const nPe = nCasse - nGr;
      return (
        nGr * p.cgr +
        nPe * p.cpe +
        nCasse * p.man +
        p.pal +
        nLotti * p.etq +
        nCasse * p.rec +
        (vb * p.ret) / 100
      );
    }
    case "roses": {
      const p = params as RoseParams;
      const nCaiNoves = nLotti; // stima 1/lotto
      return (
        (vb * p.imp) / 100 +
        (vb * p.car) / 100 +
        nCaiNoves * p.cai
      );
    }
    default:
      return 0;
  }
}

/**
 * Calcola il costo reale per ogni lotto.
 * - Civitavecchia: per-lotto (totale + casse×€ + casse×trasp + totale×comm%)
 * - Estere (Agde/Sète/Tarragona/Roses): aggregato → criée e OLANO calcolati
 *   sui totali del file, poi ripartiti sui lotti in proporzione al peso.
 * Restituisce array allineato a lots: cost_eur[i] = costo del lotto i (o null).
 */
function computeCosts(
  lots: ParsedLot[],
  astaType: AstaType,
  params: AstaParams
): (number | null)[] {
  const out: (number | null)[] = new Array(lots.length).fill(null);

  if (astaType === "civitavecchia") {
    const p = params as CivitavecchiaParams;
    const boxCost = Number(p.boxCost) || 0;
    const transportBoxCost = Number(p.transportBoxCost) || 0;
    const commissionRate = (Number(p.commissionRate) || 0) / 100;

    for (let i = 0; i < lots.length; i++) {
      const l = lots[i];
      if (l.totale_eur == null || l.totale_eur <= 0) continue;
      const casse = l.casse ?? 1;
      const totale = l.totale_eur;
      const extra =
        casse * boxCost + casse * transportBoxCost + totale * commissionRate;
      out[i] = Math.round((totale + extra) * 100) / 100;
    }
    return out;
  }

  if (astaType === "none") {
    for (let i = 0; i < lots.length; i++) {
      const l = lots[i];
      if (l.totale_eur != null && l.totale_eur > 0) {
        out[i] = Math.round(l.totale_eur * 100) / 100;
      }
    }
    return out;
  }

  if (FOREIGN_AUCTIONS.includes(astaType)) {
    // ── Aggregato del file ──
    let vb = 0; // valore battuto totale (sum totale_eur)
    let kg = 0;
    let nCasse = 0;
    let nLotti = 0;
    let cephaloKg = 0;

    for (const l of lots) {
      if (l.totale_eur == null || l.totale_eur <= 0) continue;
      vb += l.totale_eur;
      kg += l.peso_interno_kg;
      nCasse += l.casse ?? 1;
      nLotti += 1;
      // Cefalopodi: identificati dal codice FAO (es. OCC, OCT, CTL, SQC...)
      // Fallback su nome italiano se FAO mancante (PDF Civitavecchia).
      const fao = (l.fao || "").toUpperCase().trim();
      if (fao && CEPHALO_FAO.has(fao)) {
        cephaloKg += l.peso_interno_kg;
        continue;
      }
      const sp = (l.specie || "").toLowerCase().trim();
      if (
        sp.includes("polpo") ||
        sp.includes("seppia") ||
        sp.includes("calamar") ||
        sp.includes("totano") ||
        sp.includes("moscardin")
      ) {
        cephaloKg += l.peso_interno_kg;
      }
    }

    if (nLotti === 0 || kg === 0) return out;

    const crieeTot = calcCrieeAggregate(astaType, params, {
      vb, kg, nCasse, nLotti, cephaloKg,
    });

    const zone = FR_AUCTIONS.includes(astaType) ? "FR" : "BCN";
    const surcarb = (params as any).surcarb ?? 31;
    const olanoTot = olanoTransport(kg, surcarb, zone);

    // ── Ripartizione per peso sui singoli lotti ──
    for (let i = 0; i < lots.length; i++) {
      const l = lots[i];
      if (l.totale_eur == null || l.totale_eur <= 0) continue;
      const share = l.peso_interno_kg / kg;
      const costo = l.totale_eur + share * crieeTot + share * olanoTot;
      out[i] = Math.round(costo * 100) / 100;
    }
    return out;
  }

  return out;
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
    const validAstaTypes: AstaType[] = [
      "civitavecchia", "agde", "sete", "tarragona", "roses", "none",
    ];
    const astaType: AstaType = (validAstaTypes as string[]).includes(astaTypeRaw)
      ? (astaTypeRaw as AstaType)
      : "none";

    // Helper: legge un parametro numerico dal form con default
    const np = (key: string, def: number): number => {
      const v = parseFloat((form.get(key) as string | null) || String(def));
      return Number.isFinite(v) ? v : def;
    };

    let astaParams: AstaParams = {};
    if (astaType === "civitavecchia") {
      astaParams = {
        boxCost: np("boxCost", 1),
        transportBoxCost: np("transportBoxCost", 2),
        commissionRate: np("commissionRate", 2),
      } as CivitavecchiaParams;
    } else if (astaType === "agde") {
      astaParams = {
        cassa: np("ag-cassa", 1.0),
        cop: np("ag-cop", 0.7),
        pal: np("ag-pal", 5.0),
        rev: np("ag-rev", 2.0),
        tc: np("ag-tc", 2.0),
        td: np("ag-td", 2.5),
        mul: np("ag-mul", 0.0141),
        ghi: np("ag-ghi", 0.1),
        car: np("ag-car", 0.0714),
        amm: np("ag-amm", 4.5),
        surcarb: np("surcarb", 31),
      } as AgdeParams;
    } else if (astaType === "sete") {
      astaParams = {
        rec: np("se-rec", 1.54),
        pal: np("se-pal", 3.6),
        gest: np("se-gest", 1.5),
        td: np("se-td", 2.0),
        rev: np("se-rev", 2.0),
        frais: np("se-frais", 1.81),
        surcarb: np("surcarb", 31),
      } as SeteParams;
    } else if (astaType === "tarragona") {
      astaParams = {
        cgr: np("ta-cgr", 0.5),
        cpe: np("ta-cpe", 0.5),
        man: np("ta-man", 1.9),
        pal: np("ta-pal", 6.0),
        etq: np("ta-etq", 0.015),
        rec: np("ta-rec", 0.16),
        ret: np("ta-ret", 4.0),
        surcarb: np("surcarb", 31),
      } as TarrParams;
    } else if (astaType === "roses") {
      astaParams = {
        imp: np("ro-imp", 2.0),
        car: np("ro-car", 2.1),
        cai: np("ro-cai", 6.5),
        surcarb: np("surcarb", 31),
      } as RoseParams;
    }

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

    // Costi calcolati su tutto il file (per le estere è un calcolo aggregato + ripartizione)
    const costs = computeCosts(lots, astaType, astaParams);

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
        prezzo_eur_kg: lots[i].prezzo_eur_kg,
        totale_eur: lots[i].totale_eur,
        casse: lots[i].casse,
        cost_eur: costs[i] ?? null,
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
