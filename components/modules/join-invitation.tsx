"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/brand";

 type Preview = {
  email: string;
  role: string;
  business_name: string;
  expires_at: string;
};

export function JoinInvitation({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setMsg("");
      if (!token) {
        setMsg("Token undangan tidak ditemukan.");
        setLoading(false);
        return;
      }
      const [{ data: invitation, error: inviteError }, { data: authData }] = await Promise.all([
        supabase.rpc("get_business_invitation_preview", { p_token: token }),
        supabase.auth.getUser(),
      ]);
      if (inviteError) {
        setMsg(`Undangan tidak dapat dibuka. ${inviteError.message}`);
      } else {
        setPreview(invitation as Preview);
      }
      setAuthEmail(authData.user?.email ?? null);
      setLoading(false);
    })();
  }, [supabase, token]);

  async function accept() {
    setBusy(true);
    setMsg("");
    const { error } = await supabase.rpc("accept_business_invitation", { p_token: token });
    setBusy(false);
    if (error) return setMsg(error.message);
    window.location.href = "/dashboard";
  }

  async function authenticate(e: FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setBusy(true);
    setMsg("");
    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: preview.email,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/join?token=${encodeURIComponent(token)}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMsg("Akun dibuat. Buka email konfirmasi lalu kembali ke link undangan ini.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: preview.email, password });
        if (error) throw error;
      }
      const { data: userData } = await supabase.auth.getUser();
      setAuthEmail(userData.user?.email ?? preview.email);
      setMsg("Login berhasil. Klik Terima Undangan untuk bergabung.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Gagal memproses akun.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authStage">
      <section className="authCard">
        <Brand showTagline />
        <div className="authIntro">
          <h1>Gabung ke Tim</h1>
          <p>
            {preview
              ? `${preview.business_name} mengundang Anda sebagai ${preview.role}.`
              : "Buka undangan anggota PesanLunas."}
          </p>
        </div>

        {loading ? <div className="formMessage">Memeriksa undangan...</div> : null}
        {msg ? <div className="formMessage">{msg}</div> : null}

        {!loading && preview && authEmail ? (
          <>
            <div className="formMessage">Login sebagai {authEmail}</div>
            <button className="primaryButton" style={{ width: "100%" }} onClick={() => void accept()} disabled={busy}>
              {busy ? "Memproses..." : "Terima Undangan"}
            </button>
            <p className="authSwitch"><Link href="/auth/login">Ganti akun</Link></p>
          </>
        ) : null}

        {!loading && preview && !authEmail ? (
          <>
            <div className="segmented" style={{ marginBottom: 14 }}>
              <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Buat Akun</button>
              <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sudah Punya Akun</button>
            </div>
            <form className="formStack" onSubmit={authenticate}>
              {mode === "register" ? (
                <label>
                  Nama Anda
                  <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nama anggota" autoComplete="name" />
                </label>
              ) : null}
              <label>
                Email Undangan
                <input value={preview.email} readOnly type="email" />
              </label>
              <label>
                Password
                <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} />
              </label>
              <button className="primaryButton" disabled={busy}>
                {busy ? "Memproses..." : mode === "register" ? "Buat Akun Anggota" : "Login & Lanjut"}
              </button>
            </form>
          </>
        ) : null}

        {!loading && !preview ? <p className="authSwitch"><Link href="/auth/login">Kembali ke Login</Link></p> : null}
      </section>
    </main>
  );
}
