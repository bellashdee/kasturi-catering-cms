# Data Retention Matrix: Attendance, Biometric, Location, Audit and Related Records

Version 1 · Date 2026-10-10 · Status: **PROPOSAL. EVERY PERIOD IS "PENDING APPROVAL". NOTHING IS DELETED AUTOMATICALLY.**
This is a technical research summary **for a qualified Malaysian legal adviser / data protection professional to confirm. It is not legal advice.**

Rules built into the design (Phase 4A):
- Retention is **configurable** (table `retention_policies`, empty and inactive by default). No scheduled job deletes anything.
- Even after a policy is approved, the system only produces a **read-only candidate report**. Any purge is a separate, manual, approved procedure: dry-run report → written approval → **verified backup** → run → logged result.
- A **legal hold** (dispute, investigation, audit) overrides any schedule.

## 1. Legal references and how well I verified them

| Reference | What it says (as found) | Verification status |
|---|---|---|
| **PDPA 2010, s.10 Retention Principle** | Personal data processed for any purpose must not be kept longer than necessary for that purpose; reasonable steps to destroy or permanently delete it when no longer needed. | Consistent across several law-firm guides ([Multilaw](https://www.multilaw.com/Multilaw/Data_Protection_Laws_Guide/DataProtection_Guide_Malaysia.aspx), [Chambers](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/malaysia)); **statute text not read**. One FAQ suggests anonymisation as an alternative; the statutory wording speaks of destruction/permanent deletion: **adviser to confirm whether irreversible anonymisation satisfies s.10**. |
| **PDPA Amendment Act 2024** | Biometric data added to **sensitive personal data** (from 1 Apr 2025); cross-border whitelist regime removed (1 Apr 2025); DPO appointment and mandatory breach notification (1 Jun 2025); higher penalties (up to RM1 million / 3 years). | Law-firm summaries ([DFDL](https://www.dfdl.com/insights/legal-and-tax-updates/malaysia-implementation-of-the-personal-data-protection-amendment-act-2024/), [Baker McKenzie](https://insightplus.bakermckenzie.com/bm/data-technology/malaysia-personal-data-protection-amendment-act-2024-to-come-into-force)); sources differ slightly on Gazette dates; **cross-border detail and later Commissioner guidelines not confirmed**. |
| **Employment Act 1955, s.61 "Duty to keep registers"** | Employers must keep prescribed registers/records. | Section title confirmed. The **"six years"** figure appears only in vendor blogs ([Employment Hero](https://employmenthero.com/my/blog/salary-payments-in-malaysia/)); **not found in the statute text**. Also, the Act's coverage depends on the employee (earnings/type of work): **adviser to confirm which employees it covers**. |
| **Income Tax Act 1967, s.82A** | Persons required to file a return must keep sufficient documents for **seven years** from the end of the year of assessment; electronic records must stay readable; **documents relating to Malaysian income must be kept in Malaysia**. | Statute text seen only in a **2006 reprint** summary ([Low Partners](https://development.lowpartners.com/income-tax-act-1967-part-5/)); application to employer payroll records comes from a tax-practice article. **Check the current Act with LHDN/an adviser.** |
| **EPF / SOCSO(PERKESO) / EIS record periods** | A vendor blog says seven years for SOCSO. | **Not researched from primary sources.** No source found for EPF/EIS alone. **Adviser to confirm.** |
| **Limitation Act 1953** (time limits for disputes) | Not researched here. May be relevant to how long wage/overtime disputes can arise. | **NOT RESEARCHED.** Adviser to advise. |

**Data location flag:** the Supabase project is hosted in **Singapore** (`ap-southeast-1`, verified). All HR, payroll and attendance data is therefore already stored outside Malaysia. This matters for the PDPA cross-border rules and for the "keep income-related documents in Malaysia" wording above. **Adviser to confirm whether current hosting is acceptable.**

## 2. Retention matrix (proposed periods are PENDING)

Data owner = the responsible **role** (named person to be assigned by management: PENDING).

| # | Data category | Purpose | Proposed retention (**PENDING**) | Deletion / anonymisation method | Justification | Data owner (role) | Adviser flag |
|---|---|---|---|---|---|---|---|
| 1 | **Attendance records** (clock-in/out times, workplace, status, source) | Record hours worked; support wages, overtime, leave and disputes | **7 years** after the record date | After approval: delete the row, or irreversibly anonymise to monthly headcount totals (adviser to confirm acceptability) | Attendance underpins pay; 6 years (vendor blogs, Employment Act) and 7 years (Income Tax Act s.82A, payroll) are the periods found; 7 covers the longest cited | HR Admin | Confirm period; whether the Employment Act applies to each employee |
| 2 | **Raw GPS coordinates** stored with each clock event | Prove the 100 m / 50 m checks at the time | **12 months** for latitude/longitude; keep distance, accuracy and result with the attendance record (row 1) | Null out the coordinate columns; keep the result fields | Coordinates are location personal data; need is mainly dispute/anomaly review shortly after the event; **no statute found requiring them** (data minimisation under s.10) | HR Admin | **Confirm 12 months is defensible**; any other basis |
| 3 | **Rejected / retry attempts** (`attendance_events`) | Detect location probing, misuse, device problems | **12 months** | Delete rows | Security/support purpose only; no statutory minimum found | Super Admin | Confirm |
| 4 | **Exception requests, reviews, approvals** | Show why a record was changed and who approved | Same as the attendance record it changed (**7 years**) | Delete or anonymise with the record | They alter pay-relevant records, so they follow them | HR Admin | Confirm |
| 5 | **Live face capture / selfie video** (4B) | Liveness + match at clock time | **0: not stored by us**. Provider-side retention depends on the provider (Azure: none per its docs; AWS: may keep unless opt-out) | n/a for us; configure provider opt-out/no-retention | Data minimisation; biometric data is sensitive | Super Admin / DPO | **Required**: consent, cross-border, provider terms |
| 6 | **Face enrolment reference** (image/template/provider reference) (4B) | Compare the live face to the enrolled person | While employed + **30 days** after exit, or immediately on withdrawal of consent | Secure deletion at provider and in our storage; deletion logged | Only needed while the person clocks in; sensitive biometric data | DPO / HR Admin | **Required**: explicit consent, grace period, holds |
| 7 | **Face-check result** (outcome + score + provider session id) | Show which attendance was verified | Outcome: with attendance record (7 years); **score/session id: 12 months** | Null the score/session id; keep the outcome | Outcome is part of the attendance evidence; raw scores are diagnostic only | HR Admin | Confirm |
| 8 | **Biometric consent records** | Prove lawful basis for biometric processing | For as long as biometric data is processed **plus [period to be advised]** | Delete after the period | Proof of consent for sensitive data | DPO | **Required**: adviser to set the period |
| 9 | **Audit log** (who changed which fields, when; no values) | Accountability and security investigations | **7 years** | Delete oldest first | Matches the longest record period; contains no personal values | Super Admin | Confirm; whether shorter is acceptable |
| 10 | **Workplace geofence versions, schedule versions, attendance rules** | Explain how historical attendance was judged | Keep while any attendance record that used them exists, **then 7 years** | Delete with the dependent records | Needed to interpret historical data | HR Admin / Director | Confirm |
| 11 | **Payroll records and payslips** (context: attendance may feed them) | Statutory payroll and tax records | **7 years** after the year of assessment | Delete after approval; backup first | Income Tax Act s.82A (7 years); EA 6 years per vendor blogs | Finance | **Required**: statute text, EPF/SOCSO/EIS, **in-Malaysia storage** |
| 12 | **Employee personal files** (contract, letters) | Employment relationship | **[to be advised]** after employment ends (many HR practices use 6–7 years) | Delete after approval | Employment Act s.61 duty to keep registers; PDPA s.10 | HR Admin | **Required** |

## 3. What I did not do / cannot decide
- I did not read the statutes themselves (only secondary summaries and one 2006 reprint summary). Periods marked "Confirm" need a qualified adviser.
- I have **not** chosen any final period. The numbers above are starting proposals tied to the longest period found, to be accepted, shortened or lengthened by management on advice.
- No data has been or will be deleted until a policy is approved, a backup verified, and the purge procedure run under your authority.

## 4. Decisions needed from management
1. Approve, change or reject each proposed period in the matrix.
2. Name the responsible person for each data owner role, and a DPO if the adviser says one is required.
3. Instruct a legal adviser on the flags (PDPA s.10 anonymisation, biometric consent wording, cross-border processing, hosting in Singapore, in-Malaysia record keeping, EPF/SOCSO/EIS periods, Limitation Act).
