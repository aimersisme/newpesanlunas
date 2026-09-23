"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ModuleHeader, Notice } from "@/components/crud-ui";
import { normalizeWhatsApp } from "@/lib/format";

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
  const [provider, setProvider] = useState("manual");
  const [autoReminder, setAutoReminder] = useState(false);
  const [msg, setMsg] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState("Test PesanLunas: integrasi WhatsApp aktif.");
  const [sending, setSending] = useState(false);
  const isOwner = role === "owner";

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("key,value")
        .eq("business_id", businessId)
        .in("key", ["whatsapp_provider", "auto_reminder"]);
      for (const row of data ?? []) {
        if (row.key === "whatsapp_provider") setProvider(String((row.value as Record<string, unknown>)?.provider ?? "manual"));
        if (row.key === "auto_reminder") setAutoReminder(Boolean((row.value as Record<string, unknown>)?.enabled));
      }
    })();
  }, [businessId, supabase]);

  async function save() {
    if (!isOwner) return;
    const enabled = provider !== "manual" && autoReminder;
    const { error } = await supabase.from("business_settings").upsert(
      [
        { business_id: businessId, key: "whatsapp_provider", value: { provider } },
        { business_id: businessId, key: "auto_reminder", value: { enabled } },
      ],
      { onConflict: "business_id,key" },
    );
    setAutoReminder(enabled);
    setMsg(error ? error.message : "Pengaturan WhatsApp tersimpan.");
  }

  async function runRemindersNow() {
    if (!isOwner || provider === "manual") return;
    setSending(true);
    setMsg("");
    try {
      const res = await fetch("/api/reminders/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menjalankan reminder");
      setMsg(`Reminder diproses: ${Number(data.sent ?? 0)} terkirim, ${Number(data.failed ?? 0)} gagal, ${Number(data.skipped ?? 0)} dilewati.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal menjalankan reminder");
    } finally {
      setSending(false);
    }
  }

  async function testGateway() {
    setSending(true);
    setMsg("");
    try {
      if (isOwner) {
        const enabled = provider !== "manual" && autoReminder;
        const saved = await supabase.from("business_settings").upsert(
          [
            { business_id: businessId, key: "whatsapp_provider", value: { provider } },
            { business_id: businessId, key: "auto_reminder", value: { enabled } },
          ],
          { onConflict: "business_id,key" },
        );
        if (saved.error) throw saved.error;
      }
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          destination: testNumber || businessWhatsapp,
          message: testMessage,
          eventKey: "gateway_test",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim");
      if (data.manualUrl) {
        window.open(data.manualUrl, "_blank", "noopener,noreferrer");
        setMsg("Mode manual dibuka di WhatsApp.");
      } else setMsg(`Pesan test terkirim via ${data.provider}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal test WhatsApp");
    } finally {
      setSending(false);
    }
  }

  const phone = normalizeWhatsApp(businessWhatsapp);
  return (
    <>
      <ModuleHeader title="Integrasi WhatsApp" subtitle="Reminder aplikasi selalu aktif; auto kirim WhatsApp memakai gateway opsional" />
      {msg ? <Notice kind={msg.includes("tersimpan") || msg.includes("terkirim") ? "success" : "error"}>{msg}</Notice> : null}
      <section className="formPanel">
        <h2>Provider Aktif</h2>
        <div className="segmented">
          {["manual", "fonnte", "starsender"].map((p) => (
            <button
              type="button"
              key={p}
              className={provider === p ? "active" : ""}
              onClick={() => {
                setProvider(p);
                if (p === "manual") setAutoReminder(false);
              }}
            >
              {p}
            </button>
          ))}
        </div>
        {provider === "manual" ? (
          <Notice kind="info">Tanpa gateway: jatuh tempo tetap dipantau di Dashboard/Piutang. Tombol Tagih membuka WhatsApp dengan pesan siap kirim, tetapi tidak dikirim otomatis.</Notice>
        ) : (
          <Notice kind="info">{provider} aktif. Token disimpan server-side/Edge Function. Jika Auto Reminder diaktifkan, reminder H-1, hari H, dan terlambat 1/3/7 hari dapat dikirim otomatis.</Notice>
        )}
        <label className="checkboxField" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={provider !== "manual" && autoReminder}
            disabled={provider === "manual" || !isOwner}
            onChange={(e) => setAutoReminder(e.target.checked)}
          />
          Auto kirim reminder WhatsApp
        </label>
        {isOwner ? <button className="primaryAction" style={{ width: "100%", height: 44, borderRadius: 11 }} onClick={() => void save()}>Simpan Pengaturan</button> : null}
      </section>
      {isOwner && provider !== "manual" ? (
        <section className="formPanel">
          <h2>Reminder Otomatis</h2>
          <Notice kind="info">Jalankan sekarang untuk menguji proses reminder pada invoice yang memang memenuhi jadwal. Hanya invoice yang belum lunas dan event-nya belum pernah terkirim yang diproses.</Notice>
          <button className="primaryAction" style={{ width: "100%", height: 44, borderRadius: 11, marginTop: 12 }} onClick={() => void runRemindersNow()} disabled={sending || !autoReminder}>
            {sending ? "Memproses..." : "Jalankan Reminder Sekarang"}
          </button>
          {!autoReminder ? <div className="muted" style={{ marginTop: 8 }}>Aktifkan Auto kirim reminder dan simpan pengaturan terlebih dahulu.</div> : null}
        </section>
      ) : null}
      <section className="formPanel">
        <h2>Test Pengiriman</h2>
        <div className="fieldGrid">
          <label className="formField">Nomor Tujuan<input value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder={businessWhatsapp || "08xxxxxxxxxx"} /></label>
          <label className="formField full">Pesan<textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} /></label>
        </div>
        <button className="primaryAction" style={{ width: "100%", height: 44, borderRadius: 11, marginTop: 12 }} onClick={() => void testGateway()} disabled={sending}>
          {sending ? "Mengirim..." : provider === "manual" ? "Test via WhatsApp Manual" : `Test ${provider}`}
        </button>
        {provider === "manual" && !phone && !testNumber ? <Notice kind="info">Isi nomor tujuan test atau nomor WhatsApp usaha.</Notice> : null}
      </section>
      <div className="quickLinks">
        <Link className="quickLink" href="/message-templates"><strong>Template Pesan</strong><small>CRUD pesan invoice, reminder, pembayaran</small></Link>
        <Link className="quickLink" href="/receivables"><strong>Tagih Piutang</strong><small>Reminder visual selalu aktif + WhatsApp manual</small></Link>
      </div>
    </>
  );
}
