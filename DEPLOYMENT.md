# My Scheduler cloud sync and push setup

The repository now contains the client integration and Supabase backend starter. **Push notifications and cross-device sync do not work until you create/configure a Supabase project and deploy the function.** GitHub Pages alone is a static host and cannot run scheduled server jobs.

## 1. Create Supabase project

1. Create a free project at https://supabase.com/dashboard.
2. In Project Settings → API, copy the Project URL and anon/publishable key.
3. Put those two public values in `config.js` (`supabaseUrl`, `supabaseAnonKey`). Never put a service-role key in browser code.
4. Apply `supabase/migrations/202611250001_scheduler_cloud_push.sql` in the Supabase SQL Editor.

The current client uses email magic-link authentication. Configure Authentication → URL Configuration so the deployed GitHub Pages URL is an allowed redirect URL, e.g. `https://k820230.github.io/Scheduler/**`.

## 2. Generate Web Push VAPID keys

Run locally (Node.js required):

```bash
npx web-push generate-vapid-keys
```

Put the **public** key in `config.js` as `vapidPublicKey`. Keep the private key secret.

## 3. Deploy the reminder function

Install the Supabase CLI and authenticate, then link the project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy send-reminders
supabase secrets set VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY
```

The function uses the Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets. Do not expose either secret in the browser.

## 4. Schedule it every minute

In Supabase SQL Editor, enable the `pg_cron`, `pg_net`, and `vault` extensions. Store the function URL and service-role key in Vault:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders', 'scheduler_function_url');
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'scheduler_service_role_key');

select cron.schedule(
  'my-scheduler-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The job checks for due reminders once per minute. Check Supabase Cron run history and Edge Function logs after setup.

## 5. Publish and enable on devices

1. Merge this branch into `main` and enable GitHub Pages (Settings → Pages → Deploy from branch → `main` → `/ (root)`).
2. Open `https://k820230.github.io/Scheduler/` on each device.
3. On iPhone, open the site in Safari, Share → Add to Home Screen, then launch the installed icon.
4. In My Scheduler → Settings, enter your email and tap **로그인 링크 받기**. Open the magic link on that device.
5. Tap **이 기기에서 푸시 알림 켜기** and allow notifications. Repeat on the PC browser and iPhone.

## Current implementation notes

- Schedule data is synchronized as one JSON document per signed-in user; simultaneous edits from two devices are last-write-wins. Avoid editing on both devices at exactly the same time.
- Reminder offsets are 0, 10, and 30 minutes. The backend uses the event's local browser/server timezone interpretation; the current schema stores date/time as local strings. For users travelling across time zones, a future migration should store an explicit IANA timezone per event.
- Repeating daily/weekly/monthly event support is included in the reminder worker.
- Push delivery depends on browser permission, device connectivity, and platform delivery; delivery time is not guaranteed to the exact second.
