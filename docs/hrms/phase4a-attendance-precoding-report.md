# Phase 4A: Attendance Foundation. Pre-Coding Report

Version 2 · Date 2026-10-10 · Supersedes the earlier combined Phase 4 report (`phase4-attendance-precoding-report.md`) for the 4A scope.
Status: **FOR REVIEW. NO PHASE 4 CODE, MIGRATION, PRODUCTION CHANGE OR DEPLOYMENT HAS BEEN DONE.**
Companion documents: [face-verification-provider-comparison.md](face-verification-provider-comparison.md) (Phase 4B input) · [retention-matrix.md](retention-matrix.md)

Legend: **CONFIRMED** = decided by the owner · **PENDING** = needs management approval · **(verified)** / **(unverified)** = how I know a fact.

---

## 1. Confirmed decisions vs. pending approvals

### 1.1 CONFIRMED by the owner
| ID | Decision |
|---|---|
| D1 | Split into **4A** (foundation, clock-in/out, server validation, GPS, permissions, audit, exceptions) and **4B** (face verification + liveness + provider). Face verification is **not claimed operational** until a provider is integrated and tested. |
| D2 | Do not block attendance during development; **staging** may test clock-in with synthetic data. In **production**, an unverified face is never silently treated as verified. If a temporary manual-review process is later approved, it is recorded explicitly as **"Face not verified — manual review required"**, kept separate from verified attendance, flagged for authorised review and audited. **That production fallback stays disabled until its approval workflow and safeguards are implemented and approved.** |
| D3 | No provider selected or purchased. A comparison is prepared (separate document). No account, purchase, or employee data sent to any provider until approved. |
| D4 | **GPS accuracy threshold: 50 m** (initial, for staging tests, subject to validation). **Geofence radius: 100 m.** Both checked **on the server**. Insufficient accuracy → clear retry/manual-review message, never a false "present". GPS is not proof of identity and not impossible to spoof. **Not enabled in production until tested on real supported devices and approved.** |
| D5 | No invented coordinates. A configuration structure lets an authorised administrator enter and verify company, workplace name and address, latitude/longitude, radius, effective date and authorised approver. **Stays unconfigured** until management confirms the real work locations. Multiple workplaces supported. My location or an estimate is never used. |
| D6 | Working hours **unconfigured**. Configurable structure for working days, start/end, breaks, shifts, grace and late rules, overtime rules, effective dates and approval history. No assumptions applied to production. |
| D7 | No invented retention periods. A retention matrix with legal basis, flagged for a Malaysian legal adviser (separate document). |
| D8 | The **existing driver clock-in is left unchanged**. Any future integration is proposed separately and approved first. |
| D9 | Exceptions: configurable approval roles for a four-person team; employees cannot approve their own; HR reviews/recommends; manager/director gives final approval when needed; escalation to the authorised director; full audit; **no auto-approval ever**. |
| — | Retention policy is **configurable**; **no automatic deletion** of production data until a policy is approved. |

### 1.2 PENDING management approval (nothing below is assumed)
| # | Item |
|---|---|
| P1 | The actual workplace names, addresses and coordinates for each company, plus who verifies and approves them. |
| P2 | The approved working schedules, grace rules, breaks, shifts, rest days, overtime rules. |
| P3 | Retention periods (see retention matrix) and the deletion/anonymisation procedure. |
| P4 | The face-verification provider (4B), its cost, data-processing terms and consent wording. |
| P5 | Whether the production "face not verified: manual review" fallback is ever used, and its safeguards. |
| P6 | The identities and designations of the four team members (HR reviewer, designated manager, director/escalation, Super Admin). I do not assume them. |
| P7 | Whether the 100 m radius may ever differ per workplace (in 4A it is fixed at exactly 100). |
| P8 | Whether an independent HR reviewer may give the **final** approval alone (`reviewer_may_finalise`), or a second person always decides. Safer default proposed: second person. |
| P9 | Whether HR may edit attendance rows directly, or only through a correction that records a reason (proposed: corrections only). |
| P10 | Legal review items (see §12): biometric consent, cross-border processing, data residency of payroll/attendance records, retention. |
| P11 | Real-device testing on the phones actually used by staff, then production enablement per company. |
| P12 | Whether and how the driver clock-in is later brought into the new module (separate proposal). |

---

## 2. Existing implementation (verified by reading code and the live schema)

**HR table `attendance_records`:** time-of-day only (`check_in`, `check_out`), status, notes; unique per employee per day; **0 rows in production**; nothing writes to it. After the approved migration 0004 (written, not applied): readable by scope, writable only by HR.

**Driver clock-in (separate, in use, 18 driver profiles, 0 attendance rows):**
- Tables: `driver_attendance`, `driver_profiles` (approved coordinates, expected clock-in time), generic `task_audit_log`, `documents` bucket (selfie upload).
- Code: `src/lib/driverAttendance/{actions,geo,queries,date}.ts`, `src/components/driver/{ClockInOutWidget,AttendanceCorrectionAction}.tsx`, `driver-logistics/attendance` and `/dashboard` pages.
- Behaviour: selfie file input (front camera) stored but **never compared to anyone**; browser sends coordinates; server computes distance; **5 km** limit; no accuracy recorded; server timestamp; one row per day.
- **Dependencies to protect (D8):**
  1. `src/lib/driverAttendance/date.ts` (`todayInMalaysia`, `malaysiaMonthNow`) is **imported by HR overtime actions, finance payment actions/pages and a finance report**. 4A will **import** it where useful and will **not edit, move or rename** it.
  2. The home dashboard (`lib/queries/dashboard.ts`) reads `driver_attendance` for "missing clock-in/out" alerts.
  3. Shared tables: `employees`, `documents`, `task_audit_log`. 4A adds new tables only.
- **Existing gap (not touched, flagged):** policies on `driver_attendance` allow any user of the company to insert/update any row; the app restricts it, the database does not. Left unchanged per D8; to be proposed separately.

**Other facts:** 68 employees, none linked to a login yet; no workplace table; no schedule table; no face-verification code anywhere.

---

## 3. Proposed database changes (migration `…0005_attendance_4a.sql`: **not written**)

All additive. Nothing existing is dropped, renamed or rewritten. Driver tables untouched.

### 3.1 Configuration (all start EMPTY / UNCONFIGURED)
| Table | Purpose and key fields |
|---|---|
| `workplaces` | Identity only: `company_id, name, address, is_active`. |
| `workplace_geofence_versions` | **Effective-dated settings, one row per version:** `workplace_id, latitude, longitude, radius_m (fixed 100 by CHECK in 4A), max_accuracy_m (default 50), effective_from, effective_to, status (draft / pending_approval / active / retired), entered_by, verified_by, verification_note, approved_by, approved_at, change_reason`. CHECKs: latitude −90..90, longitude −180..180. **A workplace with no `active` approved version cannot accept clock-ins** (the app shows "Workplace not configured"). Past versions are never overwritten, so each attendance event points to the exact version used. |
| `employee_workplaces` | Which employee may clock in at which workplace (`employee_id, workplace_id, effective_from/to`). Supports several sites. |
| `work_schedules` | `company_id, name, status, effective_from/to, approved_by, approved_at`. |
| `work_schedule_days` | `schedule_id, weekday, start_time, end_time, is_rest_day, crosses_midnight`. |
| `work_schedule_breaks` | `schedule_id, weekday, start, end, is_paid`. |
| `schedule_assignments` | Assign a schedule to a company, department or employee, effective-dated, with priority (employee > department > company). |
| `attendance_rules` | Per company, effective-dated, approved: `grace_minutes, late_after_minutes, early_leave_before_minutes, missing_clockout_after_hours, overtime_threshold_minutes`. **Every field NULL until management supplies it; NULL means "rule not set: nothing is calculated".** |
| `attendance_settings` | Per company switches, **all default OFF**: `clock_in_enabled`, `allow_unverified_fallback` (D2), `reviewer_may_finalise` (P8). Turning one on records who/when (approval). |

### 3.2 Records
| Table / change | Purpose and key fields |
|---|---|
| `attendance_records` (extend) | Add `clock_in_at`, `clock_out_at` (timestamptz), `workplace_id`, `geofence_version_id`, `schedule_id` (the schedule that applied, if any), in/out latitude, longitude, accuracy_m, distance_m, `location_status_in/out` (accepted / retry_accuracy / rejected_distance / denied, **separate from face**), `face_status_in/out` (default `not_configured`; a pass in one never covers a failure in the other), `source` (`clock` / `exception` / `hr_correction` / `import`), `exception_id`, `late_minutes` (only when a rule exists). Old `check_in/check_out` kept. |
| `attendance_events` | **One row per attempt, including rejected ones:** `employee_id, company_id, action, outcome, reject_reason, idempotency_key, workplace_id, geofence_version_id, latitude, longitude, accuracy_m, distance_m, face_status, server_time, user_agent`. Server-only writes; no image data. |
| `attendance_exceptions` | See §6. |
| `attendance_exception_events` | Step-by-step history of each exception (actor, role, action, comment, timestamp). Append-only. |
| `attendance_approval_roles` | Who may review / finally approve / escalate, per company (§6). |
| `retention_policies` | `company_id, data_category, retention_months NULL, action (review / anonymise / delete), is_active DEFAULT false, approved_by, approved_at`. **No scheduled deletion exists.** See §9. |

### 3.3 Functions (server-callable; no front-end writes)
- `haversine_m(lat1, lon1, lat2, lon2)`: distance in metres (SQL).
- `record_attendance(...)`: the **only** code path that writes clock events. **Executable only by the server's service role**, so a logged-in user cannot call it directly with invented values.
- `request_attendance_exception`, `review_attendance_exception`, `decide_attendance_exception`: enforce §6 inside the database.
- `retention_candidates(...)`: **read-only report** of records past an approved period; never deletes.

---

## 4. Clock-in / clock-out workflow (4A)

Browser: shows server time, workplace, status lights; asks for location **only when the button is tapped**; sends `{action, workplaceId, latitude, longitude, accuracyM, idempotencyKey}`. It never writes attendance.

Server action `recordAttendance` → validation (§5) → database function `record_attendance` (one transaction, row lock) with these checks **in order**, stopping at the first failure and logging the attempt in `attendance_events`:

1. Signed in; login linked to an **active employee** of that company.
2. Company switch `clock_in_enabled` is on (**off in production by default**).
3. Employee assigned to this workplace; workplace active; an **active approved geofence version** exists (else "Workplace not configured").
4. Valid action: **clock-in** refused if any open record exists (including an unclosed one from an earlier day → "You have an open clock-in from <date>: request a correction"); **clock-out** requires an open clock-in (looked up by open status, so night shifts work) and no clock-out yet; duplicates refused.
5. Location present; **reported accuracy ≤ `max_accuracy_m` (50 m)**; else **"Retry: location accuracy is too low (reported X m, limit 50 m)"** + manual-exception option. Never recorded as present.
6. **Distance ≤ 100 m**, recomputed in the database from the stored workplace coordinates (client-sent distance/time are ignored).
7. Face status: in 4A there is no provider, so `face_status = not_configured`. Behaviour by environment (D2): **staging/synthetic** → accepted and clearly labelled "face not verified (staging)"; **production** → follows P5 (default: clock-in **not available** until the approved fallback or 4B exists).
8. Time = **database `now()`**; `work_date` = Malaysia date of the clock-in (timezone stored per workplace, default `Asia/Kuala_Lumpur`).
9. Idempotency: the same `idempotencyKey` returns the original result (no double rows on a flaky network).

Employee sees one of: **Recorded**, **Retry required** (reason), **Not recorded** (reason + exception option). Network failure shows **"Not recorded: nothing was saved"**. **No offline queue.** No background tracking.

---

## 5. API / server-side validation

- Allow-list of fields; reject unknown fields. `action ∈ {clock_in, clock_out}`; `workplaceId` uuid; `latitude` finite −90..90; `longitude` finite −180..180; `accuracyM` finite ≥ 0 and ≤ 10,000; `idempotencyKey` uuid.
- User identity comes **only** from the signed-in session, never from the request body. The employee is derived from the login link.
- Phone clock/time sent by the client is **ignored** (stored only for diagnostics, never used for the record).
- Rate limit (proposed): at most 10 attempts per user per minute, counted from `attendance_events`, to stop location-probing.
- Errors return a result object (`{ok:false, error}`), not a thrown error, so the real reason is shown in production.
- Logs contain **no coordinates, no names, no secrets**; the event table (RLS-protected) holds the details.

---

## 6. Exception workflow (D9: works with one HR person)

**Purpose:** device failure, no signal, off-site duty, forgotten clock-out, or "Retry required" cases.

**States:** `requested → under_review → recommended → approved / rejected`, plus `escalated`, `cancelled` (by requester only, before a decision). **There is no timeout state that approves anything.** If nobody eligible is available the request stays `escalated` and is shown to the Super Admin / director with reminders; it **never auto-approves**.

**Roles are configuration, not code** (table `attendance_approval_roles`: `company_id, user_id, designation, is_active, approved_by`). Designations: `reviewer` (HR), `final_approver` (designated manager), `escalation_approver` (authorised director). One person may hold several, but the rules below still apply.

**Eligibility rules (enforced in the database, in this order):**
1. The **requester can never be the reviewer or approver** of their own request, and the **subject employee** (whose attendance it is) cannot decide it either.
2. The **HR reviewer** reviews and records a **recommendation** (approve / reject / need more information) with a comment.
3. The **final decision** is taken by a `final_approver` who is not the requester/subject. If the reviewer is independent and `reviewer_may_finalise = true` (P8, default **false**), the reviewer's own decision may be final; otherwise a second person decides.
4. If the HR reviewer **is** the requester/subject, HR is excluded and the request goes to the designated manager or director.
5. If the manager and HR are the **same person**, or no eligible independent approver exists, it is **escalated to the authorised director** (`escalation_approver`). If the director is also the requester, it stays `escalated` for the Super Admin: no one can approve their own.
6. Every step is written to `attendance_exception_events` (who, in which role, what, when, comment) and to `audit_log`.
7. Approval writes or updates the attendance record with `source = exception`, the approver, the reason and the exception id; it is shown separately from automatic clock-ins in reports.

**Proposed designation matrix for a four-person team (PENDING P6: identities are NOT assumed):**

| Placeholder | Proposed designation(s) for management to confirm | Can request own exception | Can review / recommend | Can give final approval | Escalation |
|---|---|---|---|---|---|
| Person 1 | `reviewer` (HR/Admin) | Yes (decided by others) | Yes, not own | Only if P8 allows, never own | No |
| Person 2 | `final_approver` (designated manager) | Yes (decided by others) | No | Yes, not own, not where conflicted | No |
| Person 3 | `escalation_approver` (authorised director) | Yes (decided by others) | No | Yes (when escalated), not own | Yes |
| Person 4 | Super Admin / no approval role | Yes | No | No | Sees unassigned `escalated` requests |

If two designations fall on one person, rule 5 escalates instead of letting that person approve alone.

---

## 7. Roles, isolation, RLS and audit (proposed policies)

| Table | Employee | Dept Manager | HR Admin | Director | Finance | Super Admin |
|---|---|---|---|---|---|---|
| `attendance_records` | read own | read own dept/reports | read company; **write only through corrections (P9)** | read | none | read |
| `attendance_events` | none | none | read company | none | none | read |
| Workplaces / geofence versions | read own workplace | read | enter + verify | read; **approve (designated)** | none | manage |
| Schedules / rules / settings | read own | read | enter | approve (designated) | none | manage |
| Exceptions | create + read own | create for team; read team | review + recommend | decide / escalate (designated) | none | read; sees unassigned |
| `retention_policies` | none | none | draft | approve (designated) | none | manage |

- Company isolation via `company_id` and the existing helper functions; cross-company reads return nothing.
- Two-person control for configuration: the person who **enters** a geofence/schedule is not the one who **approves** it.
- Audit triggers on every table above record who changed which columns, when (never values such as coordinates).
- The functions in §3.3 are **not** executable by logged-in users except the exception functions, which re-check the roles internally.

---

## 8. Privacy (4A)
- Location is read only on tap, stored with the event, visible only to the roles above, never tracked in the background; no images in 4A at all.
- Face images/biometrics are **out of scope for 4A**; 4B only after provider approval and consent (see comparison document).
- No biometric or location data in logs, notifications, exports or error messages.

## 9. Retention (configurable, nothing deleted automatically)
`retention_policies` rows start empty and inactive. A policy takes effect only after an approver is recorded. Even then, 4A provides only a **read-only candidate report**; any purge is a separate, manually run, approved procedure with a backup first. Proposed periods are in [retention-matrix.md](retention-matrix.md), all marked **PENDING**.

## 10. Test cases (to be run in the sandbox with synthetic users; none run yet)
1. Valid clock-in/out: server time; one record per day; correct employee/company/workplace/version.
2. Duplicate clock-in blocked; clock-out without open clock-in blocked; second clock-out blocked; unclosed record from yesterday blocks a new clock-in and points to correction; night shift clock-out next day works.
3. Distance: inside, at the edge, just outside 100 m using known coordinate pairs; **database result equals an independent haversine reference**.
4. Accuracy 49 m accepted; 51 m rejected with the retry message; missing/denied location rejected.
5. Faked client values (distance, time, employee id, company id, workplace of another company) are ignored/rejected; an employee **direct insert into the attendance tables is refused**; calling `record_attendance` as a logged-in user is refused.
6. Employee not assigned to the workplace, inactive workplace, no active geofence version, `clock_in_enabled = off` → clear refusal; every refusal is logged in `attendance_events`.
7. Idempotency key replay returns the original result without a second row; concurrent double-tap yields one record.
8. Exceptions: requester cannot approve own; subject cannot approve; HR-as-requester routes to manager/director; manager = HR escalates to director; none eligible stays `escalated` and **never** approves; no timeout approval; each step audited; cancelled request cannot be decided.
9. RLS matrix in §7 for every role; cross-company read = 0; Finance sees nothing.
10. Config safety: radius ≠ 100 refused; invalid coordinates refused; effective-dated versions keep history; unapproved version cannot accept clock-ins; entering and approving by the same person refused.
11. Schedules: nothing is calculated while rules are NULL; once a rule exists, `late_minutes` uses the version effective on that date.
12. Driver module regression: driver clock-in/out, corrections and home-dashboard alerts behave exactly as before (code untouched, tables untouched).
13. Owner browser checklist on phones (mobile layout, permission-denied recovery, network failure message).
14. Production-enablement gate: nothing is switched on without P1, P2 as needed, P11 and written approval.

## 11. Acceptance criteria and rollback
**Acceptance (4A):** items 1–12 pass with recorded evidence in the sandbox; no Critical/High findings open after the owner checklist; no secrets, coordinates or personal data in logs; production unchanged until a separate approval; `clock_in_enabled` off in every production company until P1/P11 are done and approved. 4B, face status stays `not_configured` and the UI says "Face verification: setup required".

**Rollback:** all changes are additive. Rollback script = drop the new tables/columns/functions (the old `check_in/check_out` columns, driver tables and driver code are untouched). **Data written after go-live would be lost on rollback**, so export first. Never restore an old backup over production. Production needs: a verified manual backup (the project is on the free plan with no automatic backups), a conflict check, a sandbox rehearsal **including the rollback script run in a rolled-back transaction**, and the owner's explicit approval, exactly as for Phase 3.

## 12. Legal / policy items for a qualified Malaysian adviser (P10)
Biometric data became **sensitive personal data** under the amended PDPA from 1 April 2025 (explicit consent and safeguards); cross-border transfer rules changed on 1 April 2025; data-protection-officer and breach-notification duties from 1 June 2025; HR/payroll records may carry statutory retention and **in-Malaysia retention** expectations while the Supabase project is hosted in **Singapore**. Details and sources are in the retention matrix. **This is a technical summary, not legal advice.**

## 13. Order of work (after approval)
1. Migration + functions in the **sandbox** only; test cases 1–12 with a rolled-back rollback rehearsal.
2. Settings screens (workplaces, geofence versions with approval, schedules, rules, designations, switches), all showing "not configured".
3. Employee clock-in page (mobile first), HR/manager dashboard, exception screens.
4. Owner browser checklist; fixes.
5. Separate approval + verified backup before anything reaches production; then real-device testing (P11).
