"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/brand";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || "").trim();
    const supabase = createClient();

    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/onboarding`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Akun Owner dibuat. Cek email konfirmasi, lalu login untuk menyiapkan usaha.");
          return;
        }
        router.replace("/onboarding");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(search.get("next") || "/dashboard");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authStage">
      <section className="authCard">
        <Brand showTagline />
        <div className="authIntro">
          <h1>{mode === "login" ? "Masuk ke PesanLunas" : "Aktivasi Owner Pertama"}</h1>
          {mode === "register" ? <p>Halaman ini khusus setup awal instalasi PesanLunas.</p> : null}
        </div>
        <form onSubmit={submit} className="formStack">
          {mode === "register" && (
            <label>
              Nama Owner
              <input name="name" required placeholder="Contoh: Rina" autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input name="email" required type="email" placeholder="nama@email.com" autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              required
              minLength={6}
              type="password"
              placeholder="Minimal 6 karakter"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {message && <div className="formMessage">{message}</div>}
          <button className="primaryButton" disabled={loading}>
            {loading ? "Memproses..." : mode === "login" ? "Masuk" : "Aktifkan Owner"}
          </button>
        </form>
        {mode === "login" ? (
          <p className="authSwitch" style={{ marginTop: 12 }}>
            <Link href="/auth/forgot">Lupa password?</Link>
          </p>
        ) : (
          <p className="authSwitch">
            <Link href="/auth/login">Kembali ke Login</Link>
          </p>
        )}
        {mode === "login" ? (
          <p className="authFootnote">Akun baru hanya dibuat melalui aktivasi Owner atau link undangan anggota tim.</p>
        ) : null}
      </section>
    </main>
  );
}
