"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CreditCard, MessageCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { EmptyState, FormActions, ModuleHeader, Notice, Pagination, SearchBar } from "@/components/crud-ui";
import { formatDate, formatIDR } from "@/lib/format";

type DebtType = "receivable" | "payable";
type Row = {
  id: string; type: DebtType; person_name: string; whatsapp: string | null; email: string | null;
  reference: string | null; original_amount: number | string; balance_amount: number | string;
  transaction_date: string; due_date: string | null; notes: string | null; status: string;
};
type Payment = { id:string; amount:number|string; payment_date:string; note:string|null };

const emptyForm = { type:"receivable" as DebtType, person_name:"", whatsapp:"", email:"", reference:"", original_amount:"", transaction_date:new Date().toISOString().slice(0,10), due_date:"", notes:"" };

function effectiveStatus(row: Row) {
  const balance = Number(row.balance_amount ?? 0);
  if (balance <= 0) return "paid";
  if (row.due_date && row.due_date < new Date().toISOString().slice(0,10)) return "overdue";
  if (balance < Number(row.original_amount ?? 0)) return "partial";
  return "open";
}
function statusLabel(status:string) { return ({open:"Aktif",partial:"Sebagian",paid:"Lunas",overdue:"Jatuh Tempo",cancelled:"Dibatalkan"} as Record<string,string>)[status] ?? status; }

export function DebtsManager({ businessId }: { businessId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows,setRows] = useState<Row[]>([]); const [q,setQ] = useState(""); const [type,setType] = useState<"all"|DebtType>("all");
  const [page,setPage] = useState(1); const [size,setSize] = useState(10); const [form,setForm] = useState(emptyForm);
  const [editing,setEditing] = useState<Row|null>(null); const [showForm,setShowForm] = useState(false); const [saving,setSaving] = useState(false);
  const [selected,setSelected] = useState<Row|null>(null); const [payments,setPayments] = useState<Payment[]>([]); const [paymentAmount,setPaymentAmount] = useState(""); const [paymentDate,setPaymentDate] = useState(new Date().toISOString().slice(0,10)); const [paymentNote,setPaymentNote] = useState(""); const [notice,setNotice] = useState<{kind:"success"|"error"|"info";text:string}|null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("debt_records").select("id,type,person_name,whatsapp,email,reference,original_amount,balance_amount,transaction_date,due_date,notes,status").eq("business_id",businessId).is("deleted_at",null).order("transaction_date",{ascending:false}).order("created_at",{ascending:false}).limit(1000);
    if (error) { setNotice({kind:"error",text:error.message}); return; }
    setRows((data ?? []) as unknown as Row[]);
  },[businessId,supabase]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>setPage(1),[q,size,type]);

  const filtered = rows.filter(r => (type === "all" || r.type === type) && `${r.person_name} ${r.whatsapp??""} ${r.reference??""} ${r.notes??""}`.toLowerCase().includes(q.toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/size)); const view=filtered.slice((page-1)*size,page*size);
  const receivable=rows.filter(r=>r.type==="receivable" && effectiveStatus(r)!=="paid").reduce((s,r)=>s+Number(r.balance_amount||0),0);
  const payable=rows.filter(r=>r.type==="payable" && effectiveStatus(r)!=="paid").reduce((s,r)=>s+Number(r.balance_amount||0),0);
  const overdue=rows.filter(r=>effectiveStatus(r)==="overdue").reduce((s,r)=>s+Number(r.balance_amount||0),0);

  const openCreate = (t:DebtType="receivable") => { setEditing(null); setForm({...emptyForm,type:t,transaction_date:new Date().toISOString().slice(0,10)}); setShowForm(true); setNotice(null); };
  const openEdit = (r:Row) => { setEditing(r); setForm({type:r.type,person_name:r.person_name,whatsapp:r.whatsapp??"",email:r.email??"",reference:r.reference??"",original_amount:String(r.original_amount??""),transaction_date:r.transaction_date,due_date:r.due_date??"",notes:r.notes??""}); setShowForm(true); setNotice(null); };
  const submit = async (e:React.FormEvent) => {
    e.preventDefault(); setSaving(true); setNotice(null);
    const amount=Number(form.original_amount);
    if (!form.person_name.trim() || !Number.isFinite(amount) || amount<=0) { setNotice({kind:"error",text:"Nama dan nominal awal wajib diisi dengan benar."}); setSaving(false); return; }
    if (editing && amount < Number(editing.balance_amount ?? 0)) { setNotice({kind:"error",text:"Nominal awal tidak boleh lebih kecil dari sisa saldo saat ini."}); setSaving(false); return; }
    const payload={business_id:businessId,type:form.type,person_name:form.person_name.trim(),whatsapp:form.whatsapp.trim()||null,email:form.email.trim()||null,reference:form.reference.trim()||null,original_amount:Math.round(amount),transaction_date:form.transaction_date,due_date:form.due_date||null,notes:form.notes.trim()||null};
    const result=editing ? await supabase.from("debt_records").update(payload).eq("id",editing.id).eq("business_id",businessId) : await supabase.from("debt_records").insert(payload);
    if (result.error) setNotice({kind:"error",text:result.error.message}); else { setShowForm(false); setNotice({kind:"success",text:editing?"Data hutang/piutang diperbarui.":"Hutang/piutang berhasil dicatat."}); await load(); }
    setSaving(false);
  };
  const openDetail = async (r:Row) => { setSelected(r); setPaymentAmount(""); setPaymentNote(""); setPaymentDate(new Date().toISOString().slice(0,10)); const {data}=await supabase.from("debt_payments").select("id,amount,payment_date,note").eq("debt_id",r.id).order("payment_date",{ascending:false}); setPayments((data??[]) as unknown as Payment[]); };
  const addPayment = async (e:React.FormEvent) => {
    e.preventDefault(); if (!selected) return; setSaving(true); setNotice(null); const amount=Number(paymentAmount); if (!Number.isFinite(amount)||amount<=0){setNotice({kind:"error",text:"Nominal pembayaran harus lebih dari 0."});setSaving(false);return;}
    const {data,error}=await supabase.rpc("record_debt_payment",{p_debt_id:selected.id,p_amount:Math.round(amount),p_payment_date:paymentDate,p_note:paymentNote.trim()||null});
    if(error){setNotice({kind:"error",text:error.message});} else {setNotice({kind:"success",text:"Pembayaran berhasil dicatat."});setPaymentAmount("");setPaymentNote("");await load();const fresh=rows.find(x=>x.id===selected.id);if(fresh){const updated={...fresh,balance_amount:(data as {balance_amount?:number})?.balance_amount ?? Math.max(0,Number(fresh.balance_amount)-amount)};setSelected(updated);await openDetail(updated);}}
    setSaving(false);
  };
  const remove = async (r:Row) => { const {count}=await supabase.from("debt_payments").select("id",{count:"exact",head:true}).eq("debt_id",r.id); if((count??0)>0){setNotice({kind:"error",text:"Data yang sudah memiliki pembayaran tidak dapat dihapus. Edit atau selesaikan pembayarannya."});return;} const {error}=await supabase.from("debt_records").update({deleted_at:new Date().toISOString()}).eq("id",r.id); if(error)setNotice({kind:"error",text:error.message});else{setNotice({kind:"success",text:"Data dihapus."});await load();} };

  return <>
    <ModuleHeader title="Hutang & Piutang" subtitle="Catat pinjaman, kewajiban, cicilan, dan sisa saldo" actionLabel="Tambah" onAction={()=>openCreate()} />
    {notice?<Notice kind={notice.kind}>{notice.text}</Notice>:null}
    <section className="debtKpis"><article className="kpiGreen"><ArrowDownLeft size={18}/><span>Total Piutang</span><strong>{formatIDR(receivable)}</strong><small>Orang lain berutang ke usaha</small></article><article className="kpiDanger"><ArrowUpRight size={18}/><span>Total Hutang</span><strong>{formatIDR(payable)}</strong><small>Kewajiban usaha</small></article><article className="kpiAmber"><CalendarClock size={18}/><span>Jatuh Tempo</span><strong>{formatIDR(overdue)}</strong><small>Piutang/hutang melewati tempo</small></article></section>
    <div className="segmented"><button className={type==="all"?"active":""} onClick={()=>setType("all")}>Semua</button><button className={type==="receivable"?"active":""} onClick={()=>setType("receivable")}>Piutang</button><button className={type==="payable"?"active":""} onClick={()=>setType("payable")}>Hutang</button><button onClick={()=>openCreate("receivable")}><Plus size={14}/> Piutang</button><button onClick={()=>openCreate("payable")}><Plus size={14}/> Hutang</button></div>
    <div className="crudToolbar"><SearchBar value={q} onChange={setQ} placeholder="Cari nama / WA / keterangan..."/><select className="pageSize" value={size} onChange={e=>setSize(Number(e.target.value))}><option>10</option><option>20</option><option>50</option></select></div>
    {view.length===0?<EmptyState>Belum ada data hutang/piutang.</EmptyState>:<div className="crudList">{view.map(r=>{const s=effectiveStatus(r);const isR=r.type==="receivable";return <article className="crudCard debtCard" key={r.id}><button className="debtMain" onClick={()=>openDetail(r)}><div className={`debtIcon ${isR?"green":"red"}`}>{isR?<ArrowDownLeft size={19}/>:<ArrowUpRight size={19}/>}</div><div className="crudCardTitle"><strong>{r.person_name}</strong><small>{isR?"Piutang":"Hutang"}{r.reference?` · ${r.reference}`:""}</small><small>{r.due_date?`Jatuh tempo ${formatDate(r.due_date)}`:"Tanpa jatuh tempo"}</small></div><div className="debtAmount"><b>{formatIDR(r.balance_amount)}</b><span className={`statusBadge ${s==="paid"?"green":s==="overdue"?"red":s==="partial"?"amber":""}`}>{statusLabel(s)}</span></div></button><div className="debtActions"><button className="miniButton" onClick={()=>openEdit(r)}><Pencil size={14}/> Edit</button>{r.whatsapp?<a className="miniButton" href={`https://wa.me/${r.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"><MessageCircle size={14}/> WA</a>:null}<button className="miniButton danger" onClick={()=>void remove(r)}><Trash2 size={14}/> Hapus</button></div></article>})}</div>}
    <Pagination page={page} pages={pages} onPage={setPage}/>

    {showForm?<div className="modalBackdrop"><form className="modalCard formPanel" onSubmit={submit}><div className="modalHead"><div><h2>{editing?"Edit":"Tambah"} {form.type==="receivable"?"Piutang":"Hutang"}</h2><p>Catatan ini berdiri sendiri, tidak perlu membuat customer atau invoice.</p></div><button type="button" className="modalClose" onClick={()=>setShowForm(false)}><X size={18}/></button></div><div className="fieldGrid"><label className="formField"><span>Jenis</span><select value={form.type} onChange={e=>setForm({...form,type:e.target.value as DebtType})} disabled={!!editing}><option value="receivable">Piutang — orang lain berutang ke kita</option><option value="payable">Hutang — kita berutang ke orang lain</option></select></label><label className="formField"><span>Nama / Pihak</span><input required value={form.person_name} onChange={e=>setForm({...form,person_name:e.target.value})} placeholder="Contoh: Budi"/></label><label className="formField"><span>Nominal Awal</span><input required type="number" min="1" value={form.original_amount} onChange={e=>setForm({...form,original_amount:e.target.value})} placeholder="10000000"/></label><label className="formField"><span>Tanggal</span><input type="date" required value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})}/></label><label className="formField"><span>Jatuh Tempo <small className="formHint">opsional</small></span><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label><label className="formField"><span>WhatsApp <small className="formHint">opsional</small></span><input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})} placeholder="62812..."/></label><label className="formField"><span>Email <small className="formHint">opsional</small></span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="formField"><span>Referensi <small className="formHint">opsional</small></span><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="Pinjaman pribadi"/><span className="formHint">Bisa diisi nomor catatan, tujuan, atau sumber transaksi.</span></label><label className="formField full"><span>Catatan</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Detail tambahan..."/></label></div><FormActions saving={saving} onCancel={()=>setShowForm(false)} submitLabel={editing?"Simpan Perubahan":"Simpan"}/></form></div>:null}

    {selected?<div className="modalBackdrop"><section className="modalCard formPanel"><div className="modalHead"><div><h2>{selected.person_name}</h2><p>{selected.type==="receivable"?"Piutang":"Hutang"} · saldo {formatIDR(selected.balance_amount)}</p></div><button className="modalClose" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="detailStats"><div className="detailStat"><span>Nominal awal</span><strong>{formatIDR(selected.original_amount)}</strong></div><div className="detailStat"><span>Sisa saldo</span><strong>{formatIDR(selected.balance_amount)}</strong></div><div className="detailStat"><span>Tanggal</span><strong>{formatDate(selected.transaction_date)}</strong></div><div className="detailStat"><span>Jatuh tempo</span><strong>{formatDate(selected.due_date)}</strong></div></div><div className="sectionTitleRow" style={{marginTop:16}}><div><h2 style={{fontSize:14}}>Catat Pembayaran</h2><p>Pembayaran akan mengurangi saldo secara otomatis.</p></div></div>{Number(selected.balance_amount)>0?<form className="fieldGrid" onSubmit={addPayment}><label className="formField"><span>Nominal</span><input type="number" min="1" max={Number(selected.balance_amount)} value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} placeholder="2000000" required/></label><label className="formField"><span>Tanggal</span><input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} required/></label><label className="formField full"><span>Catatan</span><input value={paymentNote} onChange={e=>setPaymentNote(e.target.value)} placeholder="Cicilan ke-1"/></label><div className="formActions" style={{gridColumn:"1/-1"}}><button className="primaryAction" disabled={saving} type="submit"><CreditCard size={16}/> {saving?"Menyimpan...":"Catat Pembayaran"}</button></div></form>:<Notice>Data sudah lunas.</Notice>}<div className="sectionTitleRow" style={{marginTop:16}}><div><h2 style={{fontSize:14}}>Riwayat Pembayaran</h2></div></div><div className="tableLike">{payments.length===0?<div className="tableRow"><span>Belum ada pembayaran.</span></div>:payments.map(p=><div className="tableRow" key={p.id}><div><strong>{formatDate(p.payment_date)}</strong><small>{p.note||"Pembayaran"}</small></div><strong>{formatIDR(p.amount)}</strong></div>)}</div></section></div>:null}
  </>;
}
