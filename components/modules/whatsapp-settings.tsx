"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ModuleHeader, Notice } from "@/components/crud-ui";
import { normalizeWhatsApp } from "@/lib/format";

type Provider = "manual" | "fonnte" | "starsender";

export function WhatsAppSettings({
  businessId,
  role,
  businessWhatsapp,
}: {
  businessId: string;
  role: string;
  businessWhatsapp: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [provider, setProvider] = useState<Provider>("manual");
  const [autoReminder, setAutoReminder] = useState(false);
  const [token, setToken] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [maskedToken, setMaskedToken] = useState("");
  const [msg, setMsg] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState("Test PesanLunas: integrasi WhatsApp aktif.");
  const [sending, setSending] = useState(false);
  const isOwner = role === "owner";

  useEffect(() => {
    void (async () => {
      const [{ data }, credentials] = await Promise.all([
        supabase.from("business_settings").select("key,value").eq("business_id", businessId).in("key", ["whatsapp_provider", "auto_reminder"]),
        fetch("/api/whatsapp/settings", { cache: "no-store" }).then(async (r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      for (const row of data ?? []) {
        if (row.key === "whatsapp_provider") setProvider(String((row.value as Record<string, unknown>)?.provider ?? "manual") as Provider);
        if (row.key === "auto_reminder") setAutoReminder(Boolean((row.value as Record<string, unknown>)?.enabled));
      }
      if (credentials) {
        if (credentials.provider) setProvider(credentials.provider as Provider);
        setTokenConfigured(Boolean(credentials.configured));
        setMaskedToken(String(credentials.maskedToken ?? ""));
      }
    })();
  }, [businessId, supabase]);

  async function save() {
    if (!isOwner) return;
    setSending(true);
    setMsg("");
    try {
      const enabled = provider !== "manual" && autoReminder;
      const settings = await supabase.from("business_settings").upsert(
        [
          { business_id: businessId, key: "whatsapp_provider", value: { provider } },
          { business_id: businessId, key: "auto_reminder", value: { enabled } },
        ],
        { onConflict: "business_id,key" },
      );
      if (settings.error) throw settings.error;

      const credentialRes = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, token }),
      });
      const credentialData = await credentialRes.json().catch(() => ({}));
      if (!credentialRes.ok) throw new Error(String(credentialData.error ?? "Gagal menyimpan token WhatsApp."));

      setAutoReminder(enabled);
      setToken("");
      setTokenConfigured(Boolean(credentialData.configured));
      setMaskedToken(String(credentialData.maskedToken ?? ""));
      setMsg("Pengaturan WhatsApp dan token tersimpan.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menyimpan pengaturan WhatsApp");
    } finally {
      setSending(false);
    }
  }

  async function clearToken() {
    if (!isOwner) return;
    setSending(true);
    setMsg("");
    try {
      const res = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "manual", clearToken: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data.error ?? "Gagal menghapus token."));
      setToken(""); setTokenConfigured(false); setMaskedToken(""); setProvider("manual"); setAutoReminder(false);
      await supabase.from("business_settings").upsert([
        { business_id: businessId, key: "whatsapp_provider", value: { provider: "manual" } },
        { business_id: businessId, key: "auto_reminder", value: { enabled: false } },
      ], { onConflict: "business_id,key" });
      setMsg("Token WhatsApp dihapus. Provider kembali ke manual.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menghapus token");
    } finally { setSending(false); }
  }

  async function runRemindersNow() {
    if (!isOwner || provider === "manual") return;
    setSending(true); setMsg("");
    try {
      const res = await fetch("/api/reminders/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menjalankan reminder");
      setMsg(`Reminder diproses: ${Number(data.sent ?? 0)} terkirim, ${Number(data.failed ?? 0)} gagal, ${Number(data.skipped ?? 0)} dilewati.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Gagal menjalankan reminder"); }
    finally { setSending(false); }
  }

  async function testGateway() {
    setSending(true); setMsg("");
    try {
      if (isOwner) {
        const enabled = provider !== "manual" && autoReminder;
        const settings = await supabase.from("business_settings").upsert([
          { business_id: businessId, key: "whatsapp_provider", value: { provider } },
          { business_id: businessId, key: "auto_reminder", value: { enabled } },
        ], { onConflict: "business_id,key" });
        if (settings.error) throw settings.error;
        if (token.trim()) {
          const credentialRes = await fetch("/api/whatsapp/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, token: token.trim() }) });
          const credentialData = await credentialRes.json().catch(() => ({}));
          if (!credentialRes.ok) throw new Error(String(credentialData.error ?? "Gagal menyimpan token."));
          setToken(""); setTokenConfigured(Boolean(credentialData.configured)); setMaskedToken(String(credentialData.maskedToken ?? ""));
        }
      }
      const res = await fetch("/api/whatsapp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, destination: testNumber || businessWhatsapp, message: testMessage, eventKey: "gateway_test" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim");
      if (data.manualUrl) { window.open(data.manualUrl, "_blank", "noopener,noreferrer"); setMsg("Mode manual dibuka di WhatsApp."); }
      else setMsg(`Pesan test terkirim via ${data.provider}.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Gagal test WhatsApp"); }
    finally { setSending(false); }
  }

  const phone = normalizeWhatsApp(businessWhatsapp);
  const tokenLabel = provider === "starsender" ? "Starsender API Key" : "Fonnte Token";

  return (
    <>
      <ModuleHeader title="Integrasi WhatsApp" subtitle="Masukkan token langsung dari aplikasi. Tidak perlu mengisi token di Vercel atau Supabase Secrets." />
      {msg ? <Notice kind={msg.includes("tersimpan") || msg.includes("terkirim") || msg.includes("dihapus") ? "success" : "error"}>{msg}</Notice> : null}
      <section className="formPanel">
        <h2>Provider & Kredensial</h2>
        <div className="segmented">
          {(["manual", "fonnte", "starsender"] as Provider[]).map((p) => (
            <button type="button" key={p} className={provider === p ? "active" : ""} onClick={() => { setProvider(p); if (p === "manual") setAutoReminder(false); }}>{p}</button>
          ))}
        </div>
        {provider !== "manual" ? (
          <>
            <label className="formField" style={{ display: "block", marginTop: 14 }}>
              <span>{tokenLabel}</span>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={tokenConfigured ? `Token tersimpan: ${maskedToken} — isi hanya jika ingin mengganti` : `Masukkan ${tokenLabel}`} autoComplete="new-password" />
            </label>
            {tokenConfigured ? <Notice kind="success">Token sudah tersimpan aman di database aplikasi. Nilai token tidak ditampilkan kembali.</Notice> : <Notice kind="info">Token hanya bisa dikelola Owner dan tidak dibaca langsung oleh browser.</Notice>}
          </>
        ) : (
          <Notice kind="info">Tanpa gateway: jatuh tempo tetap dipantau di Dashboard/Piutang. Tombol Tagih membuka WhatsApp dengan pesan siap kirim, tetapi tidak dikirim otomatis.</Notice>
        )}
        {provider !== "manual" ? <label className="checkboxField" style={{ marginTop: 12 }}><input type="checkbox" checked={autoReminder} disabled={!isOwner} onChange={(e) => setAutoReminder(e.target.checked)} /> Auto kirim reminder WhatsApp</label> : null}
        {isOwner ? <div style={{ display: "flex", gap: 10, marginTop: 14 }}><button className="primaryAction" style={{ flex: 1, height: 44, borderRadius: 11 }} onClick={() => void save()} disabled={sending}>{sending ? "Menyimpan..." : "Simpan Pengaturan"}</button>{tokenConfigured ? <button type="button" className="secondaryAction" onClick={() => void clearToken()} disabled={sending}>Hapus Token</button> : null}</div> : null}
      </section>
      {isOwner && provider !== "manual" ? (
        <section className="formPanel">
          <h2>Reminder Otomatis</h2>
          <Notice kind="info">H-1, hari H, dan terlambat 1/3/7 hari. Pastikan token sudah tersimpan dan Auto Reminder aktif.</Notice>
          <button className="primaryAction" style={{ width: "100%", height: 44, borderRadius: 11, marginTop: 12 }} onClick={() => void runRemindersNow()} disabled={sending || !autoReminder || !tokenConfigured}>{sending ? "Memproses..." : "Jalankan Reminder Sekarang"}</button>
        </section>
      ) : null}
      <section className="formPanel">
        <h2>Test Pengiriman</h2>
        <div className="fieldGrid">
          <label className="formField">Nomor Tujuan<input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder={businessWhatsapp || "08xxxxxxxxxx"} /></label>
          <label className="formField full">Pesan<textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} /></label>
        </div>
        <button className="primaryAction" style={{ width: "100%", height: 44, borderRadius: 11, marginTop: 12 }} onClick={() => void testGateway()} disabled={sending}>{sending ? "Mengirim..." : provider === "manual" ? "Test via WhatsApp Manual" : `Test ${provider}`}</button>
        {provider === "manual" && !phone && !testNumber ? <Notice kind="info">Isi nomor tujuan test atau nomor WhatsApp usaha.</Notice> : null}
      </section>
      <div className="quickLinks">
        <Link className="quickLink" href="/message-templates"><strong>Template Pesan</strong><small>CRUD pesan invoice, reminder, pembayaran</small></Link>
        <Link className="quickLink" href="/receivables"><strong>Tagih Piutang</strong><small>Reminder visual selalu aktif + WhatsApp manual</small></Link>
      </div>
    </>
  );
}
