# HRMS Browser Test Checklist (Employee Management + Leave/Attendance rules)

Version 1 · Status: DRAFT for the owner's manual testing · Environment: **SANDBOX only** (synthetic data)

> **Golden rule:** these tests use the **sandbox** project `hrms-test-sandbox`. Never type a test password into, or run any test against, the real `central-management-system` project or the live website.
> Never send anyone a password, OTP or secret key. You choose the test password yourself; nobody else needs to know it.

---

## Part 0: One-time setup (about 10 minutes)

### 0.1 Set a password for the 8 test accounts
The test accounts already exist in the sandbox (fake e-mail addresses ending `@example.test`; they cannot receive real mail).

1. Open the Supabase dashboard and choose the project named **hrms-test-sandbox**. (Check the project name at the top-left. It must NOT say `central-management-system`.)
2. Click **SQL Editor** → **New query**.
3. Paste this, change `CHOOSE_A_TEST_PASSWORD` to a password you invent (it only protects fake data), and click **Run**:

```sql
update auth.users
set encrypted_password = extensions.crypt('CHOOSE_A_TEST_PASSWORD', extensions.gen_salt('bf'))
where email like 'test-%@example.test';
```
4. Expected: "Success. 8 rows affected" (or similar). Keep the password to yourself.

### 0.2 Start the app on your computer
1. Open **PowerShell** and run each line (one at a time):
```powershell
cd "C:\Users\User\OneDrive\Desktop\HRMS\kasturi-catering-cms"
git switch feature/hrms-employee-management
npm run dev
```
2. Wait for `Ready` and open **http://localhost:3000/login** in Chrome.
3. The file `.env.local` already points the app at the sandbox. (Check: it contains `dngvcoauvmzetlqjyont`.)
4. **Tip:** use a separate Chrome *profile* or *Incognito window* per account, so sessions don't mix. Always **Sign out** before changing account.
5. **Do not open the home page `/`** — the sandbox does not contain the other modules' data and that page will show an error (this is expected and is NOT a bug). After login, type the address `http://localhost:3000/hr` yourself.

### 0.3 The test accounts

| Account (e-mail) | Role | Company | What it is for |
|---|---|---|---|
| `test-hr@example.test` | HR Admin (company admin) | Signature Solution | does HR work |
| `test-manager@example.test` | Department Manager | Signature Solution, Dept A | sees Dept A only |
| `test-empA@example.test` | Employee A | Signature Solution, Dept A | an ordinary employee |
| `test-empB@example.test` | Employee B | Signature Solution, Dept B | a colleague (other dept) |
| `test-empKI@example.test` | Employee | **Kasturi Indah** | an employee of another company |
| `test-finance@example.test` | Finance | Signature Solution | payroll/claims only |
| `test-director@example.test` | Director | Signature Solution | read-only management view |
| `test-superadmin@example.test` | Super Admin | all companies | system-wide |

### How to record evidence
For every test take **one screenshot** (Windows: `Win + Shift + S`) showing the page **and the address bar**. Save as `T01-pass.png`, `T01-fail.png`, etc. in a folder `Desktop\HRMS\evidence`. Write PASS / FAIL / BLOCKED in the last column. If something differs from "Expected", **that is a finding. Do not try to fix it; just record it.**

---

## Part 1: Employee Directory and search

| # | Account | Open / do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T01 | HR | Sign in → `http://localhost:3000/hr` | Page "Employee Directory". You see the buttons **Departments, Export CSV, Import, + Add Employee**. | Screenshot of whole page | |
| T02 | HR | In the search box type `TEST Employee` → **Apply** | Only employees whose name contains it are listed; the count line updates. | Screenshot | |
| T03 | HR | Choose Department **TEST Dept A** → **Apply** | Only Dept A people. Click **Clear filters** to reset. | Screenshot | |
| T04 | HR | Choose status **Probation** → **Apply** | Employees on probation only (may be empty; the empty message must read "No employees match these filters."). | Screenshot | |
| T05 | Employee A | Sign in → `/hr` | You see the list **without** the buttons Departments / Export / Import / Add. | Screenshot | |
| T06 | Employee KI (other company) | Sign in → `/hr` | You see **only Kasturi Indah people**, none of the TEST Signature Solution names. | Screenshot | |

## Part 2: Add and edit an employee (HR)

| # | Account | Do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T07 | HR | `/hr` → **+ Add Employee**. Leave everything empty → **Add Employee** | A red message: **"Full name is required."** Nothing is saved. | Screenshot | |
| T08 | HR | Fill: Name `TEST Onboard One`, Employee ID `T-001`, Department TEST Dept A, Job title `Tester`, Start date today, Email `abc` (invalid) → Add | Message **"Email address is not valid."** | Screenshot | |
| T09 | HR | Fix the email to `onboard@example.test`; set Probation start today and Probation end **yesterday** → Add | Message **"Probation end date cannot be before its start date."** | Screenshot | |
| T10 | HR | Fix probation end to a future date; Starting status **Probation**; IC `TEST-IC-0001`; Address `TEST ADDRESS`; Emergency name `TEST Contact`, phone `0123456789` → Add | You land on the new profile; status badge **Probation**. | Screenshot | |
| T11 | HR | Add another employee with the **same Employee ID `T-001`** | Message **"That employee ID is already used in this company."** | Screenshot | |
| T12 | HR | Open the new profile → tab **Employment History** | One entry "Joined". | Screenshot | |
| T13 | HR | Profile → **Edit** → change Job title to `Senior Tester` → Save Changes | Profile shows the new title. | Screenshot | |
| T14 | HR | Edit → Reporting manager: pick the **employee itself** | It must not be offered in the list. (An employee cannot report to themselves.) | Screenshot | |

## Part 3: Employment events (HR). Every one asks for confirmation

Use the employee **TEST Onboard One** from T10.

| # | Do | Expected | Evidence | Result |
|---|---|---|---|---|
| T15 | Profile → **Probation review** → Outcome **Extend**, new end date **earlier** than the current one → Review | Message "…later than the current probation end date." | Screenshot | |
| T16 | Same dialog with a **later** date → Review → **Confirm and save** | A confirmation box first ("You are about to record…"), then the page refreshes with the new probation end. History shows "Probation review — Extended". | 2 screenshots (confirm box, history) | |
| T17 | **Confirm employment** → Review → Confirm and save | Badge changes to **Confirmed**; history shows "Confirmed". The button **Confirm employment** disappears. | Screenshot | |
| T18 | **Record termination** with an **empty reason** → Review | Message "A reason is required." | Screenshot | |
| T19 | **Record resignation** (any date) → Review → Confirm and save | Badge **Resigned**; history shows the resignation; only **Reactivate** is offered. | Screenshot | |
| T20 | **Reactivate** (reason `TEST rehire`) | Badge returns to **Active/Confirmed**; history shows the status change. | Screenshot | |

## Part 4: Restricted details (IC, address, emergency, bank)

| # | Account | Do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T21 | HR | Open **TEST Employee A** → tab **Contact & Emergency** | IC `TEST-IC-A`, address, bank shown. | Screenshot | |
| T22 | Employee A | Open **their own** profile → **Contact & Emergency** (find A in the list) | They see their **own** IC/address. | Screenshot | |
| T23 | Employee A | Open **TEST Employee B**'s profile | The tabs **Contact & Emergency, Documents, Leave, Attendance, Claims, Payroll** are **missing**; only the overview is shown. | Screenshot | |
| T24 | Employee A | Type the address `http://localhost:3000/hr/<B's id>?tab=contact` (copy B's id from B's profile address bar) | You still only see the overview. No IC or address appears. | Screenshot | |
| T25 | Manager | Open Employee A (Dept A) then Employee B (Dept B) | A: tabs include Leave & Attendance, **no** Contact/Documents/Payroll. B: **no** extra tabs. | 2 screenshots | |
| T26 | Finance | Open any employee | Tabs: overview, **Claims, Payroll**. No Contact, Leave, Documents. | Screenshot | |

## Part 5: HR documents (private files)

Use a small PDF of your own that contains **no real data** (for example a blank page saved as `test-letter.pdf`).

| # | Account | Do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T27 | HR | Employee A → **Documents** → Category Offer Letter, Title `TEST offer`, choose the PDF, tick "The employee can view this document" → Upload | "Document uploaded." appears in the list. | Screenshot | |
| T28 | HR | Upload a second one, **untick** the visible box, title `TEST warning` | Listed with the label **HR only**. | Screenshot | |
| T29 | HR | Try a `.exe`/`.zip` or a file over 10 MB | A red message about file type / size. Nothing uploaded. | Screenshot | |
| T30 | HR | Click **Download** on `TEST offer` | The PDF downloads. | Screenshot of the file | |
| T31 | Employee A | Own profile → **Documents** | **Only `TEST offer`** is listed (no HR-only warning). **Download** works. | Screenshot | |
| T32 | Employee B | Copy the download address of A's document (from HR's session) and open it while signed in as B | "Document not found." No file. | Screenshot | |
| T33 | (signed out) | Open that same download address in a private window | You are sent to the login page. No file. | Screenshot | |
| T34 | HR | **Delete** `TEST warning` | A confirmation box ("Delete this document?"), then it disappears from the list. | 2 screenshots | |

## Part 6: Departments

| # | Account | Do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T35 | HR | `/hr` → **Departments** | One card per company you manage, with that company's departments. | Screenshot | |
| T36 | HR | Add department `TEST Dept C` | Message "Department added." | Screenshot | |
| T37 | HR | Add `test dept c` (same name, other letters) | "This company already has a department with that name." | Screenshot | |
| T38 | HR | **Mark inactive** → confirm | A confirmation first; the department shows **Inactive** (still in the list; nothing deleted). | Screenshot | |
| T39 | Employee A | Open `http://localhost:3000/hr/departments` | A message that only HR can manage departments. | Screenshot | |

## Part 7: Export

| # | Account | Do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T40 | HR | `/hr` → **Export CSV** | A file `employees-<date>.csv` downloads. Open it: columns are only **Employee ID, Name, Company, Department, Job Title, Employment Type, Status, Start Date**. **No IC, no address, no bank, no salary.** | Screenshot of the opened file | |
| T41 | Employee A | Open `http://localhost:3000/hr/export` | "You are not allowed to export employee records." | Screenshot | |

## Part 8: Leave and attendance rules (the approved fixes)

These need leave requests. Create them from the **HR** account: open an employee → tab **Leave Summary** → **+ Request**.

| # | Account | Do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T42 | HR | Employee A → **+ Request** annual leave 2026-12-01 to 2026-12-05, 5 days | Created, status **Pending**. | Screenshot | |
| T43 | HR | Same employee, overlapping dates 2026-12-03 to 2026-12-08 | An error; **overlapping** leave is refused. | Screenshot | |
| T44 | Employee A | `http://localhost:3000/hr/leave` | A sees **only their own** requests. The **Approve/Reject** buttons may be visible. | Screenshot | |
| T45 | Employee A | Click **Approve** on their own request | A red message: "You are not allowed to approve or reject this leave request. Reviewers cannot decide their own leave." The status stays Pending. | Screenshot | |
| T46 | Manager | `/hr/leave` | Only Dept A requests (Employee A's). None of Employee B's. | Screenshot | |
| T47 | Manager | Approve Employee A's request | Status becomes **Approved**. | Screenshot | |
| T48 | HR | Open the same request again | No Approve/Reject buttons (a decided request is final). | Screenshot | |
| T49 | Employee B | `/hr/leave` | Sees only B's own requests (none of A's). | Screenshot | |
| T50 | Employee KI | `/hr/leave` | Empty ("No leave requests yet."). | Screenshot | |
| T51 | Employee A | Open `/hr/<A's id>?tab=attendance` | Their own attendance only. There is **no way to add or edit** attendance here (employees cannot write attendance). | Screenshot | |

## Part 9: Payroll visibility

| # | Account | Do | Expected | Evidence | Result |
|---|---|---|---|---|---|
| T52 | HR | `/hr/payroll` | Payroll list is visible. | Screenshot | |
| T53 | Finance | `/hr/payroll` | Payroll list is visible. | Screenshot | |
| T54 | Manager | `/hr/payroll` | **No payroll rows** (or an empty message). | Screenshot | |
| T55 | Employee A | `/hr/payroll` | Only **their own paid** record at most. Never B's. | Screenshot | |

## Part 10: Phone layout

Press `F12` in Chrome, click the phone icon (**Toggle device toolbar**), choose **iPhone 12 Pro** (or width 390). Repeat T01, T10, T16 and T27 as HR.

| # | Check | Expected | Evidence | Result |
|---|---|---|---|---|
| T56 | The directory | Each employee is a stacked card (name first); nothing runs off the screen; buttons are easy to tap. | Screenshot | |
| T57 | The Add Employee form | One column; the keyboard-type is right (phone number shows the number pad). | Screenshot | |
| T58 | The confirmation dialogs | The box fits the screen; the buttons are reachable. | Screenshot | |
| T59 | The profile tabs | The tab strip scrolls sideways; the current tab is underlined. | Screenshot | |

---

## What to send back
Send the **evidence folder** (or just the list of test numbers with PASS/FAIL and the screenshots of any FAIL). Do **not** send passwords, keys or any real employee data.

## Known limits of this test set (so a "failure" isn't a surprise)
- The home dashboard `/` errors in the sandbox (other modules' tables are not copied). Not a bug.
- The **"Linked Login Account"** dropdown on the Edit page needs the sandbox service key in `.env.local` (optional).
- Face verification, GPS clock-in, leave balances, claims workflow, payroll runs and letters are **not built yet**, so they are not tested here.
