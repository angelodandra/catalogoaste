"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser; // ✅ è un client, non una funzione

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/admin");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        alert(error.message);
        return;
      }
      router.replace("/admin");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    alert("Logout ok");
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-2xl font-bold">Login Admin</div>
        <div className="mt-1 text-sm text-gray-600">Accesso riservato.</div>

        <form className="mt-4 space-y-3" onSubmit={signIn}>
          <div>
            <label className="text-sm font-semibold">Email</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@azienda.it"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Password</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            className="w-full rounded-lg bg-black px-3 py-2 font-bold text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Accesso..." : "Entra"}
          </button>
        </form>

        <button
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm font-semibold"
          onClick={signOut}
          type="button"
        >
          Logout (se già loggato)
        </button>
      </div>
    </div>
  );
}
