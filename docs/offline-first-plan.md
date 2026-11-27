# Offline-first, multi-device upgrade — audit and plan

Status: implemented on branch `feature/offline-first-pwa` (see "What was built"). Nothing in this plan is applied to the production
database until the migration in `supabase/migrations/20261128000001_offline_sync.sql` is approved and applied.

## 1. Audit of the current architecture

| Area | What exists today | What it means for offline |
| --- | --- | --- |
| Rendering | Next.js 16 App Router; every dashboard page is a dynamic Server Component that reads Supabase on the server with the user's cookie. | There is no client-side data store to reuse. The HTML (with its embedded RSC payload) of a page *is* the data of that page. |
| Writes | ~58 `"use server"` files. Almost every save is a Server Action that validates, writes with the user's Supabase client (RLS), writes `audit_logs`, and calls `revalidatePath`. | Server Actions cannot be queued and replayed safely (their ids change on every deploy and they are not idempotent). Offline writes need their own idempotent path. |
| Auth | Supabase SSR cookies; `proxy.ts` checks the token and module/section grants on every navigation. | Offline, nothing can be re-checked. Only data the user already loaded while signed in may be shown, and only to that user. |
| Permissions | RLS on every table, `user_company_access.allowed_modules/sections`, salary/payroll limited to Penny Chan and Nabilah (migration `20261122000030`). | RLS stays the only authority: the sync endpoint runs as the signed-in user with the normal server client, never the service role. |
| Existing PWA bits | `public/manifest.webmanifest`, icons, `public/sw.js` (push notifications only, registered only when push is switched on). | Extend the same service worker (same scope, no second registration) and register it for everyone. |
| Concurrency | `updated_at` + `set_updated_at()` trigger on `wastage_log`, `deliveries`, `leave_requests` (and many other tables). | `updated_at` is used as the version for conflict detection. |
| i18n | DOM translation (`I18nProvider`) from English text → `dictionaries/ms.ts`. | New UI text is written in English and its Malay text added to `ms.ts`. |

## 2. Decisions

1. **App shell + page snapshots (service worker, Cache Storage).** Static build files (`/_next/static`, icons, fonts) are cache-first.
   Page navigations are network-first; a successful page is kept in a cache named after the signed-in user (`kcms-pages-<userId>`).
   Offline, the last copy of that page is shown with an "offline copy" note. Pages never visited show an offline page.
   Only an **allow-list** of non-sensitive modules is kept (see §4); payroll, HR staff files, finance, admin, settings, reports and
   the AI assistant are never stored.
2. **IndexedDB per user per device** (`kcms-offline-<userId>`): `outbox` (pending writes), `attachments` (photo blobs waiting to be
   uploaded), `conflicts` (both versions kept), `meta` (last successful sync). The device id is a random UUID kept in `localStorage`.
3. **Durable outbox.** A queued write is `{ id (client UUID = idempotency key), op, payload, base, userId, deviceId, createdAt,
   updatedAt, status, attempts, nextAttemptAt, lastError }`. It is deleted only after the server confirms it (`applied`, `duplicate`,
   or a conflict the user resolved). Failures stay in the queue with exponential back-off (5 s → 30 min).
4. **Idempotent sync endpoint** `POST /api/sync`. Each mutation is handled by a whitelisted, server-side handler that reuses the module's
   own validation. Creates use the client UUID as the new row's primary key, so a replay can never make a second row; every mutation is
   also logged in `offline_mutations` (primary key = mutation id), so a mutation already applied returns its stored result.
5. **Conflicts.** Updates and deletes carry the `updated_at` the user saw. The handler updates `… where id = ? and updated_at = ?`; if no
   row changes, the current server row is returned as a conflict. Both versions are kept (`sync_conflicts` table + IndexedDB) with who and
   when. The user chooses **Keep mine** (re-sent against the new version) or **Keep the saved version** (mine is dropped, still recorded).
6. **Sync triggers.** App open, `online` event, tab back in the foreground, every 60 s while something is waiting, the SYNC NOW button,
   and Background Sync where the browser has it (Chrome/Edge/Android). One tab syncs at a time (Web Locks).
7. **Security.** Logout deletes the user's page cache and read data; pending writes of that user are kept (never lost) in that user's own
   database and are only ever sent with that user's session. A different user on the same device never sees another user's cache or
   queue: the service worker serves cached pages only for the user that is signed in now, and the app opens only that user's database.

## 3. Writes that may be queued offline (this PR)

| Module | Operation | Why it is safe offline |
| --- | --- | --- |
| Kitchen → Wastage Log | New entry (+ photo), edit, delete | Information only, owned by the person who recorded it; edit/delete checked against `updated_at`. |
| Driver & Logistics → Delivery | Change status to Scheduled / In transit / Cancelled | Drivers lose signal on the road; status change is checked against the status and `updated_at` they saw. "Delivered" still needs proof and stays online. |
| Company Spending → Operation petty cash | New entry for one company and one category (+ receipt photos) | Holders record spending where it happens; split entries, edits and deletes stay online (they change several rows at once). |

## 4. Offline view (read) policy

Kept offline (last opened copy, this user only): Dashboard home, Bulletin, Birthdays, Priority Centre / My Tasks, Catering events and
calendar, Kitchen (recipes, menus, packages, plan, purchase requests, wastage, stock), Driver & Logistics (deliveries, vehicles,
maintenance, drivers), Restaurant menu, Marketing, Company Spending (petty cash, my claims), Supplier & Procurement lists.

Never kept offline (online only): Payroll Centre and HR (staff files: IC, bank, salary, payroll, letters), Admin & Finance (invoices,
payments, AutoCount numbers, outstanding), Reports (company-wide figures), Admin / user and permission settings, Settings, Profile,
AI Assistant, imports (FeedMe, Excel, PDF extraction), and every page outside the dashboard (public forms, login).

## 5. Must stay online (and why)

- Approvals and decisions (leave, overtime, purchase requests, payment approvals): they depend on the current state and other people.
- Clock-in / attendance: needs server time and the location check; an offline clock time could not be trusted.
- Invoices, receipts, payments, AutoCount numbers, monthly sales: accounting numbers must be unique and checked against the server.
- Payroll, salary, staff personal data: restricted by RLS to named people; not copied to devices.
- User, permission and company settings; imports and AI extraction (need the server and other services).

## 6. Test plan

Local `next dev` + Chrome DevTools offline mode: offline refresh of a visited page, create/edit offline, reopen the browser, reconnect and
sync, replay the same mutation twice (no duplicate), two users editing one row (conflict), logout/login as another user (no data seen).
Not testable here: real Android/iOS devices, iOS Safari install and storage eviction, Background Sync on real phones.
