"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/browser";
import {EmptyState,FormActions,ModuleHeader,Notice,Pagination,SearchBar} from "@/components/crud-ui";
import {formatIDR} from "@/lib/format";
import {moneyInput} from "@/lib/client-utils";

type Row={id:string;name:string;sku:string|null;unit:string;price:number|string;description:string|null;is_active:boolean;deleted_at:string|null};
type F={name:string;unit:string;price:string;description:string;is_active:boolean};
const empty:F={name:"",unit:"pcs",price:"0",description:"",is_active:true};

export function CatalogManager({businessId,role,skuPrefix}:{businessId:string;role:string;skuPrefix:string}){
  const supabase=useMemo(()=>createClient(),[]);
  const[rows,setRows]=useState<Row[]>([]);const[loading,setLoading]=useState(true);const[q,setQ]=useState("");const[page,setPage]=useState(1);const[size,setSize]=useState(10);const[show,setShow]=useState(false);const[editing,setEditing]=useState<Row|null>(null);const[form,setForm]=useState<F>(empty);const[saving,setSaving]=useState(false);const[msg,setMsg]=useState<{kind:"success"|"error";text:string}|null>(null);
  const canDelete=role==="owner"||role==="admin";
  const prefix=(skuPrefix||"SKU").toUpperCase();

  const load=useCallback(async()=>{setLoading(true);const{data,error}=await supabase.from("catalog_items").select("id,name,sku,unit,price,description,is_active,deleted_at").eq("business_id",businessId).is("deleted_at",null).order("name");if(error)setMsg({kind:"error",text:error.message});setRows((data??[]) as Row[]);setLoading(false)},[businessId,supabase]);
  useEffect(()=>{void load()},[load]);useEffect(()=>setPage(1),[q,size]);
  const filtered=rows.filter(r=>`${r.name} ${r.sku??""} ${r.description??""}`.toLowerCase().includes(q.toLowerCase()));const pages=Math.max(1,Math.ceil(filtered.length/size));const view=filtered.slice((page-1)*size,page*size);

  function add(){setEditing(null);setForm(empty);setShow(true);setMsg(null)}
  function edit(r:Row){setEditing(r);setForm({name:r.name,unit:r.unit,price:String(r.price??0),description:r.description??"",is_active:r.is_active});setShow(true);setMsg(null)}

  async function save(e:React.FormEvent){
    e.preventDefault();if(!form.name.trim())return setMsg({kind:"error",text:"Nama produk/jasa wajib diisi."});setSaving(true);
    const payload={business_id:businessId,name:form.name.trim(),unit:form.unit.trim()||"pcs",price:moneyInput(form.price),description:form.description.trim()||null,is_active:form.is_active};
    // SKU tidak pernah dikirim dari browser. Database membuatnya atomik dari prefix usaha.
    const res=editing?await supabase.from("catalog_items").update(payload).eq("id",editing.id):await supabase.from("catalog_items").insert(payload);
    setSaving(false);if(res.error)return setMsg({kind:"error",text:res.error.message});setMsg({kind:"success",text:editing?"Produk/jasa diperbarui.":"Produk/jasa ditambahkan. SKU dibuat otomatis."});setShow(false);await load()
  }

  async function remove(r:Row){if(!canDelete||!confirm(`Hapus ${r.name}?`))return;const{error}=await supabase.from("catalog_items").update({deleted_at:new Date().toISOString(),is_active:false}).eq("id",r.id);if(error)return setMsg({kind:"error",text:error.message});setMsg({kind:"success",text:"Produk/jasa dihapus."});await load()}

  return <>
    <ModuleHeader title="Produk & Jasa" subtitle="Katalog sederhana untuk mempercepat pencatatan order" actionLabel="Tambah" onAction={add}/>
    {msg?<Notice kind={msg.kind}>{msg.text}</Notice>:null}
    {show?<form className="formPanel" onSubmit={save}>
      <h2>{editing?"Edit Produk/Jasa":"Tambah Produk/Jasa"}</h2>
      <div className="fieldGrid">
        <label className="formField full">Nama<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="formField">SKU Otomatis<input className="autoCodeInput" value={editing?.sku??`${prefix}-XXXXXX`} readOnly/><span className="formHint">{editing?"SKU dikunci agar histori transaksi tetap konsisten.":`Nomor dibuat otomatis saat disimpan. Prefix ${prefix} dapat diubah di Pengaturan Usaha.`}</span></label>
        <label className="formField">Satuan<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="pcs, box, jam"/></label>
        <label className="formField">Harga<input inputMode="numeric" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>
        <label className="formField full">Deskripsi<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        <label className="checkboxField full"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Aktif di katalog</label>
      </div>
      <FormActions saving={saving} onCancel={()=>setShow(false)} submitLabel={editing?"Simpan Perubahan":"Tambah Produk/Jasa"}/>
    </form>:null}
    <div className="crudToolbar"><SearchBar value={q} onChange={setQ} placeholder="Cari produk, jasa, SKU..."/><select className="pageSize" value={size} onChange={e=>setSize(Number(e.target.value))}><option>10</option><option>20</option><option>50</option></select></div>
    {loading?<div className="emptyPanel">Memuat katalog...</div>:view.length===0?<EmptyState>Belum ada produk/jasa.</EmptyState>:<div className="crudList">{view.map(r=><article className="crudCard" key={r.id}><div className="crudCardTop"><div className="crudCardTitle"><strong>{r.name}</strong><small>{r.sku||"SKU belum tersedia"} · {r.unit}</small><small>{r.description||"Tidak ada deskripsi"}</small></div><span className="crudCardAmount">{formatIDR(r.price)}</span></div><div className="crudCardActions"><button className="miniButton primary" onClick={()=>edit(r)}>Edit</button>{canDelete?<button className="miniButton danger" onClick={()=>void remove(r)}>Hapus</button>:null}</div></article>)}</div>}
    <Pagination page={page} pages={pages} onPage={setPage}/>
  </>
}
