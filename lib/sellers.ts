import fs from "fs";
import path from "path";

export type SellerRow = {
  name: string;
  phone: string;
  active: boolean;
};

const FILE_PATH = path.join(process.cwd(), "data", "sellers.json");

function normalizePhone(input: string) {
  let x = (input || "").trim();
  if (!x) return "";
  x = x.replace(/^whatsapp:/, "");
  x = x.replace(/\s+/g, "");
  x = x.replace(/^00/, "+");
  if (x.startsWith("+")) {
    return "+" + x.slice(1).replace(/[^\d]/g, "");
  }
  x = x.replace(/[^\d]/g, "");
  if (x.length === 10 && x.startsWith("3")) return "+39" + x;
  if (x.startsWith("39") && x.length >= 11) return "+" + x;
  return "+" + x;
}

function safeArray(v: any): SellerRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({
      name: String(x?.name || "").trim(),
      phone: normalizePhone(String(x?.phone || "")),
      active: Boolean(x?.active),
    }))
    .filter((x) => x.name && x.phone);
}

export function readSellers(): SellerRow[] {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return safeArray(parsed);
  } catch {
    return [];
  }
}

export function writeSellers(rows: SellerRow[]) {
  const clean = safeArray(rows).sort((a, b) => a.name.localeCompare(b.name));
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(clean, null, 2) + "\n", "utf8");
}

export function getActiveSellerPhones(): string[] {
  return readSellers()
    .filter((x) => x.active)
    .map((x) => x.phone);
}

export function getSellerByPhone(phone: string) {
  const p = normalizePhone(phone || "");
  return readSellers().find((x) => x.phone === p) || null;
}
