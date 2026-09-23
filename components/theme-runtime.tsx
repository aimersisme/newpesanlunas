"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { applyThemeToDocument, readStoredTheme } from "@/lib/theme-client";
import { normalizeThemeSettings, THEME_SETTING_KEY, type ThemeSettings } from "@/lib/themes";

export function ThemeRuntime() {
  useEffect(() => {
    applyThemeToDocument(readStoredTheme());

    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<ThemeSettings>).detail;
      if (detail) applyThemeToDocument(detail, true);
    };
    window.addEventListener("pesanlunas:theme-changed", onTheme);

    let cancelled = false;
    const sync = async () => {
      if (sessionStorage.getItem("pesanlunas.theme.synced") === "1") return;
      sessionStorage.setItem("pesanlunas.theme.synced", "1");
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session || cancelled) return;
      const { data: membership } = await supabase
        .from("business_members")
        .select("business_id")
        .eq("user_id", sessionData.session.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!membership?.business_id || cancelled) return;
      const { data: setting } = await supabase
        .from("business_settings")
        .select("value")
        .eq("business_id", membership.business_id)
        .eq("key", THEME_SETTING_KEY)
        .maybeSingle();
      if (setting?.value && !cancelled) applyThemeToDocument(normalizeThemeSettings(setting.value), true);
    };

    const timer = window.setTimeout(() => { void sync(); }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("pesanlunas:theme-changed", onTheme);
    };
  }, []);

  return null;
}
