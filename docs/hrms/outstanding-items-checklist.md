# Outstanding Items Checklist: what blocks what

Version 1 · 2026-10-11 · Status: **NO PRODUCTION MIGRATION HAS BEEN RUN. NO WRITTEN APPROVAL FOR P1–P12 HAS BEEN GIVEN. THE SUPABASE BACKUP IS NOT VERIFIED.**
Nothing on this list is treated as approved until the owner writes "APPROVED" for it. Silence is not approval.

## 0. Current facts (as the owner stated them, 2026-10-11)

| Company | Address (current information) | Status |
|---|---|---|
| Signature Solution Sdn. Bhd. | 3, Jalan Mutiara Emas 5/23, Taman Mount Austin, 81100 Johor Bahru | Address given; **coordinates, hours pending** |
| Kasturi Indah Sdn. Bhd. | 3, Jalan Mutiara Emas 5/23, Taman Mount Austin, 81100 Johor Bahru | Address given; **coordinates, hours pending** |
| O2 Life Sdn. Bhd. | 13, Jalan Persiaran Senibong, Bandar Baru Permas Jaya, 81750 Johor Bahru | **Pending:** registered address vs actual staff workplace; whether **one or two** workplaces; registered name spelling; coordinates; hours |

Registered address and operational workplace are **not assumed to be the same** for any company.

## 1. The five stages and what each one needs

| Stage | What it is | Needs |
|---|---|---|
| **S0** | Applying the Phase 3 migrations (0001, 0002, then 0004; 0003 later) to **production** | Items B1–B6 below |
| **S1** | **Building 4A in the sandbox** (code + migration + tests with synthetic data) | Items D1–D4 below |
| **S2** | **Enabling attendance in production** for a company | Items E1–E9 below |
| **S3** | Phase 4B: face verification | Items F1–F7 below |
| **S4** | Optional/side items | Items G1–G5 (none block 4A) |

---

## 2. BLOCKING: S0, production migrations (nothing is applied until ALL are done)

| # | Item | Status | Owner |
|---|---|---|---|
| B1 | **Supabase backup verified** (screenshots of the backups page, PITR page, billing page) or a **manual backup made and its files checked** (database dump + the 8 stored files), kept off OneDrive-synced folders | ☐ NOT DONE: screenshots pending | Owner |
| B2 | **Restore tested** in a separate project (needs a free project slot: pause or delete the sandbox, or use another project). If impossible, record "NOT TESTED" and accept the risk in writing | ☐ NOT TESTED | Owner decides |
| B3 | **Browser checklist run** (59 tests) with **no open Critical/High** result | ☐ NOT TESTED (0 of 59 run) | Owner |
| B4 | **Written approval** of migrations 0001, 0002, 0004 after reading `production-migration-plan.md` | ☐ NOT GIVEN | Owner |
| B5 | **Conflict check refreshed** on the day of the change (a read-only re-check I run immediately before) | ☐ Will be done at that time | Claude |
| B6 | **Dept Manager decision** (company + department) if the owner wants it narrowed in the same release (otherwise the account stays exactly as it is) | ☐ PENDING | Owner |
Rollback scripts are written and the sequence was rehearsed in a rolled-back sandbox transaction (done).

## 3. BLOCKING: S1, building Phase 4A in the sandbox (design decisions that shape the code)

Nothing about real addresses, coordinates or hours is needed for this stage: the sandbox uses synthetic test data, and all configuration tables start empty.

| # | Item | Why it blocks | Status |
|---|---|---|---|
| D1 | **Written approval to start the 4A sandbox build** (sign-off row "Permission to start Phase 4A sandbox build") | Instruction from the owner: 4A stays on hold | ☐ NOT GIVEN |
| D2 | **P7:** radius fixed at exactly 100 m (recommended) | Decides the database rule for the radius column | ☐ PENDING |
| D3 | **P8:** may an independent HR reviewer finalise alone? (recommended: no) | Changes the exception rules coded into the database | ☐ PENDING |
| D4 | **P9:** HR edits attendance directly, or corrections-with-reason only? (recommended: corrections only) | Changes which database policies are written | ☐ PENDING |

## 4. BLOCKING: S2, switching attendance on in production for a company

(Not needed to *build*; needed before any employee can clock in for real.)

| # | Item | Status |
|---|---|---|
| E1 | **Workplace list per company** confirmed by management, including whether **O2 Life has one or two** workplaces and which address is the registered one | ☐ PENDING |
| E2 | **Exact GPS coordinates** for each workplace from a verified on-site source (entered by one person, verified by a second, approved by the director). **Not** from addresses, estimates or anyone's current location | ☐ PENDING |
| E3 | **Real-device tests (P11)** of the 50 m accuracy limit on the phones staff actually use (Android Chrome, iPhone Safari), then approval of the production limit | ☐ NOT TESTED |
| E4 | **Employees' logins linked to their staff records** (today 0 of 68) | ☐ HR task, not started |
| E5 | **Designations (P6):** names for reviewer, designated manager, director/escalation, Super Admin | ☐ PENDING |
| E6 | **P5 decision** on the production fallback (recommended: do not enable; keep clock-in off until 4B) | ☐ PENDING |
| E7 | **Backup verified (B1) and S0 completed** | ☐ see §2 |
| E8 | Separate **written approval to enable** for each company | ☐ NOT GIVEN |
| E9 | An **attendance browser checklist** (written together with the 4A build) run by the owner with no open Critical/High result | ☐ Not written yet (nothing built) |

## 5. BLOCKING: S3, Phase 4B (face verification)

| # | Item | Status |
|---|---|---|
| F1 | **P4:** authorise *information requests only* to Microsoft / AWS / Innov8tif (no data sent) | ☐ PENDING |
| F2 | Written provider answers: price, region, certificates, retention terms | ☐ Not requested |
| F3 | **Provider chosen and approved** by management (cost approved) | ☐ PENDING |
| F4 | **P10: legal review** (biometric consent, overseas processing, retention, hosting in Singapore, in-Malaysia record keeping) | ☐ PENDING |
| F5 | **Employee consent wording** approved | ☐ PENDING |
| F6 | **Retention periods (P3)** approved after legal review | ☐ PENDING |
| F7 | Spoof tests reported honestly; no "verified" label before a provider is integrated and tested | ☐ Not built |

## 6. SAFE TO LEAVE PENDING (do not block 4A development)

| # | Item | Why it can wait | It becomes blocking when |
|---|---|---|---|
| G1 | **Official working hours (P2)** for all three companies | Clock-in/out works without them; with no rule set, **nothing is calculated** (no lateness, no overtime) | Management wants lateness, early-leave or overtime reports |
| G2 | **O2 Life registered-name spelling** ("O2" vs "02") | Display/letters only, not attendance logic | Letters/payroll use the legal name; verify with the SSM certificate |
| G3 | **Retention numbers (P3)** | The configurable structure can exist empty; **nothing is ever deleted automatically** | Any purge is proposed |
| G4 | **Driver clock-in integration (P12)** | The driver module stays untouched (D8) | A future unification is proposed |
| G5 | **Vercel Preview settings** | The app runs locally against the sandbox; the preview only adds convenience | The owner wants testers to use a web preview |

## 7. Items that are mine to do, ready now (no approval needed to prepare drafts)
- Draft the provider information-request emails (for the owner to send): **only after P4 is approved**.
- Draft the legal adviser brief: **only after P10 is approved**.
- Real-device test plan (P11).
- Sign-off sheet is in `phase4a-review-pack.md` §9 (still blank).

## 8. Recommended order
1. Owner: backup screenshots (B1) → run the browser checklist (B3) → written decisions on P7, P8, P9 and "start the sandbox build" (D1–D4).
2. Claude: build and test 4A **in the sandbox only**, report with evidence.
3. Management: workplace list, coordinates (E1, E2), designations (E5) while the build proceeds.
4. Owner approves S0 (production migrations) after B1–B4, then a separate approval per company for S2.
5. 4B only after F1–F7.

**Phase 4A stays on hold until the owner gives D1 in writing.**
