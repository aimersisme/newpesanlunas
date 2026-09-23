"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/brand";

const templates = [
  ["catering", "Katering & Kue", "Kue, snack box, katering acara"],
  ["printing", "Percetakan", "Banner, undangan, merchandise"],
  ["convection", "Konveksi & Jahit", "Kaos, seragam, bordir"],
  ["workshop", "Bengkel & Service", "Servis kendaraan/peralatan"],
  ["supplier", "Supplier & Distributor", "PO, termin, pengiriman"],
  ["service", "Jasa Umum", "Jasa berbasis jadwal/deadline"],
  ["blank", "Template Kosong", "Atur field sendiri nanti"],
] as const;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("catering");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const slug = useMemo(() => slugify(name), [name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slug) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("create_business", {
      p_name: name.trim(),
      p_slug: slug,
      p_template_slug: template,
    });
    if (error) {
      setError(error.message.includes("duplicate") ? "Nama/slug usaha sudah dipakai. Coba nama lain." : error.message);
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="onboardingStage">
      <section className="onboardingCard">
        <Brand showTagline />
        <div className="stepBadge">Langkah 1 dari 1</div>
        <h1>Siapkan usaha Anda</h1>
        <p className="muted">Pilih jenis usaha. PesanLunas otomatis menyiapkan field order yang relevan dan masih bisa Anda ubah nanti.</p>
        <form onSubmit={submit} className="formStack onboardingForm">
          <label>Nama Usaha<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Dapur Rina" /></label>
          <div className="slugPreview">Alamat internal: <strong>{slug || "nama-usaha"}</strong></div>
          <fieldset className="templateGrid">
            <legend>Jenis usaha</legend>
            {templates.map(([value, title, text]) => (
              <label className={`templateChoice ${template === value ? "selected" : ""}`} key={value}>
                <input type="radio" name="template" value={value} checked={template === value} onChange={() => setTemplate(value)} />
                <span><strong>{title}</strong><small>{text}</small></span>
              </label>
            ))}
          </fieldset>
          {error && <div className="formMessage">{error}</div>}
          <button className="primaryButton" disabled={loading}>{loading ? "Menyiapkan usaha..." : "Buat Usaha & Masuk Dashboard"}</button>
        </form>
      </section>
    </main>
  );
}
