import Link from "next/link";
import { Brand } from "@/components/brand";
import {
  getMissingSupabaseEnvNames,
  readSupabasePublicConfig,
} from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const config = readSupabasePublicConfig();
  const missing = getMissingSupabaseEnvNames();

  return (
    <main className="authStage">
      <section className="authCard setupCard">
        <Brand showTagline />
        <div className="authIntro">
          <h1>{config ? "Konfigurasi Supabase terdeteksi" : "Supabase belum dikonfigurasi"}</h1>
          <p>
            PesanLunas membutuhkan Project URL dan Publishable/Anon Key Supabase pada Environment Variables Vercel.
          </p>
        </div>

        {!config ? (
          <div className="setupChecklist">
            <strong>Yang perlu diisi di Vercel:</strong>
            <ul>
              {missing.map((name) => <li key={name}><code>{name}</code></li>)}
            </ul>
            <p className="muted">
              Terapkan untuk Production, Preview, dan Development jika ingin semua environment bekerja, lalu Redeploy deployment terbaru.
            </p>
          </div>
        ) : (
          <div className="setupChecklist successBox">
            <strong>Environment utama sudah terbaca.</strong>
            <p className="muted">Lanjutkan ke login. Jika masih ada masalah koneksi, buka endpoint Health Check di bawah.</p>
          </div>
        )}

        <div className="formStack">
          <Link className="primaryButton" href="/auth/login">Buka Login</Link>
          <Link className="secondaryButton" href="/api/health">Buka Health Check</Link>
        </div>
      </section>
    </main>
  );
}
