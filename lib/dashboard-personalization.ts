export const DEFAULT_DASHBOARD_QUOTES = [
  "Arus kas yang sehat dimulai dari catatan yang rapi.",
  "Order boleh banyak, piutang jangan sampai terlupakan.",
  "Catat hari ini, evaluasi besok, tumbuh setiap hari.",
  "Tagihan yang dipantau lebih cepat berubah menjadi pembayaran.",
  "Bisnis rapi membuat keputusan terasa lebih ringan.",
  "Jangan hanya mengejar penjualan—jaga juga uang yang benar-benar masuk.",
  "Pelanggan puas, pencatatan rapi, bisnis lebih siap naik kelas.",
  "Setiap order yang tercatat adalah langkah menuju bisnis yang lebih terukur.",
  "Keuntungan yang baik dimulai dari harga dan pencatatan yang jelas.",
  "Konsisten melayani, disiplin mencatat, dan berani bertumbuh.",
] as const;

export type DashboardMotivationSetting = {
  enabled: boolean;
  quotes: string[];
};

export function normalizeDashboardMotivation(value: unknown): DashboardMotivationSetting {
  const fallback: DashboardMotivationSetting = {
    enabled: true,
    quotes: [...DEFAULT_DASHBOARD_QUOTES],
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const row = value as Record<string, unknown>;
  const rawQuotes = Array.isArray(row.quotes) ? row.quotes : [];
  const quotes = rawQuotes
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
  return {
    enabled: row.enabled !== false,
    quotes: quotes.length ? quotes : fallback.quotes,
  };
}

export function pickRandomQuote(quotes: string[]) {
  if (!quotes.length) return DEFAULT_DASHBOARD_QUOTES[0];
  return quotes[Math.floor(Math.random() * quotes.length)] ?? quotes[0];
}
