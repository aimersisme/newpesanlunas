export type ThemePresetId =
  | "emerald_fresh"
  | "coral_bloom"
  | "navy_executive"
  | "mocha_cream"
  | "mint_sky"
  | "rose_sakura"
  | "terracotta_studio"
  | "mono_luxe"
  | "citrus_pop"
  | "midnight_glow";

export type ThemeDesign = "soft" | "glass" | "executive" | "warm" | "airy" | "elegant" | "natural" | "minimal" | "playful" | "dark";

export type ThemePreset = {
  id: ThemePresetId;
  name: string;
  description: string;
  mood: string;
  design: ThemeDesign;
  preview: [string, string, string, string];
};

export type ThemeCustom = {
  brand?: string;
  accent?: string;
  background?: string;
  card?: string;
  ink?: string;
  radius?: "soft" | "balanced" | "sharp";
  shadow?: "floating" | "soft" | "flat";
};

export type ThemeSettings = {
  preset: ThemePresetId;
  custom?: ThemeCustom;
};

export const DEFAULT_THEME: ThemePresetId = "emerald_fresh";
export const THEME_STORAGE_KEY = "pesanlunas.appearance";
export const THEME_SETTING_KEY = "appearance_theme";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "emerald_fresh",
    name: "Emerald Fresh",
    description: "Clean, segar, dan paling netral untuk berbagai UMKM.",
    mood: "Clean · Friendly",
    design: "soft",
    preview: ["#07864f", "#e4f7ee", "#ffffff", "#10182f"],
  },
  {
    id: "coral_bloom",
    name: "Coral Bloom",
    description: "Coral hangat dengan card lembut dan aksen peach.",
    mood: "Warm · Creative",
    design: "glass",
    preview: ["#e85d4f", "#fff0eb", "#fffaf7", "#321c24"],
  },
  {
    id: "navy_executive",
    name: "Navy Executive",
    description: "Tegas dan profesional untuk supplier, B2B, atau jasa.",
    mood: "Professional · Bold",
    design: "executive",
    preview: ["#173a67", "#e9eff7", "#ffffff", "#0f1d33"],
  },
  {
    id: "mocha_cream",
    name: "Mocha Cream",
    description: "Nuansa kopi, beige, dan ivory yang hangat dan premium.",
    mood: "Warm · Premium",
    design: "warm",
    preview: ["#805b42", "#f3e7d8", "#fffaf2", "#2b211a"],
  },
  {
    id: "mint_sky",
    name: "Mint Sky",
    description: "Ringan, airy, dan modern dengan mint serta cyan lembut.",
    mood: "Airy · Modern",
    design: "airy",
    preview: ["#159b88", "#e4faf5", "#f8fdff", "#102c36"],
  },
  {
    id: "rose_sakura",
    name: "Rose Sakura",
    description: "Rose blush elegan untuk beauty, fashion, florist, wedding.",
    mood: "Elegant · Soft",
    design: "elegant",
    preview: ["#b74b73", "#fdebf2", "#fffafd", "#321827"],
  },
  {
    id: "terracotta_studio",
    name: "Terracotta Studio",
    description: "Terracotta, sand, dan olive untuk nuansa natural artisan.",
    mood: "Natural · Crafted",
    design: "natural",
    preview: ["#a9543f", "#f7e7df", "#fffaf4", "#30211b"],
  },
  {
    id: "mono_luxe",
    name: "Mono Luxe",
    description: "Monokrom minimalis dengan kontras tegas dan tampilan premium.",
    mood: "Minimal · Luxe",
    design: "minimal",
    preview: ["#171717", "#ededed", "#ffffff", "#111111"],
  },
  {
    id: "citrus_pop",
    name: "Citrus Pop",
    description: "Orange citrus dan lime yang lebih playful untuk brand muda.",
    mood: "Playful · Energetic",
    design: "playful",
    preview: ["#e56f17", "#fff0d8", "#fffdf7", "#28200f"],
  },
  {
    id: "midnight_glow",
    name: "Midnight Glow",
    description: "Dark mode premium dengan navy gelap dan glow cyan-emerald.",
    mood: "Dark · Tech",
    design: "dark",
    preview: ["#24d29a", "#17352f", "#0d151c", "#eef8f5"],
  },
];

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === "string" && THEME_PRESETS.some((theme) => theme.id === value);
}

export function normalizeThemeSettings(value: unknown): ThemeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { preset: DEFAULT_THEME };
  const row = value as Record<string, unknown>;
  const preset = isThemePresetId(row.preset) ? row.preset : DEFAULT_THEME;
  const customRaw = row.custom;
  if (!customRaw || typeof customRaw !== "object" || Array.isArray(customRaw)) return { preset };
  const custom = customRaw as Record<string, unknown>;
  return {
    preset,
    custom: {
      brand: typeof custom.brand === "string" ? custom.brand : undefined,
      accent: typeof custom.accent === "string" ? custom.accent : undefined,
      background: typeof custom.background === "string" ? custom.background : undefined,
      card: typeof custom.card === "string" ? custom.card : undefined,
      ink: typeof custom.ink === "string" ? custom.ink : undefined,
      radius: custom.radius === "soft" || custom.radius === "balanced" || custom.radius === "sharp" ? custom.radius : undefined,
      shadow: custom.shadow === "floating" || custom.shadow === "soft" || custom.shadow === "flat" ? custom.shadow : undefined,
    },
  };
}

export function getThemePreset(id: ThemePresetId): ThemePreset {
  return THEME_PRESETS.find((theme) => theme.id === id) ?? THEME_PRESETS[0];
}
