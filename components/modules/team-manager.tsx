"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { FormActions, ModuleHeader, Notice } from "@/components/crud-ui";

type Member = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string | null;
  profiles: unknown;
};

type Profile = { full_name?: string | null; phone?: string | null };
type RoleKey = "owner" | "admin" | "staff" | "finance";
type RoleGuide = { title: string; description: string };
type RoleGuides = Record<RoleKey, RoleGuide>;

const roleOrder: RoleKey[] = ["owner", "admin", "staff", "finance"];

const defaultRoleGuides: RoleGuides = {
  owner: {
    title: "Owner",
    description:
      "Pemilik usaha dengan akses penuh. Mengatur profil usaha, kode otomatis, integrasi, anggota tim, pelanggan, produk, order, invoice, pembayaran, laporan, dan pengaturan sensitif.",
  },
  admin: {
    title: "Admin",
    description:
      "Mengelola operasional harian: pelanggan, produk/jasa, order, custom field, invoice, pembayaran, metode pembayaran, template pesan, laporan, serta melihat log aktivitas. Tidak dapat mengambil alih pengaturan Owner atau mengelola kepemilikan usaha.",
  },
  staff: {
    title: "Staff",
    description:
      "Fokus pada pencatatan operasional. Dapat mengelola pelanggan, produk/jasa, membuat dan memperbarui order, item order, serta melihat invoice/piutang. Tidak dapat menghapus data penting, mengelola tim, atau mencatat pembayaran sebagai Finance.",
  },
  finance: {
    title: "Finance",
    description:
      "Fokus pada penagihan dan pembayaran. Dapat melihat order/invoice, mencatat DP/cicilan/pelunasan, mengelola metode pembayaran, melihat piutang, membuat link invoice, dan membantu penagihan pelanggan.",
  },
};

function profile(v: unknown): Profile {
  if (Array.isArray(v)) return (v[0] ?? {}) as Profile;
  return (v ?? {}) as Profile;
}

function isRoleKey(value: string): value is RoleKey {
  return roleOrder.includes(value as RoleKey);
}

function normalizeGuides(value: unknown): RoleGuides {
  if (!value || typeof value !== "object") return defaultRoleGuides;
  const source = value as Record<string, unknown>;
  const result = { ...defaultRoleGuides };

  for (const key of roleOrder) {
    const raw = source[key];
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    result[key] = {
      title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : defaultRoleGuides[key].title,
      description:
        typeof row.description === "string" && row.description.trim()
          ? row.description.trim()
          : defaultRoleGuides[key].description,
    };
  }

  return result;
}

export function TeamManager({ businessId, role }: { businessId: string; role: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleKey>("staff");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingGuides, setSavingGuides] = useState(false);
  const [editingGuides, setEditingGuides] = useState(false);
  const [roleGuides, setRoleGuides] = useState<RoleGuides>(defaultRoleGuides);
  const [draftGuides, setDraftGuides] = useState<RoleGuides>(defaultRoleGuides);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const isOwner = role === "owner";

  const load = useCallback(async () => {
    const [memberResult, guideResult] = await Promise.all([
      supabase
        .from("business_members")
        .select("id,user_id,role,status,joined_at,profiles!business_members_user_id_fkey(full_name,phone)")
        .eq("business_id", businessId)
        .order("created_at"),
      supabase
        .from("business_settings")
        .select("value")
        .eq("business_id", businessId)
        .eq("key", "role_guides")
        .maybeSingle(),
    ]);

    if (memberResult.error) setMsg({ kind: "error", text: memberResult.error.message });
    setMembers((memberResult.data ?? []) as unknown as Member[]);

    if (!guideResult.error && guideResult.data) {
      const parsed = normalizeGuides(guideResult.data.value);
      setRoleGuides(parsed);
      setDraftGuides(parsed);
    }
  }, [businessId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.rpc("create_business_invitation", {
      p_business_id: businessId,
      p_email: email,
      p_role: inviteRole,
    });
    setSaving(false);
    if (error) return setMsg({ kind: "error", text: `Jalankan SQL patch v0.2.0 dulu. ${error.message}` });
    const token = String((data as Record<string, unknown>)?.token ?? "");
    setLink(`${location.origin}/join?token=${encodeURIComponent(token)}`);
    setMsg({ kind: "success", text: "Undangan dibuat. Kirim link ke anggota tim." });
    setEmail("");
  }

  async function updateMember(m: Member, changes: Record<string, unknown>) {
    const { error } = await supabase.from("business_members").update(changes).eq("id", m.id);
    if (error) return setMsg({ kind: "error", text: error.message });
    setMsg({ kind: "success", text: "Akses anggota diperbarui." });
    await load();
  }

  function startEditGuides() {
    setDraftGuides(roleGuides);
    setEditingGuides(true);
  }

  function cancelEditGuides() {
    setDraftGuides(roleGuides);
    setEditingGuides(false);
  }

  function changeGuide(key: RoleKey, field: keyof RoleGuide, value: string) {
    setDraftGuides((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }

  async function saveGuides(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    setSavingGuides(true);
    const cleaned = roleOrder.reduce((acc, key) => {
      acc[key] = {
        title: draftGuides[key].title.trim() || defaultRoleGuides[key].title,
        description: draftGuides[key].description.trim() || defaultRoleGuides[key].description,
      };
      return acc;
    }, {} as RoleGuides);

    const { error } = await supabase.from("business_settings").upsert(
      {
        business_id: businessId,
        key: "role_guides",
        value: cleaned,
      },
      { onConflict: "business_id,key" },
    );
    setSavingGuides(false);

    if (error) return setMsg({ kind: "error", text: error.message });
    setRoleGuides(cleaned);
    setDraftGuides(cleaned);
    setEditingGuides(false);
    setMsg({ kind: "success", text: "Panduan tugas role tersimpan." });
  }

  return (
    <>
      <ModuleHeader title="Anggota Tim" subtitle="Atur akses dan jelaskan tugas setiap role" />
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <section className="formPanel roleGuidePanel">
        <div className="roleGuideHeading">
          <div>
            <h2>Panduan Tugas Role</h2>
            <p>Semua anggota dapat membaca panduan ini. Owner dapat menyesuaikannya dengan SOP usaha.</p>
          </div>
          {isOwner && !editingGuides ? (
            <button type="button" className="miniButton primary" onClick={startEditGuides}>
              Edit Panduan
            </button>
          ) : null}
        </div>

        {editingGuides ? (
          <form onSubmit={saveGuides}>
            <div className="roleGuideEditor">
              {roleOrder.map((key) => (
                <div className="roleGuideEditCard" key={key}>
                  <label className="formField">
                    Nama Role
                    <input value={draftGuides[key].title} onChange={(e) => changeGuide(key, "title", e.target.value)} />
                  </label>
                  <label className="formField">
                    Tugas & Tanggung Jawab
                    <textarea
                      value={draftGuides[key].description}
                      onChange={(e) => changeGuide(key, "description", e.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
            <FormActions saving={savingGuides} onCancel={cancelEditGuides} submitLabel="Simpan Panduan Role" />
          </form>
        ) : (
          <div className="roleGuideGrid">
            {roleOrder.map((key) => (
              <article className={`roleGuideCard role-${key}`} key={key}>
                <div className="roleGuideCardHead">
                  <strong>{roleGuides[key].title}</strong>
                  <span>{key === "owner" ? "Akses penuh" : key === "admin" ? "Operasional" : key === "staff" ? "Pencatatan" : "Keuangan"}</span>
                </div>
                <p>{roleGuides[key].description}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {isOwner ? (
        <form className="formPanel" onSubmit={invite}>
          <h2>Undang Anggota</h2>
          <div className="fieldGrid">
            <label className="formField">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="formField">
              Role
              <select
                value={inviteRole}
                onChange={(e) => {
                  if (isRoleKey(e.target.value)) setInviteRole(e.target.value);
                }}
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="finance">Finance</option>
              </select>
            </label>
          </div>
          <div className="selectedRoleHint">
            <strong>{roleGuides[inviteRole].title}</strong>
            <span>{roleGuides[inviteRole].description}</span>
          </div>
          <FormActions saving={saving} submitLabel="Buat Link Undangan" />
          {link ? (
            <label className="formField" style={{ marginTop: 12 }}>
              Link Undangan
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <span className="formHint">Berlaku 7 hari. Anggota baru dapat membuat password langsung dari link ini; tidak perlu menu Daftar publik.</span>
            </label>
          ) : null}
        </form>
      ) : null}

      <div className="crudList">
        {members.map((m) => {
          const p = profile(m.profiles);
          const isMemberOwner = m.role === "owner";
          const memberRole: RoleKey = isRoleKey(m.role) ? m.role : "staff";
          return (
            <article className="crudCard" key={m.id}>
              <div className="crudCardTop">
                <div className="crudCardTitle">
                  <strong>{p.full_name || "Pengguna PesanLunas"}</strong>
                  <small>{p.phone || m.user_id}</small>
                  <small className="memberRoleSummary">{roleGuides[memberRole].description}</small>
                </div>
                <span className={`statusBadge ${m.status === "active" ? "green" : "amber"}`}>
                  {roleGuides[memberRole].title} · {m.status}
                </span>
              </div>
              {isOwner && !isMemberOwner ? (
                <div className="crudCardActions">
                  <select className="miniButton" value={m.role} onChange={(e) => void updateMember(m, { role: e.target.value })}>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                    <option value="finance">Finance</option>
                  </select>
                  <button
                    type="button"
                    className={`miniButton ${m.status === "active" ? "danger" : "primary"}`}
                    onClick={() => void updateMember(m, { status: m.status === "active" ? "suspended" : "active" })}
                  >
                    {m.status === "active" ? "Suspend" : "Aktifkan"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
