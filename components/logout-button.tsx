"use client";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function LogoutButton() {
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }
  return <button className="menuRow danger" onClick={logout}><LogOut size={20} /><span><strong>Keluar</strong><small>Logout dari akun PesanLunas</small></span></button>;
}
