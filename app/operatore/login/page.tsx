"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const OP_DOMAIN = "@op.interno";

export default function OperatoreLoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      if (data.session) {
        const email = data.session.user?.email || "";
        if (email.endsWith(OP_DOMAIN)) {
          router.replace("/operatore/home");
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimmed = username.trim().toLowerCase().replace(/\s+/g, "");
    if (!trimmed) {
      setError("Inserisci il nome utente.");
      setLoading(false);
      return;
    }

    const email = trimmed + OP_DOMAIN;

    try {
      const { error: authError } = await supabase().auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Nome utente o password errati.");
        return;
      }

      router.replace("/operatore/home");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/logo.jpg" alt="Logo" className="h-14 w-auto object-contain" />
          <h1 className="text-xl font-bold">Accesso Operatori</h1>
          <p className="text-sm text-gray-500">Pannello stampa ordini</p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <form className="space-y-4" onSubmit={signIn}>
            <div>
              <label className="block text-sm font-semibold">Nome utente</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder="mario"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold">Password</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              className="w-full rounded-lg bg-black px-3 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Accesso in corso…" : "Entra"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
