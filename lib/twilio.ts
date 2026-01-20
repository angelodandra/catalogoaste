import Twilio from "twilio";

type SendOpts = {
  toPhones: string[];
  body: string;
  mediaUrl?: string | null;
};

function toWhatsApp(n: string) {
  if (!n) return "";
  if (n.startsWith("whatsapp:")) return n;
  if (n.startsWith("+")) return `whatsapp:${n}`;
  return `whatsapp:+${n}`;
}

export async function sendWhatsAppOrder(opts: SendOpts) {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  const from = process.env.TWILIO_WHATSAPP_FROM || "";

  if (!sid || !token || !from) {
    throw new Error("Twilio non configurato correttamente");
  }

  const client = Twilio(sid, token);

  const results = await Promise.allSettled(
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

  const successes = results
    .filter((r) => r.status === "fulfilled")
    .map((r: any) => ({ sid: r.value.sid, to: r.value.to }));

  const failures = results
    .filter((r) => r.status === "rejected")
    .map((r: any) => String(r.reason?.message || r.reason));

  return {
    ok: successes.length,
    failed: failures.length,
    successes,
    failures,
  };
}
