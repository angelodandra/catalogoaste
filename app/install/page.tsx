"use client";

import { useEffect, useMemo, useState } from "react";

export default function InstallPage() {
  const [canPrompt, setCanPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/?pwa=1";
    return `${window.location.origin}/?pwa=1`;
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler as any);
    return () => window.removeEventListener("beforeinstallprompt", handler as any);
  }, []);

  async function installAndroid() {
    try {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setCanPrompt(false);
    } catch {}
  }

  function installIphone() {
    // Su iPhone non possiamo forzare l'install: apriamo il link e basta
    window.location.href = appUrl;
  }

  function openApp() {
    window.location.href = appUrl;
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-4 flex justify-center">
        <img src="/logo.jpg" alt="Logo" className="h-16 w-auto" />
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-center">Installa l’app</h1>

        <div className="mt-5 grid gap-3">
          <button
            onClick={installIphone}
            className="w-full rounded-xl bg-black px-4 py-3 text-lg font-bold text-white"
          >
            iPhone (Safari) → Installa
          </button>

          <button
            onClick={canPrompt ? installAndroid : openApp}
            className="w-full rounded-xl border bg-white px-4 py-3 text-lg font-bold"
          >
            Android (Chrome) → Installa
          </button>

          <button
            onClick={openApp}
            className="w-full rounded-xl border bg-white px-4 py-3 font-semibold"
          >
            Apri l’app
          </button>
        </div>
      </div>
    </div>
  );
}
