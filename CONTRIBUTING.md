# Team Workflow Guide (start here)

This project is built and maintained by a team, each person owning one module. This
guide explains — in plain language — how we work together on GitHub without stepping
on each other's code. Read it once before your first commit.

## 1. The golden rule: `master` is always stable

`master` is the branch that represents "the real, working app." Nobody pushes to it
directly — GitHub is configured to block that. Instead, everyone works on their own
**feature branch** and merges into `master` through a **Pull Request (PR)** that someone
else reviews first.

Why: if `master` breaks, it breaks the app for everyone. A feature branch only affects
you until it's reviewed and merged.

## 2. Branch naming

Create a new branch off the latest `master` for every piece of work:

```bash
git checkout master
git pull
git checkout -b <type>/<module>-<short-description>
```

Examples:

```bash
git checkout -b feature/hr-add-bonus-field
git checkout -b fix/kitchen-stock-negative-qty
git checkout -b chore/finance-update-labels
```

`<type>` is one of: `feature`, `fix`, `chore`, `docs`.

## 3. Module ownership — stay in your lane

| Module | Owner | Folders |
|---|---|---|
| Main Dashboard | Main developer | `src/app/(dashboard)/page.tsx`, `src/lib/queries/dashboard.ts`, `src/components/dashboard/` |
| HR | HR developer | `src/app/(dashboard)/hr/`, `src/lib/hr/`, `src/components/hr/` |
| Marketing | Marketing developer | `src/app/(dashboard)/marketing/`, `src/lib/marketing/`, `src/components/marketing/` |
| Catering | Catering developer | `src/app/(dashboard)/catering/`, `src/lib/catering/`, `src/components/catering/` |
| Kitchen | Kitchen developer | `src/app/(dashboard)/kitchen/`, `src/lib/kitchen/`, `src/components/kitchen/` |
| Operation Management | Logistics developer | `src/app/(dashboard)/driver-logistics/`, `src/lib/driver/`, `src/components/driver/` |
| Supplier & Procurement | Procurement developer | `src/app/(dashboard)/supplier-procurement/`, `src/lib/procurement/`, `src/components/procurement/` |
| Admin & Finance | Finance developer | `src/app/(dashboard)/finance/`, `src/app/(dashboard)/admin/`, `src/lib/finance/`, `src/components/finance/` |
| Reports | Main developer (shared) | `src/app/(dashboard)/reports/`, `src/lib/reports/`, `src/components/reports/` |

**Do not edit another module's folder directly.** If your feature genuinely needs a
change in someone else's module (e.g. Catering needs a new field on a Kitchen table),
open an issue or message that owner — don't just push the change yourself. If it's
urgent and they're unavailable, make the change on your branch but explicitly tag them
as a required reviewer on the PR and call it out in the PR description.

This is enforced by [`.github/CODEOWNERS`](.github/CODEOWNERS) — GitHub will
automatically request the right person's review when a PR touches their folder.

## 4. Shared code — extra care required

Some code is used by *every* module. Changing it can break other people's work even
if your own module still looks fine:

- `src/lib/auth.ts`, `src/lib/companyScope.ts` — session + company-scoping used by every page
- `src/lib/supabase/` — the database client and generated types
- `src/lib/documents/upload.ts`, `src/lib/importFlow/` — the Upload → OCR → Review → Save pipeline every module's import screens are built on
- `src/components/layout/` — Sidebar, Topbar, company selector
- `src/components/shared/import/` — the reusable import UI building blocks
- `src/lib/format.ts`, `src/lib/constants.ts` — shared formatting/constants

**Rule: if you change a file in this list, say so explicitly in your PR description**
(what changed and why), and tag the Main developer as a reviewer. Don't change its
public shape (function names, props, exported types) without checking who else calls
it first — a quick repo-wide search for the function/component name will show you.

## 5. Commit messages

Write commit messages that explain *why*, not just *what* — the diff already shows what
changed.

```
Good:  "Fix overtime approvals not syncing to shared approvals table"
Good:  "Add bonus field to payroll form (requested by finance team)"
Bad:   "update"
Bad:   "fix stuff"
```

One logical change per commit where practical. It's fine to have several commits on a
branch before you open the PR.

## 6. Opening a Pull Request

```bash
git push -u origin <your-branch-name>
gh pr create
```

In the PR description, answer:
- What does this change do, and why?
- Does it touch shared code or another module's folder? (see section 4)
- Does it add or change a database table/column? Link the migration file (see section 8).
- How did you test it? (which company, which input method — manual/Excel/CSV/PDF/photo)

## 7. Code review before merging

Every PR needs **at least one approval** from another team member before it can be
merged — GitHub blocks the merge button until then. Branch protection also requires
your branch to be up to date with `master` before merging, so pull `master` into your
branch if it's fallen behind:

```bash
git checkout your-branch
git merge master
```

As a reviewer: check that the change does what the description says, doesn't touch
another module's folder without a clear reason, and doesn't quietly remove existing
functionality (see section 9).

## 8. Database changes must be a tracked migration

Never edit the database schema by hand in the Supabase dashboard for anything that
should persist. Every schema change is a new SQL file in `supabase/migrations/`,
named `YYYYMMDDHHMMSS_short_description.sql`, committed alongside the code that needs
it, and mentioned in the PR description. This is how the whole team (and the database
audit trail) stays in sync — nobody has to guess what changed or when.

## 9. Don't remove functionality without approval

If your change would delete or disable something another module or the dashboard
currently relies on (a field, a query, an exported function, a report), that needs
explicit sign-off in the PR review — flag it clearly in the PR description rather than
letting a reviewer discover it in the diff. When in doubt, ask before removing; it's
much cheaper to ask than to silently break someone else's module.

## 10. Secrets never get committed

Real Supabase keys, the Anthropic API key, and any password/token live only in your
local `.env.local`, which is already git-ignored (see `.gitignore`) and must stay
that way. `.env.example` (which **is** committed) only ever holds placeholder values
— never a real key. If you ever accidentally commit a real secret, don't just delete
it in a new commit (it stays in git history) — tell the Main developer immediately so
the key can be rotated in Supabase/Anthropic and scrubbed from history.

---

### Quick reference

```bash
git checkout master && git pull                     # start from latest stable
git checkout -b feature/hr-something                # your own branch
# ...make changes...
git add <files>
git commit -m "Clear description of the change"
git push -u origin feature/hr-something
gh pr create                                        # open PR, request review
# ...after approval...
gh pr merge --squash                                # merge once approved
```
