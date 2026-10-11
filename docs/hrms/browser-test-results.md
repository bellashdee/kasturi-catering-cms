# Browser Test Results Log (sandbox, owner-executed)

Only tests that were **actually performed** are listed. Every test in `browser-test-checklist.md` that is not below is **NOT TESTED**.
Environment: local app (`http://localhost:3000`, branch `feature/hrms-employee-management`) connected to the **sandbox** project `hrms-test-sandbox`. Synthetic data only.

## Executed

| ID | Date | Account | What was done | Expected | Actual | Evidence | Status |
|---|---|---|---|---|---|---|---|
| X1 (extra) | 2026-10-11 | `penny@…` (new sandbox account, **no role, no company access**), signed in by magic link | Opened `/supplier-procurement` (and `/hr`, `/marketing`, `/` per server log) | A user with no company access sees **no data** | Page shows **"You don't have access to any company yet."**; company selector offers only "All Companies"; no records shown | Owner screenshot 7 (supplier-procurement page) | **PASS** (supplier-procurement page seen directly; the other pages are only in the server log as HTTP 200, not seen) |

## Findings

| ID | Severity | Module | Description | Evidence | Recommended fix | Approval needed |
|---|---|---|---|---|---|---|
| F-1 | **Low** | Navigation | A signed-in user with **no company access** still sees the full module menu (HR, Marketing, Catering, Operation Management, Kitchen, Supplier & Procurement, Admin & Finance, Reports, AI Assistant, Settings). Cause (from code): a user with no access rows is treated as "all modules allowed" when building the menu. No data is exposed; each page shows the empty message. | Screenshot 7; code `src/lib/auth.ts` (modules merge returns "all" when there are no grants) | Show no modules to a user with no access rows | Existing shared menu logic: small change, needs approval |

## Notes
- The first sign-in used a **magic link** for the owner's own email, which created an extra account in the sandbox with no access. It is harmless and can be deleted.
- The 8 synthetic test accounts (`test-*@example.test`) had **not been used yet** at this point; the HR/role tests T01 onward are **NOT TESTED**.
