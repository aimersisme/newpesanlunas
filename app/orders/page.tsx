import Link from "next/link";
import { ChevronRight, ClipboardList, Plus, Search, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { compactIDR, formatDate, formatIDR } from "@/lib/format";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
type OrderRow={id:string;order_number:string;order_date:string;status:string;grand_total:number|string|null;balance_due:number|string|null;customer_name:string|null;customer_whatsapp:string|null};
type Stats={total:number;confirmed:number;in_progress:number;ready:number;completed:number;open_balance:number|string};
type Payload={business_id:string|null;stats?:Partial<Stats>;rows?:OrderRow[]};
const tabs=[["all","Semua"],["confirmed","Baru"],["in_progress","Diproses"],["completed","Selesai"]] as const;
function statusLabel(status:string,balance:number):[string,string]{if(balance===0)return["Lunas","paid"];if(status==="in_progress")return["Diproses","process"];if(status==="ready")return["Siap","process"];if(status==="completed")return["Selesai","paid"];return["Belum Bayar","unpaid"]}

export default async function OrdersPage({searchParams}:{searchParams:Promise<{status?:string;q?:string}>}){
  const params=await searchParams; const active=params.status||"all"; const q=(params.q||"").trim();
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_single_orders_page",{p_status:active,p_query:q||null,p_limit:100});
  if(error){if(error.message.includes("AUTH_REQUIRED"))redirect("/auth/login");throw new Error(`ORDERS_PAYLOAD_FAILED: ${error.message}. Jalankan SQL patch v0.2.1.`)}
  const payload=(data??{}) as unknown as Payload; if(!payload.business_id)redirect("/onboarding");
  const stats=payload.stats??{}; const orders=payload.rows??[];
  return <AppShell>
    <header className="pageHeader"><div><h1>Pesanan</h1><p>Kelola semua pesanan pelanggan</p></div><Link className="smallAddButton" href="/orders/new"><Plus size={18}/></Link></header>
    <section className="ordersOverview">
      <article><span><ClipboardList size={17}/> Total Order</span><strong>{stats.total??0}</strong></article>
      <article><span><WalletCards size={17}/> Sisa Tagihan</span><strong>{compactIDR(stats.open_balance??0)}</strong></article>
      <article><span>Dalam Proses</span><strong>{Number(stats.in_progress??0)+Number(stats.ready??0)}</strong></article>
    </section>
    <form className="searchBox"><Search size={19}/><input name="q" defaultValue={q} placeholder="Cari pelanggan atau nomor pesanan..."/><input type="hidden" name="status" value={active}/></form>
    <div className="filterTabs">{tabs.map(([value,label])=><Link key={value} className={active===value?"active":""} href={`/orders?status=${value}${q?`&q=${encodeURIComponent(q)}`:""}`}>{label}</Link>)}</div>
    <section className="orderList">{orders.length===0?<div className="emptyPanel upgradedEmpty"><ClipboardList size={28}/><strong>Belum ada pesanan</strong><span>{q?"Tidak ada pesanan yang cocok dengan pencarian.":"Mulai catat order pelanggan pertama."}</span><Link className="miniButton primary" href="/orders/new">+ Catat Order</Link></div>:orders.map(order=>{const [label,tone]=statusLabel(order.status,Number(order.balance_due??0));const name=order.customer_name?.trim()||"Pelanggan";const initials=name.split(/\s+/).slice(0,2).map(x=>x.charAt(0)).join("").toUpperCase();return <Link href={`/orders/${order.id}`} className="orderCard" key={order.id}><span className="customerAvatar">{initials}</span><div className="orderMain"><strong>{name}</strong><small>{order.order_number}</small><small>{formatDate(order.order_date)}</small></div><div className="orderRight"><b>{formatIDR(order.grand_total)}</b><span className={`statusPill ${tone}`}>{label}</span></div><ChevronRight size={20} className="orderChevron"/></Link>})}</section>
    <Link className="floatingCTA" href="/orders/new"><Plus size={22}/> Catat Order</Link>
  </AppShell>
}
