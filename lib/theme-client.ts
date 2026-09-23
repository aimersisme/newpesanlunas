import { DEFAULT_THEME, getThemePreset, normalizeThemeSettings, THEME_STORAGE_KEY, type ThemeSettings } from "@/lib/themes";

const customVars = ["--brand", "--brand-2", "--brand-soft", "--brand-shadow", "--bg", "--card", "--ink", "--stage-bg", "--phone-bg", "--nav-bg", "--radius-panel", "--radius-control", "--shadow"] as const;

function safeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

export function applyThemeToDocument(input: ThemeSettings, persist = false) {
  if (typeof document === "undefined") return;
  const settings = normalizeThemeSettings(input);
  const root = document.documentElement;
  const preset = getThemePreset(settings.preset);

  root.dataset.theme = preset.id;
  root.dataset.themeDesign = preset.design;
  customVars.forEach((name) => root.style.removeProperty(name));

  const custom = settings.custom ?? {};
  const brand = safeColor(custom.brand);
  const accent = safeColor(custom.accent);
  const background = safeColor(custom.background);
  const card = safeColor(custom.card);
  const ink = safeColor(custom.ink);
  if (brand) { root.style.setProperty("--brand", brand); root.style.setProperty("--brand-soft", `${brand}22`); root.style.setProperty("--brand-shadow", `0 10px 24px ${brand}38`); }
  if (accent) root.style.setProperty("--brand-2", accent);
  if (background) { root.style.setProperty("--bg", background); root.style.setProperty("--stage-bg", background); }
  if (card) { root.style.setProperty("--card", card); root.style.setProperty("--phone-bg", card); root.style.setProperty("--nav-bg", card); }
  if (ink) root.style.setProperty("--ink", ink);

  if (custom.radius === "soft") {
    root.style.setProperty("--radius-panel", "22px");
    root.style.setProperty("--radius-control", "14px");
  } else if (custom.radius === "sharp") {
    root.style.setProperty("--radius-panel", "10px");
    root.style.setProperty("--radius-control", "8px");
  }

  if (custom.shadow === "floating") root.style.setProperty("--shadow", "0 18px 42px rgba(17, 24, 39, .14)");
  else if (custom.shadow === "flat") root.style.setProperty("--shadow", "none");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", brand ?? preset.preview[0]);

  if (persist && typeof localStorage !== "undefined") localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
}

export function readStoredTheme(): ThemeSettings {
  if (typeof localStorage === "undefined") return { preset: DEFAULT_THEME };
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw ? normalizeThemeSettings(JSON.parse(raw)) : { preset: DEFAULT_THEME };
  } catch {
    return { preset: DEFAULT_THEME };
  }
}

export function announceTheme(settings: ThemeSettings) {
  applyThemeToDocument(settings, true);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pesanlunas:theme-changed", { detail: settings }));
}
