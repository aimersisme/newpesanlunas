# PesanLunas v0.2.11-r1 — Single Install + Optional WhatsApp Auto Reminder

Versi ini membawa seluruh fitur v0.2.7 Theme Engine, Quick Customer Order, Team Role Guide, Auto SKU, CRUD, performance/runtime fixes, lalu menambahkan personalisasi dashboard dan modul Hutang & Piutang standalone.

## Yang baru
- Hutang & Piutang standalone dengan cicilan dan sisa saldo.

### Sapaan personal berdasarkan waktu
Dashboard sekarang menampilkan nama akun yang sedang login:

- Selamat pagi, Rina 👋
- Selamat siang, Andi 👋
- Selamat sore, Maya 👋
- Selamat malam, Dewi 👋

Sapaan mengikuti timezone usaha. Nama dibaca dari `profiles.full_name` dan tetap dibawa melalui optimized dashboard RPC agar tidak menambah round-trip halaman utama.

### Quote motivasi dinamis
Menu **Lainnya → Pengaturan Usaha → Sapaan & Quote Dashboard** sekarang memungkinkan Owner:

- mengaktifkan/nonaktifkan quote dashboard;
- mengedit quote bawaan;
- menambah quote sendiri hingga 20;
- menghapus quote;
- mengembalikan 10 quote bawaan.

Satu quote dipilih acak setiap kali Dashboard dibuka. Setting disimpan pada `business_settings` dengan key `dashboard_motivation`.

### Brand + tagline
Brand header sekarang menggunakan logo PesanLunas transparan tanpa kotak/frame dan menampilkan tagline:

**PesanLunas**  
*Pesanan tercatat, tagihan cepat lunas.*

Logo yang sama dipakai pada Login, Register, Onboarding, Setup, Dashboard, dan icon PWA.

## Update database existing
Untuk database project PesanLunas yang sudah memakai patch v0.2.1+, jalankan:

`PesanLunas_v0.2.8_DASHBOARD_PERSONALIZATION_PATCH.sql`

Patch ini tidak membuat tabel/kolom baru. Patch hanya meng-upgrade `get_single_dashboard_payload()` supaya nama user dan konfigurasi quote ikut dikirim dalam satu request dashboard.

## Urutan update
1. Jalankan patch SQL v0.2.8 sekali di Supabase SQL Editor.
2. Replace source GitHub dengan isi package v0.2.8.
3. Push dan redeploy Vercel.
4. Login → Lainnya → Pengaturan Usaha → Sapaan & Quote Dashboard.
5. Isi/edit quote lalu Simpan Pengaturan.
6. Buka Dashboard beberapa kali untuk memastikan quote berganti secara acak.


## v0.2.11-r1 — Single Install + Reminder

- Login publik tidak lagi menampilkan menu Daftar.
- `/auth/register` hanya dapat dibuka dengan `OWNER_SETUP_KEY` untuk aktivasi Owner pertama.
- Anggota baru masuk melalui link undangan `/join?token=...`, bukan registrasi publik.
- Tanpa gateway WhatsApp: monitoring jatuh tempo tetap berjalan di Dashboard/Piutang dan tombol Tagih membuka WhatsApp manual dengan pesan siap kirim.
- Dengan Fonnte/Starsender + Auto Reminder aktif: Edge Function `process-reminders` mengirim H-1, hari H, overdue 1/3/7 hari.
- Edge Function tidak mengirim apa pun jika provider `manual`.
- Owner dapat menjalankan **Jalankan Reminder Sekarang** dari menu Integrasi WhatsApp untuk pengujian.

### Environment untuk tombol Jalankan Reminder Sekarang

Vercel server environment membutuhkan `REMINDER_CRON_SECRET` dengan nilai yang sama seperti secret pada Supabase Edge Function. Token gateway tetap disimpan sebagai secret server-side/Edge Function.

### Edge Function

Deploy:

```bash
supabase functions deploy process-reminders --no-verify-jwt
```

Secrets:

```bash
supabase secrets set REMINDER_CRON_SECRET="STRING_RANDOM_PANJANG"
supabase secrets set Token Fonnte="TOKEN_FONNTE"
supabase secrets set API Key Starsender="KEY_STARSENDER"
```

Scheduler tetap diperlukan untuk pengiriman otomatis tanpa membuka aplikasi. Jalankan Edge Function minimal 1x per hari; interval per jam lebih aman karena timezone setiap usaha dapat berbeda. Idempotency mencegah pengiriman event yang sama berulang.


## v0.2.11-r1 — Hutang & Piutang
- Menu `Keuangan → Hutang & Piutang` melalui Lainnya.
- Piutang dan hutang berdiri sendiri, tidak perlu customer/order/invoice.
- Nominal awal, jatuh tempo, WhatsApp, referensi, catatan, status, sisa saldo.
- Pembayaran/cicilan dengan RPC yang mengunci saldo untuk mencegah pembayaran melebihi sisa.
- Search, filter jenis, pagination, detail riwayat pembayaran, dan tombol WhatsApp manual.
- Hak kelola: Owner/Admin/Finance; anggota lain hanya membaca data.
- Master schema fresh-install: `PesanLunas_MASTER_FULL_v1.6.sql`.

## WhatsApp Token

Token Fonnte / API Key Starsender sekarang diisi langsung dari menu **Integrasi WhatsApp**. Tidak perlu menaruh token provider di Vercel Environment Variables atau Supabase Secrets. `REMINDER_CRON_SECRET` tetap digunakan untuk scheduler reminder.
