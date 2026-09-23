"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Plus, Search, XCircle } from "lucide-react";

export function ModuleHeader({ title, subtitle, backHref = "/more", actionLabel, onAction }: { title: string; subtitle?: string; backHref?: string; actionLabel?: string; onAction?: () => void }) {
  return <header className="moduleHeader">
    <div className="moduleHeaderTop">
      <Link className="backButton" href={backHref}><ArrowLeft size={20}/></Link>
      <div className="moduleHeaderText"><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
      {actionLabel && onAction ? <button type="button" className="smallPrimary" onClick={onAction}><Plus size={17}/>{actionLabel}</button> : <span className="headerSpacer"/>}
    </div>
  </header>;
}

export function SearchBar({ value, onChange, placeholder = "Cari..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="searchBox"><Search size={18}/><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label>;
}

export function Notice({ kind = "success", children }: { kind?: "success" | "error" | "info"; children: React.ReactNode }) {
  const Icon = kind === "error" ? XCircle : CheckCircle2;
  return <div className={`notice ${kind}`}><Icon size={17}/><span>{children}</span></div>;
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <div className="pagination">
    <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}><ChevronLeft size={17}/></button>
    <span>Halaman {page} / {pages}</span>
    <button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages}><ChevronRight size={17}/></button>
  </div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="emptyPanel">{children}</div>;
}

export function FormActions({ saving, onCancel, submitLabel = "Simpan" }: { saving: boolean; onCancel?: () => void; submitLabel?: string }) {
  return <div className="formActions">
    {onCancel ? <button type="button" className="secondaryAction" onClick={onCancel}>Batal</button> : null}
    <button className="primaryAction" disabled={saving} type="submit">{saving ? "Menyimpan..." : submitLabel}</button>
  </div>;
}
