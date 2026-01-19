import Twilio from "twilio";

function toWhatsApp(addr: string) {
  const v = addr.trim();
  if (v.startsWith("whatsapp:")) return v;
  const cleaned = v.replace(/\s+/g, "");
  const e164 = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return `whatsapp:${e164}`;
}

function errToString(e: any) {
  // Twilio errors often have these fields
  const code = e?.code ? `code=${e.code}` : "";
  const status = e?.status ? `status=${e.status}` : "";
  const msg = e?.message ? `${e.message}` : String(e);
  const more = e?.moreInfo ? `moreInfo=${e.moreInfo}` : "";
  const parts = [code, status, more].filter(Boolean).join(" ");
  return parts ? `${msg} (${parts})` : msg;
}

export async function sendWhatsAppOrder(opts: {
  toPhones: string[];
  body: string;
  mediaUrl?: string | null;
}) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from) {
    throw new Error(
      "Twilio non configurato: manca TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM"
    );
  }

  const client = Twilio(sid, token);

  const settled = await Promise.allSettled(
    opts.toPhones
      .filter(Boolean)
      .map((p) =>
        client.messages.create({
          from,
          to: toWhatsApp(p),
          body: opts.body,
          ...(opts.mediaUrl ? { mediaUrl: [opts.mediaUrl] } : {}),
        })
      )
  );

  const successes = settled
    .filter((r) => r.status === "fulfilled")
    .map((r: any) => ({ sid: r.value.sid, to: r.value.to }));

  const failures = settled
    .filter((r) => r.status === "rejected")
    .map((r: any) => errToString(r.reason));

  return {
    ok: successes.length,
    failed: failures.length,
    successes,
    failures,
  };
}
