import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdmin, adminErrorResponse } from "@/lib/requireAdmin";

export const runtime = "nodejs";

type Row = {
  customer_phone: string;
  logged_at?: string;
  created_at?: string;
  status?: string;
};

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || "30")));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = supabaseServer();

    const { data: customers, error: eCust } = await supabase
      .from("customers")
      .select("name,company,phone,status,created_at")
      .order("created_at", { ascending: false });
    if (eCust) throw eCust;

    const { data: logins, error: eLog } = await supabase
      .from("customer_logins")
      .select("customer_phone,logged_at")
      .gte("logged_at", since)
      .order("logged_at", { ascending: false });
    if (eLog) throw eLog;

    const { data: orders, error: eOrd } = await supabase
      .from("orders")
      .select("customer_phone,status,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (eOrd) throw eOrd;

    const loginAgg = new Map<string, { count: number; last: string | null }>();
    for (const r of (logins || []) as Row[]) {
      const p = String(r.customer_phone || "");
      if (!p) continue;
      const prev = loginAgg.get(p) || { count: 0, last: null };
      const t = String(r.logged_at || "");
      loginAgg.set(p, { count: prev.count + 1, last: prev.last || t });
    }

    const orderAgg = new Map<string, { total: number; completed: number; created: number; last: string | null }>();
    for (const r of (orders || []) as Row[]) {
      const p = String(r.customer_phone || "");
      if (!p) continue;
      const prev = orderAgg.get(p) || { total: 0, completed: 0, created: 0, last: null };
      const st = String(r.status || "").toLowerCase();
      const t = String(r.created_at || "");
      orderAgg.set(p, {
        total: prev.total + 1,
        completed: prev.completed + (st === "completed" ? 1 : 0),
        created: prev.created + (st === "created" ? 1 : 0),
        last: prev.last || t,
      });
    }

    const out = (customers || []).map((c: any) => {
      const phone = String(c.phone || "");
      const la = loginAgg.get(phone) || { count: 0, last: null };
      const oa = orderAgg.get(phone) || { total: 0, completed: 0, created: 0, last: null };
      return {
        name: c.name || null,
        company: c.company || null,
        phone,
        status: c.status || null,
        created_at: c.created_at || null,
        logins_30d: la.count,
        last_login: la.last,
        orders_30d: oa.total,
        orders_completed_30d: oa.completed,
        orders_created_30d: oa.created,
        last_order: oa.last,
      };
    });

    return NextResponse.json({ ok: true, days, since, customers: out });
  } catch (e: any) {
    return adminErrorResponse(e);
  }
}
