import Link from "next/link";
import { Boxes, ChevronRight, ClipboardList, FileText, History, Landmark, MessageCircle, Palette, Settings, SlidersHorizontal, Users, UserRoundCog, CircleUserRound, ArrowDownUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getActiveBusiness } from "@/lib/business";
import { LogoutButton } from "@/components/logout-button";

const menus = [
  [Users, "Pelanggan", "Kelola data pelanggan", "/customers"],
  [Boxes, "Produk & Jasa", "Katalog sederhana untuk order", "/catalog"],
  [FileText, "Invoice", "Invoice, pembayaran, refund, link publik", "/invoices"],
  [ArrowDownUp, "Hutang & Piutang", "Pinjaman, kewajiban, cicilan, dan sisa saldo", "/debts"],
  [Landmark, "Metode Pembayaran", "Bank, e-wallet, QRIS, cash", "/payment-methods"],
  [SlidersHorizontal, "Template & Custom Field", "Sesuaikan form order tiap usaha", "/custom-fields"],
  [MessageCircle, "Integrasi WhatsApp", "Manual, Fonnte, atau Starsender", "/whatsapp"],
  [ClipboardList, "Template Pesan", "Pesan invoice dan pengingat", "/message-templates"],
  [UserRoundCog, "Anggota Tim", "Owner, Admin, Staff, Finance", "/team"],
  [History, "Aktivitas", "Audit aktivitas penting", "/activity"],
  [CircleUserRound, "Akun Saya", "Profil dan ganti password", "/account"],
  [Palette, "Tampilan & Tema", "10 preset + Custom Brand", "/appearance"],
  [Settings, "Pengaturan Usaha", "Profil, prefix, provider", "/settings"],
] as const;

export default async function MorePage() {
  const business = await getActiveBusiness();
  return <AppShell>
    <header className="pageHeader"><div><h1>Lainnya</h1><p>{business.name} · akses sebagai {business.role}</p></div></header>
    <div className="quickLinks" style={{marginBottom:14}}><Link className="quickLink" href="/reports"><strong>Laporan</strong><small>Ringkasan + ekspor CSV</small></Link><Link className="quickLink" href="/orders/new"><strong>Catat Order</strong><small>Order + invoice + DP</small></Link></div>
    <section className="menuPanel">
      {menus.map(([Icon,title,desc,href]) => <Link className="menuRow" href={href} key={title}><Icon size={20}/><span><strong>{title}</strong><small>{desc}</small></span><ChevronRight size={18}/></Link>)}
    </section>
    <section className="menuPanel"><LogoutButton /></section>
    <div className="buildNote"><strong>PesanLunas v0.2.11</strong><span>CRUD ✓ · Quick Customer ✓ · Auto SKU ✓ · 10 Tema ✓ · Hutang & Piutang ✓</span></div>
  </AppShell>;
}
