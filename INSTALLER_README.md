# PesanLunas v0.2.11 — FULL CLIENT INSTALLER

## Fresh Client / Single Install

This package is the complete source for one independent PesanLunas installation.

Architecture:
- 1 client = 1 GitHub repository
- 1 client = 1 Vercel project
- 1 client = 1 Supabase project/database
- This edition is NOT SaaS multi-tenant.

## 1. Supabase

Create a new Supabase project and run:

`supabase/PesanLunas_MASTER_FULL_v1.6.sql`

Run it once on a fresh project.

## 3. Upgrade from v0.2.10

If you already run PesanLunas v0.2.10, do NOT rerun the full master schema. Run `PesanLunas_v0.2.11_HUTANG_PIUTANG_PATCH.sql` once in the existing Supabase project.

The fresh-install master already includes the same module as `supabase/PesanLunas_MASTER_FULL_v1.6.sql`.

## 2. Vercel environment variables

Required:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY (or supported publishable key)

Optional WhatsApp gateway:
- FONNTE_TOKEN
- STARSENDER_API_KEY
- REMINDER_CRON_SECRET

Owner activation protection:
- OWNER_SETUP_KEY

Never put SUPABASE_SERVICE_ROLE_KEY in client-side code.

## 3. GitHub + Vercel

Upload the contents of this package to the ROOT of a GitHub repository, then deploy that repository with Vercel.

Node target: >=20.9
Next.js: 15.5.24
React: 19.1.0
TypeScript: 5.8.3
Supabase JS: 2.49.8
Supabase SSR: 0.6.1

## 4. WhatsApp reminder

Without a gateway:
- reminder monitoring remains visible in the app;
- user can send WhatsApp manually through wa.me;
- automatic WhatsApp delivery does not run.

With Fonnte or Starsender:
- automatic reminder can run through the Supabase Edge Function:
  `supabase/functions/process-reminders/index.ts`
- deploy it as `process-reminders`;
- configure the provider secret and REMINDER_CRON_SECRET;
- schedule the Edge Function (daily minimum; hourly recommended).

## 5. Authentication

This is a single-install application. Public self-registration is disabled in the UI.

The first Owner is activated through the protected Owner setup flow. Additional Admin/Staff/Finance users join through Owner invitations.
