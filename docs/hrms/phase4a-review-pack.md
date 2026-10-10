# Phase 4A Review Pack (for management sign-off)

Version 1 · 2026-10-10 · Status: **ON HOLD. NOTHING BELOW HAS BEEN APPROVED, BUILT, MIGRATED OR DEPLOYED.**
Silence is **not** approval. Nothing proceeds without a written "APPROVED" from the owner.

Priority set by the owner: **protect existing company data, prevent unauthorised access between the three companies, and make attendance safe before implementation.**

---

## 1. The three documents (where to read them in full)

| # | Document | Purpose | Unverified items inside |
|---|---|---|---|
| 1 | `phase4a-attendance-precoding-report.md` | The 4A design: tables, rules, clock-in workflow, validation, exceptions (D9), RLS, tests, rollback. | Real-device behaviour of GPS accuracy; how a provider session maps to cost; all legal items. |
| 2 | `face-verification-provider-comparison.md` | Compare providers for 4B (face verification + liveness); recommendation. | Provider prices (not quotes); Azure Face region availability; AWS certification and opt-out details; Innov8tif hosting, price, certificates. |
| 3 | `retention-matrix.md` | Proposed retention periods and the legal references behind them. | Statute texts not read; Employment Act six-year figure (vendor blogs only); EPF/SOCSO/EIS periods; Limitation Act; whether anonymisation satisfies PDPA s.10. |

## 2. Decisions P1 to P12 (recommendations only; the decision is management's)

| # | Decision | My recommendation | Why | If APPROVED | If REJECTED | **Management decision** |
|---|---|---|---|---|---|---|
| P1 | Real workplace names, addresses and coordinates, and who verifies/approves them | Management supplies them; HR enters; a **second person verifies on site** (e.g. a map pin checked at the door, or a survey); the director approves | Wrong coordinates silently cause wrong rejections or wrong acceptances | Clock-in can be configured per workplace | Clock-in stays disabled for that company | ☐ Approve ☐ Reject ☐ Change: ____ |
| P2 | Approved working hours, grace, breaks, shifts, rest days, overtime rules per company | Supply approved schedules per company, effective-dated | I must not invent hours; companies may differ | Late/early/overtime flags become possible | Records are stored but no lateness is calculated | ☐ ☐ ☐ |
| P3 | Retention periods (matrix) | Approve the *structure* now; set the numbers **after a legal adviser reviews** | Sensitive data and statutory periods are unconfirmed | Periods become configurable policies; still **no automatic deletion** | Everything kept indefinitely, which conflicts with the PDPA "no longer than necessary" principle | ☐ ☐ ☐ |
| P4 | Face-verification provider | Authorise **information requests only** (no data sent): Microsoft access form, written statements from AWS and Innov8tif | I cannot responsibly pick without certificates, regions and terms | Facts to decide with; Microsoft approval may take time | Face verification (4B) cannot start; 4A can still proceed | ☐ ☐ ☐ |
| P5 | Production fallback "Face not verified: manual review" | **Do not enable.** Keep production clock-in off until 4B exists | An unverified face invites buddy-punching; you said it must never look verified | Production attendance possible earlier but identity is unproven | No employee clock-in in production until 4B | ☐ ☐ ☐ |
| P6 | Who the four people are and their designations | Name each person and designation in writing (reviewer, final approver, director/escalation, Super Admin) | I will not assume identities or permissions | Exceptions workflow can be configured | Exceptions cannot be configured | ☐ ☐ ☐ |
| P7 | May the 100 m radius differ per workplace? | **No** in 4A: fixed at exactly 100 m | It is your stated rule; a database check enforces it | A later approved change can allow variation | n/a | ☐ ☐ ☐ |
| P8 | May an independent HR reviewer give the final approval alone? | **No**: a second person decides | Segregation of duties | Two-person control always | Faster but one person can approve alone | ☐ ☐ ☐ |
| P9 | May HR edit attendance rows directly? | **Corrections only**, each with a reason | Every change is explained and audited | Slower fixes, clean audit trail | Direct edits possible (audited by field name only) | ☐ ☐ ☐ |
| P10 | Legal review before biometric use | **Required**: Malaysian adviser (consent wording, overseas processing, retention, hosting in Singapore, in-Malaysia record keeping) | Biometric data is sensitive personal data since 1 Apr 2025 (summaries) | Face verification can proceed with documented basis | 4B should not go to production | ☐ ☐ ☐ |
| P11 | Real-device testing before production | **Required**: test on the actual phones staff use (Android Chrome, iPhone Safari) | Indoor GPS accuracy varies; 50 m may reject valid staff | A tested accuracy limit | Risk of many false rejections | ☐ ☐ ☐ |
| P12 | Driver clock-in integration | Keep separate now; propose later | D8; avoids disrupting drivers | Two systems remain (5 km selfie vs 100 m) | n/a | ☐ ☐ ☐ |

## 3. Workplace configuration (nothing invented)

System-recorded company names are **"Signature Solution Sdn Bhd", "Kasturi Indah Sdn Bhd", "O2 Life Sdn Bhd"** (no dots; "O2" with the letter O). The owner wrote "02Life Sdn. Bhd." (zero). **The official registered spelling must be confirmed.** The system holds **no** registration numbers, addresses, licence/tenancy documents or workplace coordinates (verified, read-only, 2026-10-10; 0 company documents; 0 driver locations set).

| Company (as in system) | Official registered name | Workplace name | Full address | Latitude | Longitude | Radius | Max GPS accuracy | Effective from | Entered by / verified by / approved by |
|---|---|---|---|---|---|---|---|---|---|
| Signature Solution | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | 100 m (fixed) | 50 m (staging; production after device tests) | PENDING | PENDING |
| Kasturi Indah | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | 100 m (fixed) | 50 m (staging; production after device tests) | PENDING | PENDING |
| O2 Life / 02Life | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | PENDING MANAGEMENT CONFIRMATION | 100 m (fixed) | 50 m (staging; production after device tests) | PENDING | PENDING |

Add extra rows for each additional site. **Working hours: PENDING MANAGEMENT CONFIRMATION for all three companies.**
Coordinates must come from a verified source for the building's entrance area, **not** from anyone's current phone location and not from an estimate.

## 4. Attendance requirements: GPS and face kept separate

**GPS (location) check: 4A**
- **Radius: exactly 100 m** from the approved workplace coordinates (database CHECK).
- **Accuracy: reported horizontal accuracy ≤ 50 m** (staging value; production only after real-device tests and approval).
- Both are calculated/checked **on the server** (distance recomputed in the database; client-sent distance/time ignored).
- Result stored as its **own** status (`location_status`). If accuracy is too low: "Retry / request an exception", **never** recorded as present.
- Honest limit: GPS shows where the phone *claims* to be. It is **not** proof of identity and it can be faked.

**Face (identity) check: 4B, separate**
- Its own status (`face_status`), its own provider, its own consent. **A pass in one never covers a failure in the other.** Accepted attendance needs **both** to pass (unless an approved exception exists).
- Until 4B: `face_status = not_configured`. It can never become "verified".
- **External service required:** yes. Nothing in the project can do genuine face verification today (verified by code search). A provider with liveness (detection of photos/screens/masks) is needed: Azure AI Face or AWS Rekognition (see comparison). **Cost estimate ≈ US$45/month for 68 staff at about US$0.015 per check (unverified price, not a quote).** Needs employee consent, a data-processing agreement, and legal review (overseas processing).

**Recommended secure implementation**
1. The browser never writes attendance. It sends location and (4B) the provider's session result reference to a server action.
2. The server action checks the session, then calls a database function that **only the server's service role can run**, so a logged-in user cannot call it with invented values.
3. In 4B the **server**, not the browser, asks the provider for the result (short-lived tokens); the browser's word is never trusted.
4. Face captures are **not stored by us**; we keep only outcome, score and the provider's session reference.
5. Enrolment reference image only with signed consent, in a private bucket, not readable by the browser, deleted on exit/withdrawal.
6. All provider keys live only in server environment variables, never in source code or the browser.
7. Every attempt, including failures, is logged without images or coordinates in application logs.

## 5. Supabase backup gate
Status: **NOT VERIFIED.** Supabase documentation: the Free plan has no daily backups and no PITR; Free projects should export with `db dump`; backups never include uploaded files. I cannot open your dashboard. **Needed from the owner** (hide emails/keys): screenshots of `…/database/backups/scheduled`, `…/database/backups/pitr`, and the organisation billing page. **No migration will be applied to production until a backup is confirmed and you approve in writing.**

## 6. Browser tests the owner performs
File: `docs/hrms/browser-test-checklist.md` (59 numbered tests, step-by-step, expected result and screenshot for each). Setup: set your own password for the 8 synthetic accounts in the **sandbox** project, run the app locally. **All 59 are NOT TESTED** until you perform them.

## 7. Vercel Preview settings: exact proposed changes (NOT applied)
Project `kasturi-catering-cms` (team `bella-shdee`). Affected: **three new variables, Preview environment, branch `feature/hrms-employee-management` only.** Existing Production variables are not read, changed or removed.

| Variable | Value | Environment | Branch |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dngvcoauvmzetlqjyont.supabase.co` (sandbox) | Preview | `feature/hrms-employee-management` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the sandbox's publishable key (public by design) | Preview | same |
| `SUPABASE_SERVICE_ROLE_KEY` | the **sandbox** service key; **entered by the owner only**; optional | Preview | same |

Commands (I would run the first two only after "APPROVED"):
```
vercel env add NEXT_PUBLIC_SUPABASE_URL preview feature/hrms-employee-management --scope bella-shdee
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY preview feature/hrms-employee-management --scope bella-shdee
```
After adding, the branch must be **redeployed** (public variables are fixed at build time). Production deployments are unaffected. Confirmation of isolation: the sandbox is a separate Supabase project (ref differs from production `cnnztwzzrwnuukehntcn`), holds only synthetic TEST data, and no production data was copied into it.

## 8. Dept Manager account: recommendation (NOT applied; account unchanged)
**Facts (verified, read-only):** role Dept Manager; access to **all companies**; modules `catering, driver-logistics, kitchen, overtime` (no HR module); not linked to an employee record. The Company Admin account also has all-company access.

**Real isolation risk today:** because the access row has no company, this account can currently work in catering, kitchen and driver-logistics for **all three companies**, and overtime approval checks (`user_is_ot_manager`) treat it as a manager of **every** company. (There are 0 overtime records yet.)

**Recommended restriction (one company + one department):**
1. Set the access row's **company** to the one designated company (database-level: all company-scoped tables then limit it to that company).
2. Set `department_scope` to the one designated department (database-level for HR data: employees, leave, attendance via the helper functions).
3. Keep its modules as they are unless management removes some.
4. **Overtime is company-wide, not department-wide, in today's rules.** True department scoping for overtime needs a change to existing overtime rules → **needs separate approval**.
5. Catering, kitchen and driver-logistics have **no department concept**: they can be limited by company only.
6. Enforcement is in the database (policies and trigger functions) and again in server actions; hiding buttons is never relied on.
7. It stays blocked from payroll, its own approvals (not linked to an employee), and other companies.

**Consequences:** approving narrows what the person can do today (other companies' catering/kitchen/driver/OT work stops); **I need the exact company and department**. Departments in the system: Signature Solution: Operations (6), FINANCE (1), 18 staff without a department; Kasturi Indah: Operations (6), 16 without; O2 Life: Operations (6), 15 without. A department-scoped manager sees only people actually assigned to that department until the blanks are filled.
**I have not deactivated or changed the account.** Suspending it would stop its day-to-day work; that is a production change needing your explicit instruction.

## 9. Written approval sheet (to be completed by the owner)

| Item | Decision (APPROVED / REJECTED / CHANGES) | Name, date |
|---|---|---|
| Documents 1–3 reviewed | | |
| P1–P12 (as marked in section 2) | | |
| Workplace data supplied (section 3) | | |
| Backup confirmed (section 5) | | |
| Vercel Preview changes (section 7) | | |
| Dept Manager company + department (section 8) | Company: ____  Department: ____ | |
| Permission to start Phase 4A **sandbox** build | | |
