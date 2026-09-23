import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/pwa-register";
import { ThemeRuntime } from "@/components/theme-runtime";

export const metadata: Metadata = {
  title: "PesanLunas",
  description: "Pesanan tercatat, tagihan cepat lunas.",
  applicationName: "PesanLunas",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-icon.png", type: "image/png", sizes: "512x512" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07864f",
};

const themeBootScript = `(()=>{try{const a=["emerald_fresh","coral_bloom","navy_executive","mocha_cream","mint_sky","rose_sakura","terracotta_studio","mono_luxe","citrus_pop","midnight_glow"];const r=localStorage.getItem("pesanlunas.appearance");if(!r)return;const s=JSON.parse(r);const d=document.documentElement;d.dataset.theme=a.includes(s?.preset)?s.preset:"emerald_fresh";const c=s?.custom||{};const ok=v=>typeof v==="string"&&/^#[0-9a-fA-F]{6}$/.test(v);if(ok(c.brand)){d.style.setProperty("--brand",c.brand);d.style.setProperty("--brand-soft",c.brand+"22");d.style.setProperty("--brand-shadow","0 10px 24px "+c.brand+"38")}if(ok(c.accent))d.style.setProperty("--brand-2",c.accent);if(ok(c.background)){d.style.setProperty("--bg",c.background);d.style.setProperty("--stage-bg",c.background)}if(ok(c.card)){d.style.setProperty("--card",c.card);d.style.setProperty("--phone-bg",c.card);d.style.setProperty("--nav-bg",c.card)}if(ok(c.ink))d.style.setProperty("--ink",c.ink);if(c.radius==="soft"){d.style.setProperty("--radius-panel","22px");d.style.setProperty("--radius-control","14px")}else if(c.radius==="sharp"){d.style.setProperty("--radius-panel","10px");d.style.setProperty("--radius-control","8px")}if(c.shadow==="floating")d.style.setProperty("--shadow","0 18px 42px rgba(17,24,39,.14)");else if(c.shadow==="flat")d.style.setProperty("--shadow","none")}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>
        <PWARegister />
        <ThemeRuntime />
        {children}
      </body>
    </html>
  );
}
