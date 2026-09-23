"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Shuffle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { FormActions, ModuleHeader, Notice } from "@/components/crud-ui";
import {
  DEFAULT_DASHBOARD_QUOTES,
  normalizeDashboardMotivation,
} from "@/lib/dashboard-personalization";

type F = {
  name: string;
  address: string;
  whatsapp: string;
  email: string;
  timezone: string;
  currency: string;
  invoice_prefix: string;
  order_prefix: string;
  sku_prefix: string;
};

const empty: F = {
  name: "",
  address: "",
  whatsapp: "",
  email: "",
  timezone: "Asia/Jakarta",
  currency: "IDR",
  invoice_prefix: "INV",
  order_prefix: "ORD",
  sku_prefix: "SKU",
};

const cleanPrefix = (value: string, fallback: string) =>
  value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12) || fallback;

export function BusinessSettingsManager({ businessId, role }: { businessId: string; role: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<F>(empty);
  const [provider, setProvider] = useState("manual");
  const [autoReminder, setAutoReminder] = useState(false);
  const [motivationEnabled, setMotivationEnabled] = useState(true);
  const [quotes, setQuotes] = useState<string[]>([...DEFAULT_DASHBOARD_QUOTES]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const canOwner = role === "owner";

  useEffect(() => {
    void (async () => {
      const [{ data: b }, { data: s }] = await Promise.all([
        supabase
          .from("businesses")
          .select("name,address,whatsapp,email,timezone,currency,invoice_prefix,order_prefix,sku_prefix")
          .eq("id", businessId)
          .single(),
        supabase
          .from("business_settings")
          .select("key,value")
          .eq("business_id", businessId)
          .in("key", ["whatsapp_provider", "auto_reminder", "dashboard_motivation"]),
      ]);

      if (b) {
        setForm({
          name: b.name,
          address: b.address ?? "",
          whatsapp: b.whatsapp ?? "",
          email: b.email ?? "",
          timezone: b.timezone ?? "Asia/Jakarta",
          currency: b.currency ?? "IDR",
          invoice_prefix: b.invoice_prefix ?? "INV",
          order_prefix: b.order_prefix ?? "ORD",
          sku_prefix: b.sku_prefix ?? "SKU",
        });
      }

      for (const row of s ?? []) {
        if (row.key === "whatsapp_provider") {
          setProvider(String((row.value as Record<string, unknown>)?.provider ?? "manual"));
        }
        if (row.key === "auto_reminder") {
          setAutoReminder(Boolean((row.value as Record<string, unknown>)?.enabled));
        }
        if (row.key === "dashboard_motivation") {
          const parsed = normalizeDashboardMotivation(row.value);
          setMotivationEnabled(parsed.enabled);
          setQuotes(parsed.quotes);
        }
      }
    })();
  }, [businessId, supabase]);

  function updateQuote(index: number, value: string) {
    setQuotes((current) => current.map((quote, i) => (i === index ? value : quote)));
  }

  function addQuote() {
    setQuotes((current) => (current.length >= 20 ? current : [...current, ""]));
  }

  function removeQuote(index: number) {
    setQuotes((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length ? next : [""];
    });
  }

  function resetQuotes() {
    setQuotes([...DEFAULT_DASHBOARD_QUOTES]);
    setMotivationEnabled(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canOwner) {
      setMsg({ kind: "error", text: "Hanya owner yang dapat mengubah pengaturan usaha." });
      return;
    }

    const cleanedQuotes = quotes.map((quote) => quote.trim()).filter(Boolean).slice(0, 20);
    if (motivationEnabled && cleanedQuotes.length === 0) {
      setMsg({ kind: "error", text: "Isi minimal satu quote motivasi atau nonaktifkan quote dashboard." });
      return;
    }

    setSaving(true);
    setMsg(null);
    const skuPrefix = cleanPrefix(form.sku_prefix, "SKU");
    const { error } = await supabase
      .from("businesses")
      .update({
        ...form,
        name: form.name.trim(),
        address: form.address.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        invoice_prefix: cleanPrefix(form.invoice_prefix, "INV"),
        order_prefix: cleanPrefix(form.order_prefix, "ORD"),
        sku_prefix: skuPrefix,
      })
      .eq("id", businessId);

    if (!error) {
      const settings = await supabase.from("business_settings").upsert(
        [
          { business_id: businessId, key: "whatsapp_provider", value: { provider } },
          { business_id: businessId, key: "auto_reminder", value: { enabled: provider !== "manual" && autoReminder } },
          {
            business_id: businessId,
            key: "dashboard_motivation",
            value: { enabled: motivationEnabled, quotes: cleanedQuotes },
          },
        ],
        { onConflict: "business_id,key" },
      );
      if (settings.error) {
        setSaving(false);
        setMsg({ kind: "error", text: settings.error.message });
        return;
      }
    }

    setSaving(false);
    if (error) {
      setMsg({ kind: "error", text: error.message });
      return;
    }

    setForm((value) => ({ ...value, sku_prefix: skuPrefix }));
    if (cleanedQuotes.length) setQuotes(cleanedQuotes);
    setMsg({ kind: "success", text: "Pengaturan usaha dan quote dashboard tersimpan." });
  }

  return (
    <>
      <ModuleHeader
        title="Pengaturan Usaha"
        subtitle="Profil, sapaan dashboard, kode otomatis, nomor dokumen, dan preferensi integrasi"
      />
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <form className="formPanel" onSubmit={save}>
        <h2>Profil Usaha</h2>
        <div className="fieldGrid">
          <label className="formField full">
            Nama Usaha
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="formField full">
            Alamat
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <label className="formField">
            WhatsApp
            <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </label>
          <label className="formField">
            Email
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
        </div>

        <div className="settingsSectionHead">
          <div>
            <h2>Sapaan & Quote Dashboard</h2>
            <p>Nama mengikuti akun yang sedang login. Quote dipilih acak setiap kali Dashboard dibuka.</p>
          </div>
          <span className="settingsFeatureIcon"><Shuffle size={17} /></span>
        </div>
        <label className="checkboxField motivationToggle">
          <input
            type="checkbox"
            checked={motivationEnabled}
            onChange={(e) => setMotivationEnabled(e.target.checked)}
          />
          Tampilkan quote motivasi di bawah sapaan
        </label>
        <div className="quoteEditorList">
          {quotes.map((quote, index) => (
            <div className="quoteEditorRow" key={`quote-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <textarea
                value={quote}
                maxLength={180}
                onChange={(e) => updateQuote(index, e.target.value)}
                placeholder={`Quote motivasi ${index + 1}`}
                disabled={!canOwner}
              />
              {canOwner ? (
                <button type="button" className="quoteDelete" onClick={() => removeQuote(index)} aria-label={`Hapus quote ${index + 1}`}>
                  <Trash2 size={16} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {canOwner ? (
          <div className="quoteEditorActions">
            <button type="button" className="miniButton primary" onClick={addQuote} disabled={quotes.length >= 20}>
              <Plus size={14} /> Tambah Quote
            </button>
            <button type="button" className="miniButton" onClick={resetQuotes}>Isi 10 Quote Bawaan</button>
            <small>{quotes.length}/20 quote</small>
          </div>
        ) : null}

        <h2 style={{ marginTop: 20 }}>Kode Otomatis</h2>
        <div className="fieldGrid">
          <label className="formField">
            Prefix SKU Produk/Jasa
            <input
              maxLength={12}
              value={form.sku_prefix}
              onChange={(e) => setForm({ ...form, sku_prefix: cleanPrefix(e.target.value, "") })}
              placeholder="SKU"
            />
            <span className="formHint">
              Contoh hasil: {cleanPrefix(form.sku_prefix, "SKU")}-000001. Nomor dibuat otomatis dan aman dari duplikat.
            </span>
          </label>
          <label className="formField">
            Prefix Order
            <input value={form.order_prefix} onChange={(e) => setForm({ ...form, order_prefix: e.target.value })} />
          </label>
          <label className="formField">
            Prefix Invoice
            <input value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} />
          </label>
          <label className="formField">
            Timezone
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </label>
          <label className="formField">
            Currency
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </label>
        </div>

        <h2 style={{ marginTop: 20 }}>WhatsApp</h2>
        <div className="fieldGrid">
          <label className="formField">
            Provider
            <select value={provider} onChange={(e) => { const next=e.target.value; setProvider(next); if(next==="manual") setAutoReminder(false); }}>
              <option value="manual">Manual wa.me</option>
              <option value="fonnte">Fonnte</option>
              <option value="starsender">Starsender</option>
            </select>
            <span className="formHint">Token provider tetap disimpan server-side, bukan di database.</span>
          </label>
          <label className="checkboxField">
            <input
              type="checkbox"
              checked={provider !== "manual" && autoReminder}
              disabled={provider === "manual"}
              onChange={(e) => setAutoReminder(e.target.checked)}
            />
            Auto kirim reminder WhatsApp
          </label>
          <div className="full">
            <Notice kind="info">
              Reminder jatuh tempo di Dashboard/Piutang selalu aktif. Pengiriman WhatsApp otomatis hanya berjalan jika Fonnte/Starsender dipilih, token gateway tersedia, dan Auto kirim reminder diaktifkan.
            </Notice>
          </div>
        </div>
        <FormActions saving={saving} submitLabel="Simpan Pengaturan" />
      </form>
      {!canOwner ? (
        <Notice kind="info">Role Anda hanya dapat melihat pengaturan. Perubahan profil usaha khusus owner.</Notice>
      ) : null}
    </>
  );
}
