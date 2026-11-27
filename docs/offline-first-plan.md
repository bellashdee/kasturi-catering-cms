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

## 7. What was built

| Piece | Files |
| --- | --- |
| Service worker (app shell, per-user page copies, offline page, Background Sync wake-up; push notifications unchanged) | `public/sw.js` |
| Offline view policy (mirrored in the worker; `node scripts/check-offline-policy.mjs` checks both lists and that no payroll/HR/finance/report/admin page is kept) | `src/lib/offline/policy.ts`, `scripts/check-offline-policy.mjs` |
| IndexedDB per user: outbox, attachments, conflicts, meta; device id | `src/lib/offline/db.ts` |
| Queue + sync engine (triggers, Web Locks, back-off, attachments uploaded once, conflicts kept) | `src/lib/offline/sync.ts`, `src/lib/offline/types.ts` |
| Sync endpoint (runs as the signed-in user; idempotent; ordered) and conflict choice | `src/app/api/sync/route.ts`, `src/app/api/sync/resolve/route.ts`, `src/lib/offline/server/{core,handlers,dbLog}.ts` |
| Sign-out that keeps unsent changes and removes cached pages | `src/lib/offline/signOut.ts`, `ProfileMenu.tsx`, `Sidebar.tsx`, `SessionGuard.tsx` |
| Status pill on every signed-in page (ONLINE / OFFLINE / SYNCING / SYNC FAILED), panel with last sync, pending, failed, SYNC NOW, conflicts (Keep mine / Keep the saved version), install guide | `src/components/offline/{OfflineProvider,SyncStatus,QueuedChanges,InstallGuide}.tsx`, `Topbar.tsx`, `(dashboard)/layout.tsx` |
| Offline-capable forms | `WastageForm.tsx`, `WastageRowActions.tsx`, `DeliveryStatusSelect.tsx`, `PettyCashEntryForm.tsx` (+ their pages show "Made offline, not saved on the server yet") |
| Same validation for online and offline saves (moved, not changed) | `src/lib/kitchen/wastage.ts` (`cleanWastageInput`), `src/lib/operationPettyCash/rules.ts` |
| Device-made ids also on the normal online save (a save whose answer was lost and is then queued can never be saved twice) | `createWastage`, `createPettyCashEntry` (single entry) accept an optional `id` |
| Database | `supabase/migrations/20261128000001_offline_sync.sql` (`offline_mutations`, `sync_conflicts`, RLS: own rows; company admins can read conflicts) + types in `src/lib/supabase/types.ts` |
| Malay text | `src/lib/i18n/dictionaries/ms.ts` (86 entries) |

### How a change travels

1. The form tries the normal Server Action. If the device is offline (or the call fails with a network error) the change is written to
   IndexedDB instead: `{ id (UUID = idempotency key), op, recordId, companyId, payload, base (updated_at / status seen), userId,
   deviceId, createdAt }`, photos as blobs. The write is confirmed only when the IndexedDB transaction completes.
2. The engine sends due changes in creation order to `POST /api/sync` (max 50 per call): photos first (uploaded once; the document id
   is saved on the device before the change is sent), then the batch.
3. The server, as the signed-in user: skips a change already recorded as applied (`offline_mutations`), otherwise runs the handler.
   Creates insert with `id = recordId` (a replay hits the primary key and is answered "duplicate"); updates/deletes are conditional on
   the version the user saw; a passing error stops the rest of the batch so order is kept.
4. The device deletes a change only on "applied" / "duplicate". "conflict" moves it to the conflicts store (and `sync_conflicts`);
   "rejected" keeps it with the reason (Try again / Discard); "retry" and server errors keep it with back-off (5 s doubling to 30 min).
   No connection is not a failure: the change stays "waiting".

## 8. Deploy

1. Review and merge the PR into `master`; Vercel deploys it as usual (no new environment variables).
2. Apply `supabase/migrations/20261128000001_offline_sync.sql` to the production project **after approval** (Supabase SQL editor or
   `supabase db push`). Until it is applied the sync still works and stays idempotent (device ids as primary keys, version checks), but
   no server-side record of offline changes and conflicts is kept (a warning is logged).
3. Nothing else changes for people who never go offline: online saves use the same Server Actions as before.

## 9. Known limitations

- Only the operations in §3 can be made offline. Other forms keep their normal behaviour and show their usual error without a
  connection.
- An offline copy of a page is the page as it was when last opened (at most 80 pages per person, renewed at most every 15 minutes when
  opened). New records made offline appear in the "Made offline" box, not in the list, until they are synced.
- A record made offline cannot be edited again before it is synced (discard and make it again instead).
- Background Sync exists only in Chrome / Edge / Android; Safari and Firefox send the queue when the app is opened or comes back online.
- iOS may delete the storage of a web app that is not opened for several weeks, and only the Home Screen app keeps its own storage.
- Data on the device is separated per person by the app, not encrypted: someone with full access to the browser profile (developer
  tools) could read it. Sign-out removes the cached pages; unsent changes are kept until they are sent.
- Signed-out (session expired) devices cannot send: the queue waits until the same person signs in again.

## 10. Test results (local, 28 Nov 2026)

Run against `next build` + `next start` in a real Microsoft Edge (headless, fresh profile, driven over the DevTools protocol, network
switched off with DevTools offline mode and by stopping the server). The production database was **not** used: a local-only test page
fed the real sync core and the real Wastage handlers with an in-memory database (the test page and script are kept outside the repo).
22 of 22 checks passed:

| Scenario | Result |
| --- | --- |
| First visit online: service worker active and in control, app files and the page kept for that user | pass |
| Online save goes straight through, queue empty | pass |
| Offline save kept in IndexedDB as "waiting"; status shows OFFLINE (LUAR TALIAN) | pass |
| Refresh while offline (server stopped): the kept copy opens; the queued change is still there | pass |
| Page never opened before, offline: offline page explaining why | pass |
| Browser closed and opened again offline: queued change still there | pass |
| Connection back: change applied once; the device removes it only after the server confirmed | pass |
| Sync again: no duplicate | pass |
| Server applied the change but the answer was lost: kept as failed, retried, applied exactly once | pass |
| Server error (503): kept as failed with one attempt counted, status SYNC FAILED (SEGERAK GAGAL); sent by SYNC NOW | pass |
| Two users edit one record: conflict detected, the other user's version not overwritten, both versions shown, "Keep mine" applies over the newer version | pass |
| Sign-out with an unsent change: that user's kept pages removed, the next user sees none of it; the change stays in the first user's own database and is sent once when that user signs in again | pass |

Also checked: `tsc --noEmit`, ESLint on every changed file, `node scripts/check-offline-policy.mjs`, `next build`.

Not tested here: real phones and tablets, iOS Safari / Home Screen app (no Apple device), Background Sync on a real Android device,
the real Supabase handlers against the real database (no test project; the migration is not applied), and the offline forms inside the
signed-in pages (signing in needs a real account). Seen once: when the browser process was killed abruptly (not closed), the next start
did not find the service worker yet, so the first offline open showed the browser's own offline page; a normal close/restart worked.
