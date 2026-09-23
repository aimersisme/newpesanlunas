"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="id">
      <body>
        <main style={{fontFamily:"system-ui,sans-serif",padding:24,maxWidth:680,margin:"80px auto"}}>
          <h1>PesanLunas mengalami error runtime</h1>
          <p>Periksa konfigurasi Supabase di Vercel lalu buka <a href="/api/health">/api/health</a>.</p>
          {error.digest ? <p>Kode error: <strong>{error.digest}</strong></p> : null}
          <p><a href="/setup">Buka halaman konfigurasi</a></p>
        </main>
      </body>
    </html>
  );
}
