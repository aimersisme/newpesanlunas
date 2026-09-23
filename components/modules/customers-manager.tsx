"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { EmptyState, FormActions, ModuleHeader, Notice, Pagination, SearchBar } from "@/components/crud-ui";

 type Customer = { id:string; name:string; whatsapp:string|null; email:string|null; address:string|null; notes:string|null; is_active:boolean; created_at:string; deleted_at:string|null };
 type FormState = { name:string; whatsapp:string; email:string; address:string; notes:string; is_active:boolean };
 const empty:FormState = { name:"", whatsapp:"", email:"", address:"", notes:"", is_active:true };

export function CustomersManager({ businessId, role }: { businessId:string; role:string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows,setRows]=useState<Customer[]>([]); const [loading,setLoading]=useState(true); const [query,setQuery]=useState(""); const [page,setPage]=useState(1); const [pageSize,setPageSize]=useState(10);
  const [editing,setEditing]=useState<Customer|null>(null); const [form,setForm]=useState<FormState>(empty); const [showForm,setShowForm]=useState(false); const [saving,setSaving]=useState(false); const [msg,setMsg]=useState<{kind:"success"|"error";text:string}|null>(null);
  const canDelete = role === "owner" || role === "admin";
  const load = useCallback(async()=>{ setLoading(true); const {data,error}=await supabase.from("customers").select("id,name,whatsapp,email,address,notes,is_active,created_at,deleted_at").eq("business_id",businessId).is("deleted_at",null).order("name"); if(error)setMsg({kind:"error",text:error.message}); setRows((data??[]) as Customer[]); setLoading(false); },[businessId,supabase]);
  useEffect(()=>{void load()},[load]);
  const filtered=rows.filter(r=>`${r.name} ${r.whatsapp??""} ${r.email??""}`.toLowerCase().includes(query.toLowerCase())); const pages=Math.max(1,Math.ceil(filtered.length/pageSize)); const view=filtered.slice((page-1)*pageSize,page*pageSize);
  useEffect(()=>{setPage(1)},[query,pageSize]);
  function startCreate(){setEditing(null);setForm(empty);setShowForm(true);setMsg(null)}
  function startEdit(r:Customer){setEditing(r);setForm({name:r.name,whatsapp:r.whatsapp??"",email:r.email??"",address:r.address??"",notes:r.notes??"",is_active:r.is_active});setShowForm(true);setMsg(null)}
  async function save(e:React.FormEvent){e.preventDefault(); if(!form.name.trim())return setMsg({kind:"error",text:"Nama pelanggan wajib diisi."}); setSaving(true); const payload={business_id:businessId,name:form.name.trim(),whatsapp:form.whatsapp.trim()||null,email:form.email.trim()||null,address:form.address.trim()||null,notes:form.notes.trim()||null,is_active:form.is_active}; const res=editing?await supabase.from("customers").update(payload).eq("id",editing.id):await supabase.from("customers").insert(payload); setSaving(false); if(res.error)return setMsg({kind:"error",text:res.error.message}); setMsg({kind:"success",text:editing?"Pelanggan berhasil diperbarui.":"Pelanggan berhasil ditambahkan."});setShowForm(false);setEditing(null);setForm(empty);await load();}
  async function remove(r:Customer){if(!canDelete||!confirm(`Hapus pelanggan ${r.name}?`))return; const {error}=await supabase.from("customers").update({deleted_at:new Date().toISOString(),is_active:false}).eq("id",r.id); if(error)return setMsg({kind:"error",text:error.message});setMsg({kind:"success",text:"Pelanggan dihapus."});await load();}
  return <>
    <ModuleHeader title="Pelanggan" subtitle={`${rows.length} pelanggan aktif`} actionLabel="Tambah" onAction={startCreate}/>
    {msg?<Notice kind={msg.kind}>{msg.text}</Notice>:null}
    {showForm?<form className="formPanel" onSubmit={save}><h2>{editing?"Edit Pelanggan":"Tambah Pelanggan"}</h2><div className="fieldGrid">
      <label className="formField full">Nama<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nama pelanggan"/></label>
      <label className="formField">WhatsApp<input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})} placeholder="08xxxxxxxxxx"/></label>
      <label className="formField">Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="opsional@email.com"/></label>
      <label className="formField full">Alamat<textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
      <label className="formField full">Catatan<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      <label className="checkboxField full"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Pelanggan aktif</label>
    </div><FormActions saving={saving} onCancel={()=>setShowForm(false)} submitLabel={editing?"Simpan Perubahan":"Tambah Pelanggan"}/></form>:null}
    <div className="crudToolbar"><SearchBar value={query} onChange={setQuery} placeholder="Cari nama, WA, email..."/><select className="pageSize" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option>10</option><option>20</option><option>50</option></select></div>
    {loading?<div className="emptyPanel">Memuat pelanggan...</div>:view.length===0?<EmptyState>Belum ada pelanggan. Tambahkan pelanggan pertama.</EmptyState>:<div className="crudList">{view.map(r=><article className="crudCard" key={r.id}><div className="crudCardTop"><div className="crudCardTitle"><strong>{r.name}</strong><small>{r.whatsapp||"WA belum diisi"}{r.email?` · ${r.email}`:""}</small><small>{r.address||"Alamat belum diisi"}</small></div><span className={`statusBadge ${r.is_active?"green":""}`}>{r.is_active?"Aktif":"Nonaktif"}</span></div><div className="crudCardActions"><button className="miniButton primary" onClick={()=>startEdit(r)}>Edit</button>{canDelete?<button className="miniButton danger" onClick={()=>void remove(r)}>Hapus</button>:null}</div></article>)}</div>}
    <Pagination page={page} pages={pages} onPage={setPage}/>
  </>;
}
