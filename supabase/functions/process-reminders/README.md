# PesanLunas — Edge Function Auto Reminder

Fungsi `process-reminders` hanya mengirim WhatsApp otomatis bila:

1. `business_settings.whatsapp_provider` = `fonnte` atau `starsender`.
2. `business_settings.auto_reminder.enabled` = `true`.
3. Nomor WhatsApp pelanggan tersedia.
4. Invoice masih `unpaid` / `partial`.
5. Hari ini tepat H-1, hari H, atau terlambat 1/3/7 hari.
6. Event untuk invoice tersebut belum pernah diproses (idempotency key).

Tanpa gateway, reminder di Dashboard/Piutang tetap tampil dan tombol WhatsApp manual tetap dapat digunakan. Edge Function tidak mengirim apa pun bila provider `manual`.

## Deploy

```bash
supabase functions deploy process-reminders --no-verify-jwt
```

Set secrets yang diperlukan:

```bash
supabase secrets set REMINDER_CRON_SECRET="GANTI_DENGAN_STRING_PANJANG_RANDOM"
supabase secrets set FONNTE_TOKEN="TOKEN_FONNTE"            # jika memakai Fonnte
supabase secrets set STARSENDER_API_KEY="KEY_STARSENDER"    # jika memakai Starsender
```

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` tersedia di environment Edge Function project Supabase.

## Scheduler

Jadwalkan pemanggilan function minimal 1x per hari. Karena setiap bisnis mempunyai timezone sendiri, rekomendasi praktis adalah menjalankannya tiap jam. Function hanya akan mengirim ketika tanggal lokal bisnis cocok dengan event reminder dan idempotency mencegah pengiriman ganda.

Request scheduler harus membawa header:

```text
x-cron-secret: <REMINDER_CRON_SECRET>
```

Endpoint function:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/process-reminders
```
