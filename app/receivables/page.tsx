import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronRight, CircleDollarSign, Clock3, MessageCircle, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { compactIDR, formatDate, formatIDR, normalizeWhatsApp } from "@/lib/format";
import { redirect } from "next/navigation";

export const dynamic="force-dynamic";
type Metrics={total_balance:number|string;active_count:number;unpaid_count:number;partial_count:number;overdue_count:number;overdue_balance:number|string;due_today_count:number;due_7d_count:number;due_7d_balance:number|string;amount_paid_on_open:number|string;risk_pct:number;collection_rate:number;aging_1_7:number|string;aging_8_30:number|string;aging_31_plus:number|string};
type Row={invoice_id:string;invoice_number:string;grand_total:number|string;amount_paid:number|string;balance_due:number|string;issue_date:string;due_date:string|null;payment_status:string;effective_payment_status:string;days_from_due:number|string|null;customer_name:string|null;customer_whatsapp:string|null};
type Payload={business_id:string|null;today?:string;metrics?:Partial<Metrics>;rows?:Row[]};

export default async function ReceivablesPage(){
  const supabase=await createClient(); const {data,error}=await supabase.rpc("get_single_receivables_page",{p_limit:100});
  if(error){if(error.message.includes("AUTH_REQUIRED"))redirect("/auth/login");throw new Error(`RECEIVABLES_PAYLOAD_FAILED: ${error.message}. Jalankan SQL patch v0.2.1.`)}
  const payload=(data??{}) as unknown as Payload; if(!payload.business_id)redirect("/onboarding"); const m=payload.metrics??{}; const rows=payload.rows??[];
  const total=Number(m.total_balance??0), overdue=Number(m.overdue_balance??0), risk=Math.max(0,Math.min(100,Number(m.risk_pct??0))), collection=Math.max(0,Math.min(100,Number(m.collection_rate??0)));
  const aging=[{label:"1–7 hari",value:Number(m.aging_1_7??0)},{label:"8–30 hari",value:Number(m.aging_8_30??0)},{label:">30 hari",value:Number(m.aging_31_plus??0)}];
  const maxAging=Math.max(...aging.map(x=>x.value),1);
  return <AppShell>
    <header className="pageHeader"><div><h1>Piutang</h1><p>Pantau tagihan dan risiko keterlambatan</p></div></header>

    <section className="receivableDashboard">
      <div className="receivableDashboardMain"><span className="eyebrow"><WalletCards size={15}/> Total Piutang Aktif</span><strong>{formatIDR(total)}</strong><small>{m.active_count??0} invoice belum lunas</small></div>
      <div className="riskRing" style={{background:`conic-gradient(${risk>=50?"#d51d32":risk>=20?"#d48a00":"#07965a"} ${risk}%, #f0f2ef 0)`}}><div><b>{risk}%</b><span>terlambat</span></div></div>
    </section>

    <section className="receivableKpis">
      <article className="kpiDanger"><AlertTriangle size={18}/><span>Terlambat</span><strong>{compactIDR(overdue)}</strong><small>{m.overdue_count??0} invoice</small></article>
      <article className="kpiAmber"><CalendarClock size={18}/><span>Jatuh tempo 7 hari</span><strong>{compactIDR(m.due_7d_balance??0)}</strong><small>{m.due_7d_count??0} invoice</small></article>
      <article className="kpiGreen"><CircleDollarSign size={18}/><span>Tingkat tertagih</span><strong>{collection}%</strong><small>seluruh invoice</small></article>
      <article className="kpiBlue"><ReceiptText size={18}/><span>Sudah dicicil</span><strong>{compactIDR(m.amount_paid_on_open??0)}</strong><small>{m.partial_count??0} parsial</small></article>
    </section>

    <section className="agingPanel"><div className="sectionTitle"><h2>Umur Piutang</h2><span className="agingHint">berdasarkan keterlambatan</span></div>{aging.map(item=><div className="agingRow" key={item.label}><span>{item.label}</span><div className="agingTrack"><i style={{width:`${item.value?Math.max(8,(item.value/maxAging)*100):0}%`}}/></div><b>{compactIDR(item.value)}</b></div>)}</section>

    <section className="receivableList sectionBlock"><div className="sectionTitle"><h2>Daftar Tagihan</h2><span className="agingHint">{rows.length} aktif</span></div>
      {rows.length===0?<div className="emptyPanel upgradedEmpty"><WalletCards size={30}/><strong>Belum ada piutang aktif 🎉</strong><span>Begitu ada order dengan DP/cicilan atau tempo, statusnya akan muncul di sini.</span><Link className="miniButton primary" href="/orders/new">+ Catat Order</Link></div>:rows.map(row=>{const late=row.effective_payment_status==="overdue";const phone=normalizeWhatsApp(row.customer_whatsapp);const name=row.customer_name?.trim()||"Pelanggan";const text=encodeURIComponent(`Halo ${name}, kami mengingatkan sisa tagihan ${row.invoice_number} sebesar ${formatIDR(row.balance_due)}${row.due_date?`, jatuh tempo ${formatDate(row.due_date)}`:""}. Terima kasih.`);return <article className="receivableCard" key={row.invoice_id}><div className="receivableTop"><span className={`receivableIcon ${late?"late":""}`}><Clock3 size={18}/></span><div><strong>{name}</strong><small>{row.invoice_number}</small></div><b>{formatIDR(row.balance_due)}</b></div><div className="paymentProgress"><div style={{width:`${Math.min(100,Math.max(0,Number(row.grand_total)?Number(row.amount_paid)*100/Number(row.grand_total):0))}%`}}/></div><div className="receivableMeta"><span>Jatuh tempo: {formatDate(row.due_date)}</span><span className={late?"lateText":""}>{late?`Terlambat ${Math.max(1,Number(row.days_from_due??0))} hari`:row.payment_status==="partial"?"Sudah ada cicilan":"Belum dibayar"}</span></div><div className="crudCardActions"><Link className="miniButton primary" href={`/invoices/${row.invoice_id}`}>Detail / Bayar <ChevronRight size={14}/></Link>{phone?<a className="miniButton" target="_blank" rel="noreferrer" href={`https://wa.me/${phone}?text=${text}`}><MessageCircle size={15}/> WhatsApp</a>:<span className="waDisabled">WA belum diisi</span>}</div></article>})}
    </section>
  </AppShell>
}
