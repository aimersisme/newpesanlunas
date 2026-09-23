"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("PesanLunas runtime error", error);
  }, [error]);

  return (
    <main className="authStage">
      <section className="authCard">
        <div className="authIntro">
          <h1>PesanLunas belum bisa membuka halaman ini</h1>
          <p>Bukan data Anda yang hilang. Aplikasi menangkap error runtime agar tidak berhenti di layar putih.</p>
        </div>
        {error.digest && <div className="formMessage">Kode error: {error.digest}</div>}
        <div className="formStack">
          <button className="primaryButton" onClick={() => reset()}>Coba Lagi</button>
          <a className="secondaryButton" href="/setup">Cek Konfigurasi</a>
          <a className="secondaryButton" href="/api/diagnostics">Diagnostik Runtime</a>
          <a className="secondaryButton" href="/api/health">Health Check</a>
        </div>
      </section>
    </main>
  );
}
