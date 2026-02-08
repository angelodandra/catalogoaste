"use client";

import { useEffect, useMemo, useState } from "react";

export default function InstallPage() {
  const [canPrompt, setCanPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // intercetta prompt install (Chrome/Android)
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const isIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua);
  }, []);

  const isAndroid = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /Android/i.test(ua);
  }, []);

  async function installNow() {
    try {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setCanPrompt(false);
    } catch {}
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <div className="mb-6 flex justify-center">
        <img src="/logo.jpg" alt="Logo azienda" className="h-20 w-auto" />
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Installa l’app</h1>
        <p className="mt-2 text-sm text-gray-700">
          Questa è l’app “Ordini” (PWA). Una volta installata, la trovi come una normale app sul telefono.
        </p>

        <div className="mt-4 rounded-xl border bg-gray-50 p-4">
          <div className="text-sm font-semibold">Link rapido</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="truncate rounded-lg border bg-white px-3 py-2 font-mono text-xs">
              {typeof window !== "undefined" ? `${window.location.origin}/?pwa=1` : "/?pwa=1"}
            </div>
            <button
              className="rounded-lg border bg-white px-4 py-2 font-semibold"
              onClick={() => {
                const u = `${window.location.origin}/?pwa=1`;
                navigator.clipboard?.writeText(u);
              }}
            >
              Copia
            </button>
          </div>
        </div>

        {/* Android */}
        <div className="mt-5">
          <div className="text-sm font-semibold">Android (Chrome)</div>

          {canPrompt ? (
            <button
              onClick={installNow}
              className="mt-2 w-full rounded-lg bg-black px-4 py-3 font-bold text-white"
            >
              Installa adesso
            </button>
          ) : (
            <div className="mt-2 rounded-xl border p-4 text-sm text-gray-700">
              <div>1) Apri il sito con Chrome</div>
              <div>2) Menu ⋮ (in alto a destra)</div>
              <div>3) “Installa app” oppure “Aggiungi a schermata Home”</div>
              {isAndroid ? <div className="mt-2 text-xs text-gray-500">(Se non vedi il bottone, usa il menu ⋮)</div> : null}
            </div>
          )}
        </div>

        {/* iPhone */}
        <div className="mt-5">
          <div className="text-sm font-semibold">iPhone (Safari)</div>
          <div className="mt-2 rounded-xl border p-4 text-sm text-gray-700">
            <div>1) Apri il sito con Safari</div>
            <div>2) Tasto Condividi (⤴︎)</div>
            <div>3) “Aggiungi a Home”</div>
            {isIOS ? <div className="mt-2 text-xs text-gray-500">(Su iPhone funziona solo da Safari)</div> : null}
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <a
            href="/?pwa=1"
            className="w-full rounded-lg bg-black px-4 py-3 text-center font-bold text-white"
          >
            Vai all’app
          </a>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Se l’app è già installata, questo link apre direttamente la versione “app”.
        </div>
      </div>
    </div>
  );
}
