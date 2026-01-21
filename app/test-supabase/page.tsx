"use client";

import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function Page() {
  const [msg, setMsg] = useState("Test Supabase…");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      setMsg("Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }

    (async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(url, key);

      const { data, error } = await supabase.from("catalogs").select("id").limit(1);
      if (error) setMsg("Errore: " + error.message);
      else setMsg("OK: " + JSON.stringify(data));
    })().catch((e: any) => setMsg("Errore: " + String(e?.message ?? e)));
  }, []);

  return <div className="p-6 text-sm">{msg}</div>;
}
