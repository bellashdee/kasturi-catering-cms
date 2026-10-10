# Phase 4: Attendance. Pre-Coding Report

Version 1 · Date 2026-10-10 · Status: **FOR REVIEW. NO PHASE 4 CODE OR MIGRATION HAS BEEN WRITTEN.**
Companies: Signature Solution, Kasturi Indah, 02Life.

How to read this: facts I verified are marked **(verified)**; things I could not verify are marked **(unverified)**; proposals are marked **(proposed)**.

---

## 1. Decisions I need from you (short list)

| # | Decision | My recommendation |
|---|---|---|
| D1 | Split Phase 4 into **4A** (GPS + server time + exceptions + dashboard, no paid service) and **4B** (face verification, after you approve a provider)? | Yes. 4A can be built and tested without any new cost. |
| D2 | Until a face provider is configured, what should clock-in do? (a) block clock-in; (b) accept it but mark it **"face not verified: manual review"**. | (b), clearly labelled. Choose (a) if face check is a hard legal/policy requirement today. |
| D3 | Face provider: AWS Rekognition (paid, with liveness), Azure Face (needs Microsoft approval), or in-browser open source (free, weaker, **no genuine liveness**)? | AWS Rekognition Face Liveness for 4B, **if** its price and regional availability check out (see §6). |
| D4 | GPS accuracy limit (reading is rejected if its reported accuracy is worse). | 50 m to start, adjustable per workplace. |
| D5 | Workplace coordinates for each company (name + latitude/longitude). | You or HR enter them on a settings screen. I will not guess any. |
| D6 | Working hours / grace minutes / shifts per company. | Left **unset** (PENDING CONFIRMATION). Lateness is not calculated until a schedule is entered. I will not invent hours. |
| D7 | Retention for GPS and face-related records (see §10). | Proposals only; confirm with a legal adviser. |
| D8 | The existing **driver** clock-in (5 km, photo only) stays as-is for now, or is aligned later? | Leave untouched in Phase 4; address as a separate approved change (see §3). |

---

## 2. What exists today (verified by reading the code and the live schema)

### 2.1 HR attendance table `attendance_records`
- Columns: company, employee, work_date, `check_in` / `check_out` as **time of day only**, status (present/absent/late/on_leave), notes. One row per employee per day (unique).
- **0 rows in production.** No screen writes to it (the profile page only reads it).
- No GPS, no face result, no workplace, no server-side validation, no audit of who set the times.
- After migration 0004 (written, not applied): employees cannot write it; only HR can.

### 2.2 Driver attendance (separate, in use)
- Tables `driver_attendance` (**0 rows**), `driver_profiles` (18 drivers) with per-driver approved latitude/longitude and expected clock-in time.
- Behaviour: the driver takes a **selfie photo** (a file input that opens the front camera) and the app uploads it; the browser sends latitude/longitude; the **server computes the distance** and rejects beyond **5 km**; the server stamps the time (`new Date().toISOString()` on the server); Malaysia date; one row per day; duplicate clock-in blocked.
- **What it is NOT:** the photo is only stored, **never compared to anyone** (no face verification, no liveness); GPS **accuracy is not recorded or checked**; the coordinates are whatever the browser says; the radius is 5 km, not 100 m.
- **Gap (existing, not caused by this work):** the policies on `driver_attendance` let *any* user of the company insert or update any row. The app code restricts it to the driver's own login, but the database does not.
- No code anywhere in the project does face recognition. (verified by search)

### 2.3 Other facts that affect the design
- No `workplaces` table exists; no work-schedule table exists.
- Server timestamps: attendance times in the driver module come from the server. (verified)
- `SUPABASE_SERVICE_ROLE_KEY` exists as a Production environment variable (name only verified); the app already has an admin client.
- 68 employees, **0 linked to a login**: nobody can clock in as themselves until HR links logins.

---

## 3. Proposed database changes (migration `…0005_attendance.sql`, **proposed, not written**)

All additive. Nothing existing is dropped or renamed.

| Object | Status | Purpose and key fields |
|---|---|---|
| `workplaces` | NEW | `company_id, name, address, latitude, longitude, radius_m, max_accuracy_m, is_active`. **`radius_m` has a database `CHECK (radius_m = 100)`** (you asked for exactly 100 m; changing it later is a deliberate, approved migration). Coordinates validated (−90..90, −180..180). |
| `employee_workplaces` | NEW | Which employee may clock in at which workplace (`employee_id, workplace_id`). |
| `work_schedules` + assignment | NEW (empty) | Start/end, break, grace, rest days, effective dates. **No defaults, no invented hours.** |
| `attendance_records` | EXTEND | Add `clock_in_at`, `clock_out_at` (timestamptz), `workplace_id`, in/out latitude, longitude, accuracy, distance, `verification_status` (in/out), `source` (`clock` or `hr_exception`), `late_minutes` (only when a schedule exists). Old `check_in/check_out` stay for compatibility. |
| `attendance_events` | NEW | **One row for every attempt, including rejected ones**: action, outcome, reject reason, distance, accuracy, face outcome, liveness outcome, provider session reference, user agent. **No image, no embedding.** Server-only writes. |
| `attendance_corrections` | NEW | Employee/manager asks for a correction or HR records an exception: reason, proposed times, status (pending / approved / rejected), requester, approver, decided_at. The requester can never approve their own. |
| `face_consents` | NEW | Consent text version, timestamp, who captured it. Needed before any enrolment. |
| `face_enrolments` | NEW (4B only) | Status and a provider reference. **No photo gallery.** No client read access. |
| `audit_log` | EXISTS (migration 0001) | Reused. Triggers added for attendance tables. |

`work_date` is the Malaysian calendar date of the clock-in. A shift that crosses midnight is clocked out on the following day without breaking the one-record-per-day rule. (proposed)

---

## 4. Clock-in / clock-out workflow (proposed)

The browser **never writes attendance**. It only collects a location reading and (in 4B) a live face capture, and sends them to a server action.

1. Employee opens the attendance page on a phone; the page shows the **server** date/time, the assigned workplace and two status lights: Location, Face.
2. Tap **Clock in** → the browser asks for location (and, in 4B, camera). **Denied → clear message, nothing is recorded**, and the "ask HR for an exception" option is shown.
3. The server action checks, **in this order**, and stops at the first failure (recording the attempt in `attendance_events`):
   1. signed in, and the login is linked to an **active employee**;
   2. employee is assigned to this workplace and the workplace is active;
   3. action is valid: no existing open clock-in (for clock-in), and a valid open clock-in exists (for clock-out); no duplicate for today;
   4. location reading present and **accuracy ≤ the workplace limit** (else "Retry: location is too inaccurate");
   5. **distance ≤ 100 m**, computed **on the server** with the haversine formula from the stored workplace coordinates (the browser's own distance is ignored);
   6. face verification outcome (4B), see §6;
   7. the timestamp is the **database server time**, never the phone's time.
4. Only if every check passes does the server call a database function that inserts/updates the attendance row **and** the event row in one transaction.
5. The employee sees one of: **Recorded**, **Retry required** (with the reason), or **Not recorded** (with the reason and the exception option). If the network fails the page says **"Not recorded: nothing was saved"**. There is **no offline queue** (no silent "pending" attendance).

**Why a server action plus a restricted database function:** the function that writes attendance will be executable **only by the server's service role**, not by logged-in users, so a user cannot call it directly with a faked "face verified" value. (proposed; the service key stays on the server only)

### 4.1 Exceptions (HR-approved alternative)
Device failure, phone without GPS, off-site duty: the employee (or a manager on their behalf) files a **correction request** with a reason. HR reviews and approves/rejects. Approval writes the record with `source = hr_exception`, the approver, the reason and the timestamp. **HR cannot approve their own request**; a second authorised person is required (policy decision D9 below if there is only one HR person). Everything goes to `audit_log`.

---

## 5. GPS: what 100 m can and cannot prove

- Server-side haversine against the stored workplace coordinates; reject over 100 m; reject if accuracy is worse than the limit; reject if permission is denied or no reading arrives.
- **Limits (be clear with management):** the coordinates come from the phone. A mock-location app or a rooted phone can send false coordinates, and a **web app cannot reliably detect that**. GPS therefore shows "the phone *claimed* to be within 100 m", not proof of presence.
- **Practical mitigations (reduce, do not eliminate):** accuracy limit; server time only; every attempt logged (including rejected ones) so unusual patterns can be reviewed; flag impossible jumps between two clock events for HR review; (4B) the live face check must succeed at the same moment. No background tracking and no continuous location collection. Location is read **only when the employee taps the button**.

---

## 6. Face verification: honest assessment

**Detection is not verification.** Opening the camera or finding a face proves nothing about *who* it is. Genuine verification means: (1) an authorised enrolment with consent, (2) at each clock event a **liveness** check (a live person, not a photo or screen), and (3) a **match** of that live face against the enrolled one.

| Option | What it gives | Cost / conditions | Concerns |
|---|---|---|---|
| **A. AWS Rekognition Face Liveness + CompareFaces** | Provider-run liveness and matching. (Whether a ready-made web liveness component fits this app is unverified.) | **Pay per check. I could not retrieve the current per-check price** (unverified); CompareFaces is priced per image in tiers (sources disagree on tier limits). Billed per liveness request, reportedly whether it passes or fails (unverified, old community answer). **Regional availability for Singapore not verified.** Needs an AWS account (a new vendor, new integration). | Face images go to AWS (overseas processing); a data-processing agreement and your consent wording are needed. |
| **B. Azure AI Face** | Verification + liveness SDKs. | Verification and liveness are **gated by a Microsoft review (intake form)**; approval is not guaranteed. Paid. | Same overseas-processing issue; approval risk and delay. |
| **C. Open-source, in the browser / our server** | No per-check fee. Can compute a face match. | Free, but **no genuine liveness**. A photo or a video on a screen can fool it. More engineering and testing. | I would label results only as "match (unverified liveness)" and send low-confidence cases to Manual Review. I would **not** call this "verified". |
| **D. No face check** | Simplest. | None. | Does not meet your stated requirement. |

**Recommendation:** build **4A now** (no face provider). In **4B**, integrate Option A *after* you approve its cost and I have verified price and region from AWS's own pages, and after the consent wording is ready. Until then the page shows **"Face verification: setup required"**, and the attendance rule follows decision D2. **Nothing will be marked "Verified" unless a real provider confirmed it.**

**Outcomes the system will store (proposed):** `verified`, `failed`, `retry_required`, `manual_review`, `provider_unavailable`, `not_configured`. `provider_unavailable` and `not_configured` can never become `verified`.

**What we store (proposed):** the outcome, a score, and the provider's session reference. **The live capture is not kept** after the check. The enrolment reference photo/template exists only with signed consent, is not readable by the browser, is not shown on any employee screen, and is deleted on resignation or withdrawal of consent (retention is for confirmation).

---

## 7. Roles, isolation, RLS, audit (proposed)

| Data | Employee | Dept Manager | HR Admin | Director | Finance | Super Admin |
|---|---|---|---|---|---|---|
| Own attendance records | read | n/a | n/a | n/a | n/a | n/a |
| Team attendance | none | read (own dept/reports) | read (company) | read (company) | none | read |
| Write attendance | **none** (server function only) | none | exceptions/corrections | none | none | via exceptions |
| `attendance_events` (attempts, scores) | none | none | read (company) | none | none | read |
| Workplaces & assignments | read own | read | **manage** | read | none | manage |
| Face enrolment data | consent only | none | status only | none | none | none |
| Corrections | request / see own | request for team | approve (not own) | none | none | approve |

- Company isolation: every table carries `company_id`; policies use the helper functions from migration 0001; cross-company reads return nothing (tested the same way as Phase 3).
- Audit: every attendance row change, correction decision and workplace change writes `audit_log` (column names only, never coordinates or images).
- Tighten later (proposed): once a correction function exists, direct HR edits of attendance rows are replaced by "correct with a reason".

---

## 8. Privacy protections (proposed; for legal review)

- **Location** is personal data: collected only at the moment of clock-in/out; stored with the attendance event; never tracked in the background; visible only to the roles in §7.
- **Face data is biometric**, which I understand to be **sensitive personal data under Malaysia's PDPA**: it needs explicit consent, a stated purpose, limited retention, restricted access and a breach process. **This is a technical note, not legal advice. Please have a qualified adviser confirm.**
- Private storage only; no public URLs; no biometric data in logs or notifications; no face data in exports.
- **Retention (proposals for approval):** GPS/event records: [PENDING: suggest tied to attendance record retention]; enrolment reference: until resignation + short grace or consent withdrawal; live captures: not retained.

---

## 9. Dependencies, costs, risks

**Dependencies:** employees' logins linked to employee records (HR step; none linked today); workplace coordinates (D5); schedule data (D6); HTTPS (Vercel serves HTTPS by default, but I have not checked the live site; browsers only give GPS/camera over HTTPS or localhost); (4B) provider account, consent text, approved cost.

**Costs:** 4A: none beyond existing Supabase/Vercel. 4B: provider fees per check (amount **unverified**), possible Microsoft approval wait.

**Risks:** GPS spoofing (cannot be fully prevented); face spoofing (Option C is weak); indoor GPS inaccuracy causing rejections (mitigated by the exception path); employees without smartphones; shared devices; the single-HR-person problem for approving exceptions; legal/privacy requirements unconfirmed.

---

## 10. Test plan (what I would run; nothing is run yet)

Database-level (sandbox, synthetic users), then browser-level by you using a checklist:
1. Valid clock-in then clock-out; times are server times; one row per day.
2. Duplicate clock-in blocked; clock-out without clock-in blocked; second clock-out blocked.
3. Inside 100 m accepted; at 100 m edge; 101 m rejected (computed server-side; test uses known coordinate pairs).
4. Accuracy worse than the limit rejected; missing/denied location rejected.
5. A request that sends a **faked distance or timestamp** is ignored (server recomputes); a direct database insert by an employee is refused.
6. Employee not assigned to the workplace is rejected; inactive workplace rejected; other company's workplace rejected.
7. Correction request: employee cannot approve own; HR can; audit rows exist; unauthorised users see nothing.
8. RLS matrix in §7 for all roles, cross-company read = 0.
9. `radius_m <> 100` is refused by the database; invalid coordinates refused.
10. 4B only: provider unavailable never becomes `verified`; face mismatch rejected; liveness failure rejected; **spoof attempts reported as they actually come out**.
11. Mobile layout; permission-denied recovery; network failure shows "Not recorded".

## 11. Acceptance criteria
All of §10 items 1–9 and 11 pass in the sandbox with recorded evidence; owner browser checklist has no open Critical/High; no secret or biometric data in logs; production unchanged until separate approval. 4B additionally: price/region verified, consent in place, spoof tests reported honestly.

## 12. Rollback plan
New tables and columns are additive: rollback = drop the new tables and added columns (data written after go-live would be lost, so export first). The old `check_in/check_out` columns and the driver module are untouched, so reverting the app code restores today's behaviour. No production change without a separate approval, a **verified manual backup** (the project is on the free plan with no automatic backups), and the step-by-step plan like the Phase 3 one.

## 13. Proposed order of work (after approval)
1. Migration + helper functions in the **sandbox** only; tests 1–9.
2. Workplace settings screen (HR/Super Admin); assign employees.
3. Employee clock-in page (mobile first); attendance dashboard for HR/manager; corrections.
4. Browser checklist for you; fixes.
5. Separate approval for production, then 4B (face) as its own report.

**Open policy question D9:** who approves an attendance exception when HR is a single person? (a second HR/Director, or allow HR self-approval with an extra audit flag?).
