import Link from "next/link";
import { Bell, ChevronRight, Clock3, Plus, ReceiptText, ShoppingCart, TrendingUp, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Brand } from "@/components/brand";
import { StatCard } from "@/components/stat-card";
import { MonthlyChart } from "@/components/monthly-chart";
import { createClient } from "@/lib/supabase/server";
import { getActiveBusiness } from "@/lib/business";
import { compactIDR, formatIDR, greeting } from "@/lib/format";
import {
  normalizeDashboardMotivation,
  pickRandomQuote,
} from "@/lib/dashboard-personalization";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Business = { id:string; name:string; slug:string; timezone:string; role:string };
type Summary = {
  order_today:number; order_need_process:number; order_value_period:number; cash_received_period:number;
  active_receivables:number; due_today:number; overdue:number; invoice_total_period:number; invoice_paid_period:number; collection_rate:number;
};
type RecentOrder = { id:string; order_number:string; order_date:string; grand_total:number|string|null; balance_due:number|string|null; status:string; customer_name:string|null };
type ChartPoint = { day:number; value:number|string };
type Payload = {
  business:Business|null;
  viewer_name?:string|null;
  motivation?:unknown;
  summary?:Partial<Summary>;
  recent?:RecentOrder[];
  chart?:ChartPoint[];
};
type RawOrder = { id?:unknown; order_number?:unknown; order_date?:unknown; grand_total?:unknown; balance_due?:unknown; status?:unknown; created_at?:unknown };

function emptySummary(): Summary {
  return { order_today:0, order_need_process:0, order_value_period:0, cash_received_period:0, active_receivables:0, due_today:0, overdue:0, invoice_total_period:0, invoice_paid_period:0, collection_rate:0 };
}

function safeDisplayName(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > 36 ? text.slice(0, 36) : text;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-01`;
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+1, 0)).getUTCDate();
  const to = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

  let payload: Payload | null = null;
  const fast = await supabase.rpc("get_single_dashboard_payload", { p_from: from, p_to: to });

  if (!fast.error) {
    payload = (fast.data ?? {}) as unknown as Payload;
  } else {
    if (fast.error.message.includes("AUTH_REQUIRED")) redirect("/auth/login");

    // Runtime-safe fallback. A missing/broken performance RPC must never crash the app.
    const active = await getActiveBusiness(supabase);
    const [summaryResult, recentResult, chartResult, userResult, motivationResult] = await Promise.all([
      supabase.rpc("get_dashboard_summary", { p_business_id: active.id, p_from: from, p_to: to }),
      supabase.from("orders").select("id,order_number,order_date,grand_total,balance_due,status,created_at").eq("business_id", active.id).is("deleted_at", null).order("created_at", { ascending:false }).limit(5),
      supabase.from("orders").select("order_date,grand_total").eq("business_id", active.id).is("deleted_at", null).gte("order_date", from).lte("order_date", to).neq("status", "cancelled"),
      supabase.auth.getUser(),
      supabase.from("business_settings").select("value").eq("business_id", active.id).eq("key", "dashboard_motivation").maybeSingle(),
    ]);

    const summary: Summary = { ...emptySummary(), ...((summaryResult.data ?? {}) as Partial<Summary>) };
    const recent: RecentOrder[] = ((recentResult.data ?? []) as RawOrder[]).map((row) => ({
      id:String(row.id ?? ""), order_number:String(row.order_number ?? ""), order_date:String(row.order_date ?? ""),
      grand_total:(row.grand_total as number|string|null|undefined) ?? 0, balance_due:(row.balance_due as number|string|null|undefined) ?? 0,
      status:String(row.status ?? "draft"), customer_name:null,
    })).filter((row) => Boolean(row.id));

    const chartTotals = new Map<number, number>();
    for (const row of (chartResult.data ?? []) as Array<{order_date?:string|null; grand_total?:number|string|null}>) {
      const day = Number(String(row.order_date ?? "").slice(8,10));
      if (!Number.isFinite(day) || day < 1) continue;
      chartTotals.set(day, (chartTotals.get(day) ?? 0) + Number(row.grand_total ?? 0));
    }
    const chart: ChartPoint[] = Array.from(chartTotals.entries()).map(([day,value]) => ({day,value}));
    const viewerName = userResult.data.user?.user_metadata?.full_name ?? userResult.data.user?.user_metadata?.name ?? null;

    payload = {
      business:{ id:active.id, name:active.name, slug:active.slug, timezone:active.timezone, role:active.role },
      viewer_name: viewerName ? String(viewerName) : null,
      motivation: motivationResult.data?.value ?? null,
      summary,
      recent,
      chart,
    };
  }

  if (!payload?.business) redirect("/onboarding");
  const business = payload.business as Business;
  const summary = payload.summary ?? emptySummary();
  const recent = payload.recent ?? [];
  const chartMap = new Map((payload.chart ?? []).map((x) => [Number(x.day), Number(x.value ?? 0)]));
  const daily = Array.from({ length:lastDay }, (_,index) => ({ day:index+1, value:chartMap.get(index+1) ?? 0 }));
  const collection = Math.max(0, Math.min(100, Number(summary.collection_rate ?? 0)));
  const displayName = safeDisplayName(payload.viewer_name, business.name);
  const motivation = normalizeDashboardMotivation(payload.motivation);
  const dashboardQuote = motivation.enabled ? pickRandomQuote(motivation.quotes) : "";

  return <AppShell>
    <header className="topHeader"><Brand showTagline/><button className="iconButton" aria-label="Notifikasi"><Bell size={22}/></button></header>
    <section className="welcomeBlock personalizedWelcome">
      <h1>{greeting(business.timezone)}, {displayName} 👋</h1>
      {dashboardQuote ? <p className="dashboardQuote">“{dashboardQuote}”</p> : null}
    </section>

    <section className="businessCard premiumBusinessCard">
      <span className="businessAvatar"><ReceiptText size={23}/></span>
      <div><strong>{business.name}</strong><small>Order & piutang dalam satu tempat</small></div><ChevronRight size={22}/>
    </section>

    <section className="statsGrid">
      <StatCard icon={ShoppingCart} label="Order Hari Ini" value={String(summary.order_today ?? 0)}/>
      <StatCard icon={WalletCards} label="Belum Dibayar" value={compactIDR(summary.active_receivables ?? 0)} tone="red"/>
      <StatCard icon={Clock3} label="Jatuh Tempo" value={String((summary.due_today ?? 0)+(summary.overdue ?? 0))} tone="amber"/>
    </section>

    <section className="collectionCard">
      <div className="collectionRing" style={{background:`conic-gradient(#07965a ${collection}%, #e7eee9 0)`}}><div><strong>{collection}%</strong><span>tertagih</span></div></div>
      <div className="collectionCopy"><span className="eyebrow"><TrendingUp size={14}/> Pembayaran bulan ini</span><h2>{formatIDR(summary.cash_received_period ?? 0)}</h2><p>Dari invoice bulan ini {formatIDR(summary.invoice_total_period ?? 0)}.</p></div>
      <Link href="/receivables" className="collectionLink">Lihat Piutang <ChevronRight size={16}/></Link>
    </section>

    <MonthlyChart data={daily}/>

    <section className="sectionBlock"><div className="sectionTitle"><h2>Aktivitas Terbaru</h2><Link href="/orders">Lihat Semua</Link></div><div className="activityList">
      {recent.length===0 ? <div className="emptyState upgradedEmpty"><ShoppingCart size={26}/><strong>Belum ada order</strong><span>Catat pesanan pertama untuk mulai melihat aktivitas bisnis.</span></div> : recent.map(order => <Link href={`/orders/${order.id}`} className="activityRow" key={order.id}><span className="activityIcon"><ShoppingCart size={18}/></span><div><strong>{order.customer_name || "Pelanggan"}</strong><small>{order.order_number} · {order.status.replaceAll("_"," ")}</small></div><b>{formatIDR(order.grand_total)}</b></Link>)}
    </div></section>
    <Link className="floatingCTA" href="/orders/new"><Plus size={22}/> Catat Order</Link>
  </AppShell>;
}
