import crypto from "crypto";

export function normalizePhone(input: string) {
  let x = (input || "").trim();
  if (!x) return "";

  x = x.replace(/^whatsapp:/, "");
  x = x.replace(/\s+/g, "");
  x = x.replace(/^00/, "+"); // 0039... -> +39...

  // Se già internazionale con +
  if (x.startsWith("+")) {
    x = "+" + x.slice(1).replace(/[^\d]/g, "");
    return x;
  }

  // Tieni solo cifre
  x = x.replace(/[^\d]/g, "");

  // Italia default: 10 cifre e inizia con 3 (cellulari)
  if (x.length === 10 && x.startsWith("3")) return "+39" + x;

  // Se ha scritto 39 senza +
  if (x.startsWith("39") && x.length >= 11) return "+" + x;

  // Fallback
  return "+" + x;
}

export function signAccess(params: { phone: string; exp: string; action: "approve" | "revoke" }) {
  const secret = process.env.ACCESS_APPROVE_SECRET || "";
  if (!secret) throw new Error("ACCESS_APPROVE_SECRET mancante in .env.local");

  const base = `${params.action}|${params.phone}|${params.exp}`;
  const sig = crypto.createHmac("sha256", secret).update(base).digest("hex");
  return sig;
}

export function verifyAccess(params: { phone: string; exp: string; action: "approve" | "revoke"; sig: string }) {
  const expected = signAccess({ phone: params.phone, exp: params.exp, action: params.action });
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(params.sig, "hex"));
}
