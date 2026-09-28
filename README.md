# Central Management System

A central management system for **Signature Solution Sdn Bhd**, **Kasturi Indah Sdn Bhd**
and **O2 Life Sdn Bhd** — one dashboard, filterable by company, with room to grow into
HR, Marketing, Catering, Kitchen, Driver & Logistics, Supplier & Procurement, Finance &
Admin and Reports.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase** — Postgres database, Auth, and Storage (a private `documents` bucket for uploads)
- **Claude (Anthropic API)** — optional AI extraction on uploaded PDFs/photos/screenshots
- Deployed on **Vercel** (not yet connected)

## Getting started

1. Copy `.env.example` to `.env.local` and fill in your Supabase project's URL and
   publishable key (already done for this project's own Supabase instance — see the
   handoff notes from the last build for the values).
2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000). You'll land on `/login`.
4. Go to `/signup` to create the **first** account — it automatically becomes the
   Super Admin with access to all companies. Every account after that starts with
   no company access until a Super Admin grants it (Settings → Users & Roles, once
   that flow is built).
5. (Optional) Set `ANTHROPIC_API_KEY` in `.env.local` to turn on AI extraction for
   uploaded documents (see `.env.example`). Without it, uploads still work — the
   review form just starts blank instead of pre-filled.

## Project structure

```
src/
  app/
    login/, signup/        — public auth pages
    (dashboard)/            — everything behind the sidebar shell
      layout.tsx            — sidebar + top bar + auth guard
      page.tsx              — Main Dashboard
      hr/                    — Employee Database, profile, leave/overtime/payroll, cert uploads (real module)
      marketing/              — Campaigns, content calendar, leads/customers, promotions, expenses, reports (real module)
      catering/                — Events, quotations, costing, staff/equipment/delivery, customers (real module)
      kitchen/                 — Production schedule, ingredients, recipes, menus, stock, purchase requests, daily report (real module)
      driver-logistics/        — Deliveries, drivers, vehicles, maintenance, expenses (real module)
      supplier-procurement/    — Suppliers, purchase requests, purchase orders, invoices, payment dashboard (real module)
      finance-admin/           — Monthly financial summary, customer invoices, company expenses, petty cash, budgets, cost categories (real module)
      reports/                 — still a placeholder
      settings/               — read-only Users & Roles view
    api/extract-document/     — server route that calls Claude to read an uploaded file
  components/
    layout/                 — Sidebar, Topbar, company selector, nav links
    dashboard/               — KPI card, section card, alerts panel
    shared/import/            — the reusable Upload & Import UI atoms every module composes (see below)
    hr/                      — employee form, bulk import, certificate upload/review, leave/overtime/payroll forms
    marketing/               — campaign form, content calendar, leads/customers/promotions forms, expense + performance upload/review
    catering/                — event form, quotation builder, costing/staff/equipment/delivery forms
    kitchen/                 — ingredient form + bulk import (uses the shared engine), recipe/menu/production order forms, Recipe+Pax calculator, stock upload/review, purchase request form/actions
    driver/                  — delivery form, driver form (existing-employee-or-new), vehicle form + bulk import, maintenance/expense upload+review
    procurement/             — supplier form + bulk import, purchase request/order forms, invoice upload/review with Duplicate Check (uses the shared engine), payment approval/execution forms
    finance/                 — company expense upload/review (uses the shared engine), petty cash form, budget form, customer invoice + payment forms, cost category form
  lib/
    supabase/                — browser + server Supabase clients, generated DB types
    queries/dashboard.ts      — one function per dashboard section (reusable by future modules)
    importFlow/                — the reusable Upload & Import engine every module's flow is built from (see below)
    hr/                       — HR queries + server actions (create/update/approve/etc.)
    marketing/                — Marketing queries + server actions (campaigns, leads, conversion, etc.)
    catering/                 — Catering queries + server actions, incl. the Kitchen/Driver/Finance auto-connections
    kitchen/                  — Kitchen queries + server actions, incl. the Recipe+Pax scaling engine and the single stock-movement choke point
    driver/                   — Driver & Logistics queries + server actions, incl. the maintenance choke point that keeps a vehicle's "next due" in sync with its service history
    procurement/               — Supplier & Procurement queries + server actions, incl. the request→approval→PO→invoice→payment chain and the invoice Duplicate Check
    finance/                   — Finance & Admin queries + server actions, incl. the cross-module Monthly Costing aggregation that reads every other module's own tables
    documents/upload.ts        — shared upload-to-storage helper, reusable by any future module
    auth.ts                   — signed-in user's profile + company access
    companyScope.ts            — turns "?company=" + the user's grants into a company id list
  proxy.ts                    — (formerly "middleware" — Next.js 16 renamed it) session refresh + route guard
```

### Catering's automatic connections

Confirming an event or accepting its quotation doesn't just change a status — it seeds
the modules downstream, so Kitchen, Driver & Logistics and Finance & Admin have real
data to work from the moment they get their own UI:

- **Confirming an event** (`updateEventStatus`) creates a `production_orders` row
  (Kitchen) and a `deliveries` row (Driver & Logistics) if they don't already exist.
- **Accepting a quotation** (`updateQuotationStatus`) confirms the event (via the same
  function above, so the two connections above still fire) and creates a
  `customer_invoices` row (Finance & Admin) linked to that quotation — which is what
  the dashboard's Customer Outstanding figure already reads.

### Kitchen's automatic connections

Kitchen doesn't keep its own parallel copies of catering or costing data — it reads
and writes into the tables the other modules already own:

- **A confirmed catering event** already creates a `production_orders` row (see
  Catering's connections above); that row now also carries the event's `pax_count`,
  so Kitchen knows how much to produce without re-asking anyone.
- **Recipe + Pax**: `scaleIngredientRequirements()` (in `lib/kitchen/queries.ts`) scales
  a recipe's per-yield ingredient quantities to any target pax. It's used both for the
  on-screen calculator (recipe detail and production order detail pages) and for real
  stock consumption.
- **Marking a production order Completed** consumes stock for every scaled ingredient
  through the single `recordStockMovement()` choke point (so `ingredients.current_stock_qty`
  and the `stock_movements` ledger can never drift apart), and — if the order is linked
  to a catering event — writes the resulting ingredient cost into that event's existing
  `event_costing.ingredient_cost` row rather than keeping a second total.
- **Kitchen → Supplier & Procurement**: a purchase request links an ingredient to a
  `suppliers` row (defaulting to that ingredient's preferred supplier). Marking a
  request "received" adds the stock back in through the same `recordStockMovement()`
  path — no separate "goods received" table.
- **Wastage** is just another `stock_movements` type, not a separate table — the Daily
  Kitchen Report sums it per day from the same ledger everything else uses.

### Driver & Logistics' automatic connections

Drivers, vehicles and deliveries reuse the tables other modules already own rather
than keeping parallel copies:

- **Drivers are HR employees.** `driver_profiles` only holds the driver-specific
  extras (license number/expiry, availability) linked 1:1 to an `employees` row — a
  driver's name, company and contact info stay owned by HR. Adding a driver who isn't
  in HR yet creates that employee record first (position "Driver"), so both modules
  see the same person, never two.
- **Catering → Driver**: confirming a catering event already auto-creates a
  `deliveries` row (see Catering's connections above). Driver & Logistics is where
  that row gets a vehicle, a driver, a location and an items description — the same
  `deliveries` table, not a second one.
- **Vehicle maintenance**: logging a service record updates `vehicles.next_maintenance_due`
  — the one value the dashboard's "due soon" alert reads — so it can't drift from the
  service history, the same choke-point pattern Kitchen uses for stock.
- **Driver → Finance**: `driver_expenses` (mileage/fuel/toll/parking/other) has its own
  table, like `marketing_expenses`, since it needs to link back to a vehicle/driver/
  delivery — its monthly total feeds directly into the dashboard's existing Financial
  Overview / Monthly Costing figure, not a separate finance record.
- **Driver → Main Dashboard**: available driver count, upcoming deliveries, and
  insurance/road tax/license expiry alerts are all read live from these same tables.

### Supplier & Procurement's automatic connections

- **Approvals reuse the shared `approvals` table** — the same one HR's leave
  requests already use. A purchase request or a payment request inserts its own
  row (`procurement_requests` / `supplier_payments`) plus one `approvals` row;
  approving or rejecting either one updates both together. This is why the Main
  Dashboard's existing "Pending Approvals" count picks up procurement approvals
  automatically, with no dashboard changes needed.
- **A payment is a request first, money second.** `supplier_payments` now doubles
  as the payment request itself (status `pending` → `approved` → `paid`);
  `payment_date`/method/reference/receipt are only filled in once it's executed.
  Marking it paid checks whether the invoice's full amount has now been paid and,
  if so, flips `supplier_invoices.status` to `paid` — the same status the
  dashboard's Supplier Payments outstanding/overdue figures already read, so
  Supplier → Payment → Finance → Monthly Costing all stay one chain, not four.
- **Purchase Request → Purchase Order**: approving a request doesn't create a
  second "converted" record — the same request row gets `status = 'converted'`
  and a `purchase_order_id`, and the new PO's create screen is simply pre-filled
  from the request's item/quantity.
- **Duplicate Check**: before a supplier invoice can be saved, a check looks for
  an existing invoice from the same supplier with a matching invoice number, or
  a matching amount within a few days of the same date. If it finds one, the
  save button turns into an explicit "Save Anyway" — never a silent save.

### Finance & Admin's automatic connections

Finance & Admin doesn't keep its own copy of every module's transactions — the
Monthly Costing / Monthly Financial Summary reads straight from each module's own
tables and combines them at request time:

- **Kitchen**: `stock_movements` (out/wastage) × the ingredient's `unit_cost`.
- **Catering**: `event_costing`'s six cost fields, for events in the selected month.
- **Supplier**: `supplier_payments` actually paid that month (joined to
  `supplier_invoices` only to read its `department`, for the department filter).
- **Driver & Logistics**: `driver_expenses`, already categorized (fuel/toll/etc).
- **Marketing**: `marketing_expenses`, already categorized.
- **HR**: `payroll_records` marked paid (joined to `employees` for department).
- **Company Expenses** and **Petty Cash** are the two genuinely new ledgers this
  module owns itself — the Phase 1 `expenses` table had no owning module until now.

Because every row keeps its own source, category and department, the Monthly
Costing page's Company/Month/Year/Department/Category filters are just an
in-memory filter over one combined list — not six different queries. Budgets
compare against this same combined list rather than storing an "actual" figure
that could drift, and a budget that's exceeded surfaces as a Main Dashboard alert.
Customer invoices and payments reuse the exact `customer_invoices` /
`customer_payments` tables Catering already writes to (recording a payment marks
the invoice paid once fully covered, the same status the dashboard's Customer
Outstanding figure reads) — Finance & Admin adds the missing UI for them rather
than a second table.

### The Universal Import & Document Upload system

Every manual/PDF/Excel/CSV/photo/screenshot input across every module (HR, Marketing,
Catering, Kitchen, Driver & Logistics, Supplier & Procurement, Finance & Admin) is
built from one shared system rather than each module inventing its own uploader.
It has three layers:

**1. Storage + extraction (server-side, shared by everything):**
- `lib/documents/upload.ts` uploads the file to the private `documents` Storage
  bucket and creates a tracking row in the `documents` table (status `pending`).
- `app/api/extract-document/route.ts` downloads the file server-side and, if
  `ANTHROPIC_API_KEY` is set, asks Claude to read it and return structured JSON —
  the `kind` in the request body picks which prompt to use (one per document type,
  e.g. `supplier_invoice`, `company_expense`, `stock_count`).

**2. The reusable engine (`lib/importFlow/`):** two hooks implement the standard
pipelines end to end, so a module's component never re-implements tab-switching,
upload wiring, or the review/validation/duplicate-check choreography itself:

- `useDocumentUpload()` — the PDF/photo/screenshot pipeline: **Upload → Document
  Detection (which tab the file came in on) → Extraction/OCR → Review → Duplicate
  Check → Confirmation → Save → Attach Original Document.** It returns the raw
  extracted JSON to the caller (Field Mapping is deliberately left to each module,
  since every AI response shape differs) and exposes `runDuplicateCheck()` so any
  module can opt into the same "possible duplicate → Save Anyway" gate Supplier &
  Procurement's invoices use, with one line of code.
- `useSpreadsheetImport(fields, headerAliases)` — the Excel/CSV pipeline: **Upload
  → Map Columns → Preview → Validate → Show Errors → Confirm → Import.** Column
  mapping is a real, visible step (`components/shared/import/ColumnMappingStep.tsx`)
  — every detected header gets a best-guess target field, but the user sees and can
  correct the mapping before any row is previewed. Validation runs per row against
  each field's `required` flag and shows inline errors; only valid rows import.

**3. Shared presentational atoms (`components/shared/import/ImportFlowAtoms.tsx`):**
`ImportTabs`, `FileDropZone`, `ExtractionNotice`, `FormError`, `ConfirmActions` and
`DuplicateCheckPanel` are the visual chrome every flow renders identically; a
module only ever writes its own field-specific form JSX around them.

Never automatically saving uncertain data is enforced structurally: nothing writes
to a real table until the module's own `onConfirm`/`onImport` callback runs, which
only happens from an explicit Confirm/Import click the user takes after reviewing.

Kitchen's ingredient import, Finance's company expense upload, and Supplier &
Procurement's invoice upload (the richest case — line items *and* the Duplicate
Check) are built on this engine today, one from each pipeline variant. The other
existing upload flows (HR, Marketing, the rest of Kitchen/Driver/Supplier) still
use their own earlier hand-written versions of the same pattern — they work and
weren't touched, but migrating them onto `lib/importFlow/` later is now just
wiring, not new design.

## Database

Schema and RLS policies are in `supabase/migrations/`, applied in order to the
project's Supabase instance. Every business table carries a `company_id`; a user's
access is controlled by the `user_company_access` table (`company_id = null` means
access to every company).

Tables with a real UI (companies, profiles, user_company_access, employees,
employee_certificates, leave_requests, overtime_records, payroll_records, documents,
approvals, campaigns, customers, content_items, leads, promotions, marketing_expenses,
campaign_performance, catering_events, quotations, quotation_items, event_costing,
equipment, event_equipment, event_staff, deliveries, customer_invoices,
production_orders, ingredients, menus, menu_items, recipes, recipe_ingredients,
stock_movements, purchase_requests, vehicles, deliveries, driver_profiles,
vehicle_maintenance_records, driver_expenses, suppliers, supplier_invoices,
supplier_invoice_items, supplier_payments, purchase_orders, purchase_order_items,
procurement_requests, expenses, customer_payments, cost_categories,
petty_cash_transactions, budgets) have full select/insert/update policies —
every planned module is now built.

`customers` is shared: Marketing owns the "add/convert a lead" flow, but Finance &
Admin's future customer invoices will reference the same table — one customer record,
not a copy per module.
