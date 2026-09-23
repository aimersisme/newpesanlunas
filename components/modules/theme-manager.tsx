"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Palette, RotateCcw, Save, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { ModuleHeader, Notice } from "@/components/crud-ui";
import { announceTheme, applyThemeToDocument } from "@/lib/theme-client";
import {
  DEFAULT_THEME,
  getThemePreset,
  normalizeThemeSettings,
  THEME_PRESETS,
  THEME_SETTING_KEY,
  type ThemeCustom,
  type ThemePresetId,
  type ThemeSettings,
} from "@/lib/themes";

const cleanHex = (value: string, fallback: string) => /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

function defaultsForPreset(id: ThemePresetId): ThemeCustom {
  const preset = getThemePreset(id);
  return {
    brand: preset.preview[0],
    accent: preset.preview[0],
    background: preset.preview[1],
    card: preset.preview[2],
    ink: preset.preview[3],
    radius: preset.design === "executive" || preset.design === "minimal" ? "sharp" : preset.design === "glass" || preset.design === "elegant" ? "soft" : "balanced",
    shadow: preset.design === "minimal" ? "flat" : preset.design === "glass" || preset.design === "dark" ? "floating" : "soft",
  };
}

export function ThemeManager({ businessId, role }: { businessId: string; role: string }) {
  const supabase = useMemo(() => createClient(), []);
  const canEdit = role === "owner";
  const [saved, setSaved] = useState<ThemeSettings>({ preset: DEFAULT_THEME });
  const [selected, setSelected] = useState<ThemePresetId>(DEFAULT_THEME);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [custom, setCustom] = useState<ThemeCustom>(defaultsForPreset(DEFAULT_THEME));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const committedRef = useRef<ThemeSettings>({ preset: DEFAULT_THEME });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("value")
        .eq("business_id", businessId)
        .eq("key", THEME_SETTING_KEY)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setMessage({ kind: "error", text: error.message });
        setLoading(false);
        return;
      }
      const settings = normalizeThemeSettings(data?.value);
      setSaved(settings);
      committedRef.current = settings;
      setSelected(settings.preset);
      setCustomEnabled(Boolean(settings.custom));
      setCustom(settings.custom ? { ...defaultsForPreset(settings.preset), ...settings.custom } : defaultsForPreset(settings.preset));
      applyThemeToDocument(settings, true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [businessId, supabase]);

  useEffect(() => {
    return () => {
      applyThemeToDocument(committedRef.current, true);
    };
  }, []);

  function preview(preset: ThemePresetId, nextCustomEnabled = customEnabled, nextCustom = custom) {
    setSelected(preset);
    const settings: ThemeSettings = { preset, custom: nextCustomEnabled ? nextCustom : undefined };
    applyThemeToDocument(settings);
    setMessage({ kind: "info", text: `Preview ${getThemePreset(preset).name} aktif. Belum disimpan.` });
  }

  function choosePreset(preset: ThemePresetId) {
    const nextCustom = customEnabled ? defaultsForPreset(preset) : custom;
    if (customEnabled) setCustom(nextCustom);
    preview(preset, customEnabled, nextCustom);
  }

  function updateCustom<K extends keyof ThemeCustom>(key: K, value: ThemeCustom[K]) {
    const next = { ...custom, [key]: value };
    setCustom(next);
    applyThemeToDocument({ preset: selected, custom: next });
  }

  function toggleCustom(enabled: boolean) {
    setCustomEnabled(enabled);
    const nextCustom = enabled ? { ...defaultsForPreset(selected), ...custom } : custom;
    if (enabled) setCustom(nextCustom);
    applyThemeToDocument({ preset: selected, custom: enabled ? nextCustom : undefined });
  }

  async function saveTheme() {
    if (!canEdit) {
      setMessage({ kind: "error", text: "Hanya Owner yang dapat menyimpan tema usaha." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const settings: ThemeSettings = {
      preset: selected,
      custom: customEnabled ? {
        brand: cleanHex(custom.brand ?? "", getThemePreset(selected).preview[0]),
        accent: cleanHex(custom.accent ?? "", getThemePreset(selected).preview[0]),
        background: cleanHex(custom.background ?? "", getThemePreset(selected).preview[1]),
        card: cleanHex(custom.card ?? "", getThemePreset(selected).preview[2]),
        ink: cleanHex(custom.ink ?? "", getThemePreset(selected).preview[3]),
        radius: custom.radius ?? "balanced",
        shadow: custom.shadow ?? "soft",
      } : undefined,
    };
    const { error } = await supabase.from("business_settings").upsert({
      business_id: businessId,
      key: THEME_SETTING_KEY,
      value: settings,
    }, { onConflict: "business_id,key" });
    setSaving(false);
    if (error) {
      setMessage({ kind: "error", text: error.message });
      return;
    }
    setSaved(settings);
    committedRef.current = settings;
    announceTheme(settings);
    setMessage({ kind: "success", text: `${getThemePreset(settings.preset).name} diterapkan untuk PesanLunas.` });
  }

  function resetPreview() {
    setSelected(saved.preset);
    setCustomEnabled(Boolean(saved.custom));
    setCustom(saved.custom ? { ...defaultsForPreset(saved.preset), ...saved.custom } : defaultsForPreset(saved.preset));
    applyThemeToDocument(saved, true);
    setMessage({ kind: "info", text: "Preview dikembalikan ke tema yang tersimpan." });
  }

  return <>
    <ModuleHeader title="Tampilan & Tema" subtitle="10 tema berbeda + Custom Brand, tanpa mengubah fitur aplikasi" />
    {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}

    <section className="themeIntroPanel">
      <div className="themeIntroIcon"><Palette size={22} /></div>
      <div><strong>Ganti nuansa seluruh aplikasi</strong><p>Warna, card, tombol, radius, shadow, navbar, dashboard, dan form ikut menyesuaikan. Preview tidak tersimpan sampai Owner menekan Terapkan Tema.</p></div>
      <span className="themeCountBadge">10 Preset</span>
    </section>

    {loading ? <div className="themeLoading">Memuat tema usaha...</div> : <>
      <div className="themeGrid">
        {THEME_PRESETS.map((theme) => {
          const active = selected === theme.id;
          const savedTheme = saved.preset === theme.id;
          return <button type="button" className={`themeCard theme-${theme.design} ${active ? "selected" : ""}`} onClick={() => choosePreset(theme.id)} key={theme.id}>
            <div className="themePreview" style={{ background: theme.preview[2] }}>
              <div className="themePreviewTop" style={{ background: theme.preview[0] }} />
              <div className="themePreviewBody">
                <i style={{ background: theme.preview[1] }} />
                <i style={{ background: theme.preview[1] }} />
                <i style={{ background: theme.preview[0] }} />
              </div>
              <div className="themePreviewNav" style={{ borderColor: theme.preview[1] }}><b style={{ background: theme.preview[0] }} /><b /><b /><b /></div>
            </div>
            <div className="themeCardCopy">
              <div className="themeCardTitle"><strong>{theme.name}</strong>{savedTheme ? <span className="savedThemeBadge"><Check size={11}/> Aktif</span> : null}</div>
              <small>{theme.mood}</small>
              <p>{theme.description}</p>
            </div>
            <span className="themePreviewAction"><Eye size={13}/> Preview</span>
          </button>;
        })}
      </div>

      <section className="customBrandPanel">
        <div className="customBrandHead">
          <div><span className="eyebrow"><Sparkles size={14}/> White-label</span><h2>Custom Brand</h2><p>Mulai dari preset, lalu sesuaikan warna dan karakter UI sesuai brand pembeli.</p></div>
          <label className="themeSwitch"><input type="checkbox" checked={customEnabled} onChange={(e) => toggleCustom(e.target.checked)} disabled={!canEdit}/><span /></label>
        </div>
        {customEnabled ? <div className="customThemeGrid">
          <label>Warna Utama<input type="color" value={custom.brand ?? "#07864f"} onChange={(e) => updateCustom("brand", e.target.value)} disabled={!canEdit}/><code>{custom.brand}</code></label>
          <label>Warna Aksen<input type="color" value={custom.accent ?? "#0aa866"} onChange={(e) => updateCustom("accent", e.target.value)} disabled={!canEdit}/><code>{custom.accent}</code></label>
          <label>Background<input type="color" value={custom.background ?? "#f4f6f3"} onChange={(e) => updateCustom("background", e.target.value)} disabled={!canEdit}/><code>{custom.background}</code></label>
          <label>Warna Card<input type="color" value={custom.card ?? "#ffffff"} onChange={(e) => updateCustom("card", e.target.value)} disabled={!canEdit}/><code>{custom.card}</code></label>
          <label>Warna Teks<input type="color" value={custom.ink ?? "#10182f"} onChange={(e) => updateCustom("ink", e.target.value)} disabled={!canEdit}/><code>{custom.ink}</code></label>
          <label>Model Sudut<select value={custom.radius ?? "balanced"} onChange={(e) => updateCustom("radius", e.target.value as ThemeCustom["radius"])} disabled={!canEdit}><option value="soft">Soft / Bulat</option><option value="balanced">Balanced</option><option value="sharp">Tegas</option></select></label>
          <label>Model Shadow<select value={custom.shadow ?? "soft"} onChange={(e) => updateCustom("shadow", e.target.value as ThemeCustom["shadow"])} disabled={!canEdit}><option value="floating">Floating</option><option value="soft">Soft</option><option value="flat">Flat</option></select></label>
        </div> : <div className="customBrandOff">Aktifkan Custom Brand jika ingin mengubah warna preset secara manual.</div>}
      </section>

      <div className="themeStickyActions">
        <button type="button" className="secondaryAction themeActionButton" onClick={resetPreview}><RotateCcw size={16}/> Kembalikan</button>
        <button type="button" className="primaryAction themeActionButton" onClick={saveTheme} disabled={saving || !canEdit}><Save size={16}/>{saving ? "Menyimpan..." : "Terapkan Tema"}</button>
      </div>
      {!canEdit ? <Notice kind="info">Role Anda dapat melihat dan mencoba preview, tetapi hanya Owner yang dapat menyimpan tema.</Notice> : null}
    </>}
  </>;
}
