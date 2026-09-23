# process-reminders

Edge Function untuk memproses reminder WhatsApp otomatis PesanLunas.

## Konfigurasi

1. Di PesanLunas buka **Integrasi WhatsApp**.
2. Pilih **Fonnte** atau **Starsender**.
3. Masukkan Token/API Key langsung di halaman tersebut.
4. Aktifkan **Auto kirim reminder WhatsApp**.
5. Deploy function ini sebagai `process-reminders`.
6. Untuk pemanggilan scheduler, tetap gunakan `REMINDER_CRON_SECRET` pada Supabase Edge Function dan Vercel.

Token provider tidak lagi perlu dimasukkan ke Vercel Environment Variables atau Supabase Secrets. Token disimpan di tabel `whatsapp_integrations` dengan RLS Owner-only dan dibaca server-side oleh aplikasi/Edge Function.

## Deploy

```bash
supabase functions deploy process-reminders --no-verify-jwt
```

`REMINDER_CRON_SECRET` tetap wajib untuk endpoint scheduler karena function memvalidasi header `x-cron-secret` sendiri.
