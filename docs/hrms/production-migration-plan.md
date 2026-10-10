# Production Migration Plan: Employee Management + Leave/Attendance rules

Version 1 · Status: **PROPOSED. NOT APPROVED. NOTHING HAS BEEN APPLIED TO PRODUCTION.**
Target (when approved): Supabase project `central-management-system` (ref `cnnztwzzrwnuukehntcn`)
Tested on: throwaway project `hrms-test-sandbox` (ref `dngvcoauvmzetlqjyont`), synthetic data only.

Migration files (in `supabase/migrations/`, branch `feature/hrms-employee-management`):

| File | In one sentence |
|---|---|
| `20261010000001_employee_management.sql` | Adds the new departments / history / documents / audit tables and employee fields, moves restricted personal details into a protected table, and tightens who can change employee records. |
| `20261010000002_employee_events_and_payroll_rls.sql` | Adds the all-or-nothing "record employment event" function and stops ordinary users reading everyone's payroll. |
| `20261010000003_employee_ic_scrub.sql` | **Separate approval.** Removes the IC number from the company-readable `employees` table (a protected copy already exists). |
| `20261010000004_leave_attendance_integrity.sql` | Employees see only their own leave/attendance; nobody approves their own leave; no overlapping leave; employees cannot write attendance. |

---

## 1. What each migration changes (plain language)

### 0001: Employee management
**Adds (no existing data touched):**
- New tables: `departments`, `employment_history`, `employee_documents`, `audit_log`.
- New columns on `employees`: employee ID, department link, reporting manager, probation start/end, confirmation date, contract end, photo path, and an "employment stage" (probation / confirmed).
- New columns on `user_company_access`: `hr_role` (HR Admin / Director / Finance) and `department_scope`.
- New columns on `employee_private_details`: IC/passport, residential address, emergency contact.
- New private storage bucket `hr-documents` (10 MB limit; PDF/JPG/PNG/DOCX only).
- New helper functions (HR Admin, Director, Finance, "manages this employee") and an audit trigger.

**Changes existing behaviour:**
- `employees` can now be **created and edited only by an HR Admin** of that company (before: anyone with access to the company). Reading the directory is unchanged.
- The 4 helper functions flagged by the Supabase security advisor can no longer be called by logged-out visitors; three trigger functions get a fixed search path.
- `employees.status` gets a rule: only `active`, `resigned`, `terminated`, `inactive`. (Production check on 2026-10-10: all 68 rows are `active`, so none violates it.)

**Data it writes:** creates 4 departments from the existing text (Signature Solution 2, Kasturi Indah 1, 02Life 1), links employees to them, and **copies** the 50 existing IC numbers into the protected table. The original IC column is **not** cleared by this migration.

### 0002: Employment events + payroll visibility
- Adds function `hr_record_employment_event` (confirm / probation review / resign / terminate / activate in one transaction with its history row).
- Payroll: replaces the old "anyone with the HR module in the company can read and edit all payroll" rule. New rule: **HR Admin and Finance can read; HR Admin can write; an employee sees only their own *paid* record.**

### 0003: IC scrub (applies only after the new app is deployed and checked)
Sets `employees.ic_passport_no` to empty **only where an identical copy already exists** in the protected table. Reversible from that copy (see rollback).

### 0004: Leave and attendance rules
- Leave: employees see only their own; managers only their authorised employees; HR their company; Directors read. Nobody can approve/reject **their own** leave; a decided request is final and cannot be edited; overlapping pending/approved leave is refused; dates and days are validated; the shared `approvals` row follows the same rule.
- Attendance: read by the same scopes; **only HR Admin can add/correct** attendance rows (employees can no longer write their own times). One record per employee per day already existed.
- Both tables are added to the audit log.
- Production has **0** leave and **0** attendance rows, so no existing data can conflict.

## 2. Conflict check against production (read-only, 2026-10-10)

| Check | Result |
|---|---|
| New table names already used? | None |
| New column names already used (employees / access / private details)? | None |
| New function names already used? | None |
| Views depending on `employees`? | None |
| Tables referencing `employees` (not affected: columns are only added) | 12: attendance_records, deliveries, driver_attendance, driver_expenses, driver_profiles, employee_certificates, employee_private_details, event_staff, leave_requests, overtime_records, payroll_records, petty_cash_transactions |
| Existing triggers on `employees` | `employees_guard_login_link` (kept) |
| `employees.status` values in use | `active` = 68 |
| Department spellings that would merge | 0 |
| `hr-documents` bucket already exists? | No |
| Leave/attendance rows that could violate new rules | 0 / 0 |

## 3. Things users will notice after the migrations (behaviour changes)

1. **Existing "Department Manager" login** (verified 2026-10-10): access to **all companies**, but only the modules `catering, driver-logistics, kitchen, overtime`: **not HR**. It never had leave, attendance, history or payroll access, so these migrations change nothing for it. Overtime approval keeps working (that rule is unchanged). Its company/department scope is still to be decided by the owner (see the Phase 4 report and the chat summary). It is not linked to any employee record.
2. The existing **Company Admin** login keeps working (treated as HR Admin).
3. Payroll was already hidden from the Dept Manager login by its module restriction; the new payroll rule adds a second, database-level barrier.
4. Employees can no longer edit anything in `employees` (they never could in the app; now the database agrees).
5. Old app code (currently live) still works against the new schema for the Company Admin: all changes are additive. That is why migrate-then-deploy is safe in this order.

## 4. Test results (sandbox, executed, synthetic data)

| Area | Result |
|---|---|
| Role access to employees / restricted details / history / audit (7 roles) | PASS |
| Storage: own visible letter yes, HR-only letter no, other company no, upload HR-only, logged-out none | PASS |
| Employment events (confirm, extend, resign, reactivate; blocked: self-confirm, double confirm, termination without reason, resign twice) | PASS |
| Payroll visibility (HR 3/3, Finance 3/3, Manager 0, employee own paid only, employee edits 0) | PASS |
| Leave and attendance rules: 34 checks (self-approval, overlap, decided-is-final, scope, wrong company, attendance writes, audit rows) | PASS (34/34) |
| TypeScript, ESLint, production build | PASS |
| Logged-out smoke test (HR pages, export, download redirect to login) | PASS |
| Signed-in browser tests (screens) | **NOT TESTED** (owner will run `browser-test-checklist.md`) |
| Existing modules (catering, driver, finance…) after migration | **NOT TESTED**: the sandbox does not contain those modules |
| Full replay of all 45 historical migrations into a fresh database | NOT DONE (sandbox used a faithful HR subset) |

## 5. Rollback plan and its limits

Rolling back **schema** is possible; rolling back **data written after go-live** is not (that data lives in the new tables). **Do not restore an old backup over production** after launch: it would also erase every record created since.

**Rollback of 0004** (leave/attendance rules):
```sql
drop trigger if exists leave_requests_audit on leave_requests;
drop trigger if exists attendance_records_audit on attendance_records;
drop trigger if exists approvals_guard_trigger on approvals;
drop trigger if exists leave_requests_before_write on leave_requests;
drop function if exists public.approvals_guard();
drop function if exists public.leave_before_write();
alter table leave_requests drop constraint if exists leave_requests_no_overlap, drop constraint if exists leave_requests_dates_check, drop constraint if exists leave_requests_days_check;
drop policy if exists leave_requests_select on leave_requests; drop policy if exists leave_requests_insert on leave_requests;
drop policy if exists leave_requests_update on leave_requests; drop policy if exists leave_requests_delete on leave_requests;
create policy leave_requests_all on leave_requests for all to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
drop policy if exists attendance_records_select on attendance_records; drop policy if exists attendance_records_insert on attendance_records;
drop policy if exists attendance_records_update on attendance_records; drop policy if exists attendance_records_delete on attendance_records;
create policy attendance_records_all on attendance_records for all to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
drop function if exists public.user_can_review_employee(uuid);
```

**Rollback of 0003** (put IC numbers back in `employees` from the protected copy; no data lost):
```sql
update employees e set ic_passport_no = p.ic_passport_no
from employee_private_details p where p.employee_id = e.id and e.ic_passport_no is null and p.ic_passport_no is not null;
```

**Rollback of 0002:**
```sql
drop function if exists public.hr_record_employment_event(uuid, text, date, text, text, text, date);
drop policy if exists payroll_records_select on payroll_records; drop policy if exists payroll_records_insert on payroll_records;
drop policy if exists payroll_records_update on payroll_records; drop policy if exists payroll_records_delete on payroll_records;
create policy payroll_records_all on payroll_records for all to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
```

**Rollback of 0001** (**loses** anything saved in the new tables, such as history, uploaded HR documents' records and audit rows; export them first if live):
```sql
drop trigger if exists employees_audit on employees; drop trigger if exists employee_private_details_audit on employee_private_details;
drop table if exists employee_documents, employment_history, audit_log, departments cascade;
drop policy if exists employees_insert on employees; drop policy if exists employees_update on employees;
create policy employees_insert on employees for insert to authenticated with check (public.user_has_company_access(company_id));
create policy employees_update on employees for update to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
drop policy if exists employee_private_details_hr_all on employee_private_details; drop policy if exists employee_private_details_own_select on employee_private_details;
alter table employees drop constraint if exists employees_status_check, drop constraint if exists employees_probation_dates_check, drop constraint if exists employees_not_own_manager_check;
alter table employees drop column if exists employee_no, drop column if exists department_id, drop column if exists reporting_manager_id, drop column if exists employment_stage,
  drop column if exists probation_start, drop column if exists probation_end, drop column if exists confirmation_date, drop column if exists contract_end, drop column if exists photo_path;
alter table employee_private_details drop column if exists ic_passport_no, drop column if exists residential_address, drop column if exists emergency_contact_name,
  drop column if exists emergency_contact_relationship, drop column if exists emergency_contact_phone;
alter table user_company_access drop column if exists hr_role, drop column if exists department_scope;
-- the storage rules depend on the helper functions, so they must go first:
drop policy if exists hr_documents_select on storage.objects; drop policy if exists hr_documents_insert on storage.objects;
drop policy if exists hr_documents_update on storage.objects; drop policy if exists hr_documents_delete on storage.objects;
drop function if exists public.user_is_hr_admin(uuid), public.user_is_director(uuid), public.user_is_finance(uuid), public.user_manages_employee(uuid), public.audit_row_change();
-- storage: remove the hr-documents files in the dashboard first, then:
delete from storage.buckets where id = 'hr-documents';
```
(Rolling back 0001 also requires rolling back 0002 and 0004 first; they depend on it. The script order was tested in the sandbox inside a rolled-back transaction.)

## 6. Backup status: **NOT VERIFIED**

- The Supabase organisation is on the **free plan**. To my knowledge free projects have **no automatic daily backups and no point-in-time recovery**; I cannot confirm this through my tools. **Please open the dashboard → Database → Backups and tell me what it shows.**
- I therefore have **not** verified that any backup exists, and **not** tested a restore.
- Production size: database 17 MB; 8 stored files (1.2 MB) in one private bucket; 4 login accounts. A full manual backup is small and quick.
- A database backup does **not** include uploaded files. Files must be downloaded separately.

**Manual backup the owner can make before go-live (safe procedure):**
1. Dashboard → Project Settings → Database → copy the **connection string**; keep the password to yourself.
2. In PowerShell (replace the placeholder; never paste the real string anywhere else):
```powershell
cd "C:\Users\User\OneDrive\Desktop\HRMS"
mkdir secure-backup
npx supabase db dump --db-url "PASTE_CONNECTION_STRING" -f secure-backup\schema.sql
npx supabase db dump --db-url "PASTE_CONNECTION_STRING" --data-only -f secure-backup\data.sql
```
3. Dashboard → Storage → `documents` bucket → download the 8 files into `secure-backup\files`.
4. The folder contains **real employee data**: keep it off GitHub/OneDrive-shared folders (note `Desktop` is inside OneDrive!), zip it with a password or store it on an encrypted drive.
5. **Restore test:** needs an empty Supabase project. All free slots are used (production, the inactive `sales-action-system`, and the sandbox), so the sandbox must be paused or deleted first, or the test done on a paid project. NOT TESTED.

## 7. Proposed step-by-step production deployment (awaiting your approval for each step)

1. You confirm the dashboard backup page and make the manual backup in section 6. **Gate:** you tell me it is done.
2. You complete the browser checklist; I report any FAIL. **Gate:** no open Critical/High issues.
3. I send you the final diff and these four SQL files for review. **Gate:** your written approval of 0001, 0002, 0004.
4. Apply 0001 → check (counts: 68 employees, 4 departments, 50 protected IC copies, 0 errors) → apply 0002 → check → apply 0004 → check. Run the Supabase security advisor again.
5. Merge the branch (after you approve the preview) so Vercel deploys the new code to production.
6. Verify in production with the real Company Admin login: directory loads, an employee profile opens, nothing else in the app broke (catering, drivers, finance, kitchen). Record evidence.
7. **Separate approval:** apply 0003 (IC scrub). Verify IC numbers still show for HR on the profile.
8. Fix the Department Manager access scope (company + departments) so that login regains leave/attendance visibility.

**Stop conditions:** any failed count, any error, or any broken existing page → stop and use the rollback in section 5 for that migration only.

## 8. Vercel preview: what is and is not set up
- All four Vercel environment variables (Supabase URL, publishable key, service-role key, Gemini key) are scoped to **Production only** (verified by the Vercel CLI; values were not shown). A preview deployment therefore has **no database configured** and **cannot reach production data**.
- To make a preview usable, Preview-scoped variables pointing at the **sandbox** are needed. That is a Vercel setting change and is **not done**; it needs your approval. The preview would also need the sandbox's own service key, which only you can copy from the sandbox dashboard.
- Vercel deployment status and logs could not be read: the Vercel connector is refused for the team scope (403). **Unverified.**
