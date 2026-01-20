"use client";

import { useEffect, useState } from "react";
import WelcomeGate from "@/components/WelcomeGate";

function normalizePhone(p: string) {
  let x = (p || "").trim();
  if (!x) return "";
  x = x.replace(/^whatsapp:/, "");
  x = x.replace(/\s+/g, "");
  if (x[0] !== "+") x = "+" + x;
  return x;
}

export default function AccessGate(props: {
  onAuthorizedChange: (authorized: boolean) => void;
}) {
  const [phone, setPhone] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function check(p: string) {
    const pp = normalizePhone(p);
    if (!pp) {
      setAuthorized(false);
      props.onAuthorizedChange(false);
      return;
    }

    setLoading(true);
    setInfo(null);
    try {
      const res = await fetch("/api/access/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: pp }),
      });

      const text = await res.text();
      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { ok: false, authorized: false, error: text }; }

      const ok = !!json.authorized;
      setAuthorized(ok);
      props.onAuthorizedChange(ok);

      if (!ok) setInfo("Non autorizzato. Completa la registrazione per accedere.");
    } catch (e: any) {
      setAuthorized(false);
      props.onAuthorizedChange(false);
      setInfo(e?.message ?? "Errore rete");
    } finally {
      setLoading(false);
    }
  }

  async function register(name: string, company: string, p: string) {
    const pp = normalizePhone(p);
    if (!name || !company || !pp) return;

    setLoading(true);
    setInfo(null);
    try {
      // salva localmente
      try {
        window.localStorage.setItem("catalog_name", name);
        window.localStorage.setItem("catalog_company", company);
        window.localStorage.setItem("catalog_phone", pp);
      } catch {}

      const res = await fetch("/api/access/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, phone: pp }),
      });

      const text = await res.text();
      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { ok: false, error: text }; }

      if (!res.ok) {
        setInfo(json.error || "Errore registrazione");
        return;
      }

      setPhone(pp);
      setInfo("✅ Registrazione inviata! In attesa di approvazione. Premi \"Verifica accesso\" tra poco.");
      await check(pp);
    } catch (e: any) {
      setInfo(e?.message ?? "Errore rete");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const savedPhone = window.localStorage.getItem("catalog_phone") || "";
      if (savedPhone) {
        setPhone(savedPhone);
        check(savedPhone);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // se non autorizzato: welcome
  if (!authorized) {
    return (
      <div>
        <WelcomeGate loading={loading} onSubmit={(n, c, p) => register(n, c, p)} />

        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-3">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2">
            <div className="text-xs text-gray-600">
              {phone ? (
                <>
                  Numero: <b>{phone}</b>
                </>
              ) : (
                "Inserisci i dati per registrarti"
              )}
            </div>

            <button
              className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={loading || !phone}
              onClick={() => check(phone)}
            >
              Verifica accesso
            </button>
          </div>

          {info && (
            <div className="mx-auto mt-2 max-w-md rounded-lg bg-gray-50 p-2 text-xs text-gray-800">
              {info}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
