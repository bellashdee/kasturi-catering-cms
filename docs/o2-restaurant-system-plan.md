# O2 Life restaurant management system: audit, gap analysis and plan

Status: **PLAN ONLY (22 Nov 2026). Nothing in the database or the app has been changed for this plan.** Every phase below waits for Ms. Nabilah's approval.

Scope: **O2 Life Sdn Bhd only** (company id `8cb94636-7cdb-4bb2-a9b3-cd280c1da3fb`, the company of Restoran Bara Ikan Bakar Senibong). Kasturi Indah, Signature Solution and "All Companies" must behave exactly as today.

Request: improve the existing CMS (do not start a new app) into an integrated restaurant system, following the "MASTER PROMPT" (workflow inspired by e-HORS / WinX Catering).

---

## 1. Audit: what exists today

### 1.1 Stack

- Next.js 16.3.6 (app router, React 19.2, server actions) with Supabase (Postgres + RLS + Auth + Storage), deployed to Vercel (`sin1`) by pushing `master`.
- `src/lib/<area>/actions.ts` (server actions, `"use server"`), `queries.ts` (reads), `src/components/<area>` (screens). Server actions return `ActionResult` through `runAction` (`src/lib/actionResult.ts`) because production hides thrown messages. Older kitchen actions still throw (see risks).
- Four languages for every UI string (en / ms / zh / my / bn dictionaries in `src/lib/i18n/dictionaries`).
- 166 migrations in `supabase/migrations`. Supabase project `cnnztwzzrwnuukehntcn`.

### 1.2 Authentication and roles (what the mechanism really is)

| Layer | Where | How it works |
|---|---|---|
| Login | Supabase Auth, `profiles` (46 rows) | `getSessionContext()` in `src/lib/auth.ts` reads claims, the profile and the user's `user_company_access` rows. |
| Role | `user_company_access.role` enum `user_role` | Only 4 values: `super_admin`, `company_admin`, `dept_manager`, `staff`. `company_id = null` means every company. |
| Modules | `user_company_access.allowed_modules` (null = all) | Module keys: hr, catering, kitchen, supplier-procurement, driver-logistics, finance-admin, reports, ai-assistant, overtime… Checked in `src/proxy.ts` by `canAccessPath` (`src/lib/modules.ts`). |
| Sections (tabs) | `allowed_sections` | `src/lib/sections.ts` (`kitchen:stock`, `supplier-procurement:orders` …). Screen-level only. |
| Module editors | table `module_editors` | Person who may edit/delete in one module (4 module keys in use); `user_is_module_editor()`. |
| Position rules | `src/lib/positionAccess.ts` | Maps staff position (HEAD CHEF, CHEF, KITCHEN HELPER…) to modules. Written for catering. |
| Special lists | `leave_approvers`, `supplier_payment_editors`, `operation_petty_cash_access`, `quotation_request_access`, `payroll_centre_access` … | One small table per special right. |
| Database enforcement | RLS on every table. Base rule `company_id IN (SELECT user_company_ids())`. 30 tables also have a **RESTRICTIVE `*_module_gate`** policy using `user_module_company_ids('<module>')` (expenses, monthly_sales, supplier_invoices, supplier_payments, purchase_orders, petty_cash_transactions, finance_payments, payroll_records …). |

O2 Life today: 16 people have access (1 `dept_manager`, 15 `staff`, each with a module list). There are no restaurant roles (Cashier, Chef, Storekeeper…) in the data model.

### 1.3 Database: the real tables and the real O2 Life numbers

The public schema has 136 tables (RLS on for all except 3 old backup tables). Counts for **O2 Life** (checked 22 Nov 2026):

| Area | Table | O2 Life rows | Note |
|---|---|---|---|
| Sales | `monthly_sales` | 11 (Jan–Nov 2026, `sales_type = 'total'`) | Monthly totals only: RM134,506.21 (Jan) … RM58,484.70 (Nov). Keyed from AutoCount. No day, no order, no payment method. |
| Costs | `expenses` | 830 (1 Aug – 22 Nov 2026), RM136,640.54 | Daily purchases keyed by day and category (SEAFOOD 39.7k, DRY GOODS 26.4k, FISH 11.9k, VEGETABLES 7.1k, ICE 1.2k …). No supplier column, no invoice link. |
| Costs | `breakdown_items` | 14 | Monthly Breakdown lines (raw, labour, utilities, contribution). |
| Petty cash | `petty_cash_transactions` / `operation_petty_cash` | 1 / 0 | |
| Suppliers | `suppliers` | 5 | Daus Aqua Seafood (COD), Malaysian Global Mart, Ng Ming Huat, Pemborong Beras CK, General Supplier. |
| Supplier invoices | `supplier_invoices` / `supplier_invoice_items` | 11 invoices, RM14,747.42, all `issued` | |
| Supplier payments | `supplier_payments` / `finance_payments` | 1 / 18 | |
| Purchase orders | `purchase_orders` | 1 (draft, RM2,320) | |
| Kitchen requests | `kitchen_purchase_requests` | 0 | Workflow exists, never used by O2 yet. |
| Stock | `ingredients` / `recipes` / `stock_movements` | **0 / 0 / 0** | The 1,221 ingredients, 675 recipes and 16 stock movements in the system all belong to the catering companies. 14 ingredients in total have a stock quantity. |
| Menu | `menus` / `menu_items` | 0 / 0 | |
| HR | `employees` / `payroll_records` | 19 / 15 | 3 kitchen helpers, 1 head chef, 3 commis chefs, 1 butcher, 1 grill cook, 1 bartender, service staff, 3 drivers, 2 directors. |
| Other | `vehicles` 2, `documents` 1, `task_audit_log` 67, `finance_payments` 18 | | |

No table exists for: orders, order items, payments by method, kitchen tickets, stations, tables, goods received, stock batches, cash sessions, waste approval, price history of sales.

### 1.4 Features that can be reused

| Need of the master prompt | What exists | Reuse verdict |
|---|---|---|
| Ingredient master, min / reorder | `ingredients` (name, unit_of_measure, current_stock_qty, reorder_level, unit_cost, category, preferred_supplier_id), pages `/kitchen/ingredients`, import by Excel | Reuse (O2 rows start empty). Needs purchase unit vs consumption unit, max level, location, reserved quantity (additive columns). |
| Stock ledger | `stock_movements` (types in / out / adjustment / wastage, reference_type + reference_id, document_id, notes, created_by) and `recordStockMovement()` in `src/lib/kitchen/actions.ts`, photo/OCR stock upload review | Reuse the table. **Do not reuse `recordStockMovement` as is** (not atomic, see risks). |
| Recipes | `recipes` + `recipe_ingredients` (yield_pax, status draft / approved, approved_by, `menu_item_id`), recipe review (`kitchenPurchase/recipeActions.ts`), recipe suggestion page | Reuse for O2 recipes. Missing: portion yield per menu item, waste %, version history. |
| Menu | `menus` / `menu_items` (price_per_pax) | Catering semantics (package per pax). A restaurant menu (code, selling price, station, availability) needs its own table so catering is not disturbed. |
| Kitchen Request → Chef review → Purchaser → Approval | `kitchen_purchase_requests` (+ items): draft → submitted → under_review (Purchaser adds supplier quotes) → pending_approval → approved → purchased → completed, rejected / revision_required. Audit entry on every move. Quantities suggested from recipe × pax. Roles: Kitchen = kitchen module, Purchaser = supplier-procurement module, approver = role ≠ staff. | **Best existing piece. Reuse as the Stock Requisition.** Missing: link to PO, GRN, stock-in; no "available stock" and "pending delivery" deduction; no self-approval rule. |
| Supplier master, items and prices, quotes | `suppliers` (terms, status, credit limit…), `supplier_purchase_lines` (AutoCount history, 2,500 rows, none for O2), `supplier_price_quotes`, `ingredient_supplier_matches`, pages Items & Prices, Ingredient Matching, Supplier Quotes | Reuse. Price history and supplier performance reports are missing. |
| Purchase order | `purchase_orders` (status draft / sent / acknowledged / completed / cancelled) + `purchase_order_items`, PDF/print, WhatsApp text | Reuse. No approval step, no partial receiving, no link from kitchen request. |
| Supplier invoice, payables | `supplier_invoices` (+items), duplicate warning in `procurement/queries.ts` (`findPossibleDuplicateInvoices`), `supplier_payments` (pending → approved → processing → paid), `supplier_payment_controls`, voucher flow, Finance > Supplier Payment | Reuse. Rule from the user: invoices are keyed for costing; suppliers are paid by monthly voucher. |
| Expenses, petty cash, claims | `expenses` (credit / debit note type), `petty_cash_transactions`, My Claims, Operation petty cash | Reuse as the operating-expense and daily-purchase record. |
| Finance and payments | `finance_payments` (rental, utilities, supplier), payment accounts, checklist, outstanding payment, priority centre reminders | Reuse. |
| Sales and P&L reports | `salesByCompanyMonth()` (`src/lib/reports/sales.ts`), Monthly Breakdown for Restoran Bara (limits: raw 38%, labour 30%, utilities 8%, contribution 4%, net 20%; `restoranBara.ts`), Monthly Costing, Business Overview, Reports hub, CSV / Excel / PDF / print export (`src/lib/export`) | Reuse. Monthly granularity only. |
| Approvals, audit | `approvals` table, `task_audit_log` (append-only: only insert and select policies), `recordAudit()` | Reuse the idea. Audit has text before / after, not JSON, and is written from the app (can be skipped). |
| Documents and upload | `documents` + Storage, extraction pipeline (Gemini), receipt upload | Reuse for invoice / GRN photos. |
| AI assistant | `src/lib/assistant` (tools: supplier_invoices, monthly_costing, staff, events …), `ai_conversations` | Extend with restaurant tools later. Read-only today. |
| Notifications | `priority_notifications`, push, reminders | Reuse for low stock, pending approvals. |
| Restaurant shell | `src/lib/restaurantView.ts` + `RestaurantView.tsx` + `NavLinks.tsx`: when O2 Life is the only company viewed, catering pages are hidden / redirected, side bar order Kitchen & Stock, Supplier & Procurement, Company Spending, Admin & Finance, HR, Vehicles & Drivers, Reports, AI Assistant | Extend (add restaurant pages to this view only). Do not rewrite. |
| Wastage | Session `o2-wastage-log` is building table `wastage_log` (migration `20261122000010_wastage_log.sql`, not committed at the time of this audit; table already exists in the database). Information only: **not added to any cost**, because the food is already counted when it is bought. | Reuse and align (see 5.4). Do not duplicate. |

### 1.5 What is missing (against the master prompt)

No POS / orders / tables / split bill / refund; no kitchen display and stations; no restaurant menu with selling price, cost and margin; no recipe versions or per-portion costing; no purchase unit vs consumption unit; no batches / expiry / locations; no stock reservation; no GRN (goods received note) and no partial delivery; no seafood receiving (weight, grade, temperature, cleaning yield); no waste approval / photo / variance; no stock count (physical count) workflow; no cash session / shift reconciliation; no sales by payment method or channel; no restaurant roles (Cashier, Storekeeper…); no sync-status or idempotency model; no restaurant dashboard (today / yesterday / week, average order value, food cost %, stock value); no supplier performance report; no AI assistant tools for the restaurant.

### 1.6 Bugs and risks found (existing code, not yet fixed)

1. **`recordStockMovement` is not safe** (`src/lib/kitchen/actions.ts:106`). It reads the balance, writes the movement, then writes the balance in three separate calls. Two people at once overwrite each other. It clamps stock at 0 (`Math.max(0, …)`) but still writes the unclamped quantity in the ledger, so ledger and balance can disagree and negative stock is hidden. It has no idempotency: pressing "Completed" twice on a purchase request adds the stock twice (`updatePurchaseRequestStatus`), and completing a production order twice deducts twice. It throws instead of returning `ActionResult` (production shows "React error #441").
2. **Stock is not protected in the database by module.** `ingredients`, `stock_movements`, `recipes`, `kitchen_purchase_requests`, `kitchen_purchase_request_items`, `supplier_price_quotes` have only the company rule. Any staff member with access to the company can insert or update stock through the API even if their screen hides Kitchen. (The new `wastage_log` does use the kitchen module gate.)
3. **No uniqueness in the database** for supplier invoices (supplier + number) or for expenses. The duplicate check is only a warning in the app.
4. **Hard deletes** exist for invoices, purchase orders, suppliers, ingredients, requests (with an undo snapshot). The master prompt needs cancel / void states and reversal entries for completed records.
5. **Three or four overlapping purchase flows**: `purchase_requests` (old, per ingredient), `procurement_requests`, `purchase_lists` / `purchase_list_items` (planner), and the newer `kitchen_purchase_requests`. Only the last one matches the intended workflow.
6. **Food cost can be counted twice** if expenses (daily purchases), supplier invoices and later goods-received are all summed. Today the Monthly Breakdown takes food from the Company Expenses categories (`RAW_ITEM_CATEGORIES`); supplier invoices are only for costing; nothing links an expense to an invoice.
7. **No self-approval rule**: `canApprove = role !== "staff"`; a manager who creates a request can approve it.
8. Time: dates are mixed UTC and a `+8h` shortcut in places (`nextRequestNo`); new tables must store `timestamptz` and compute the business day in `Asia/Kuala_Lumpur`.
9. Supabase types for newer tables are not generated, so code uses untyped clients (`kitchenPurchase/shared.ts`).
10. Other sessions edit the same folder and leave unfinished files (`globals.css`, `layout.tsx`, `TextSelection.tsx`, `tableExport.ts`, `ExportListButtons.tsx`, `types.ts`, i18n files). Restaurant work must stage explicit paths only.
11. Constraint widening is awkward: the Supabase tool refuses migrations that contain the word "drop", so a CHECK constraint (for example `stock_movements.movement_type`, `purchase_orders.status`) cannot be widened. The plan therefore uses **additive columns** (`reason_code`, `receiving_status`) instead of new enum values.

### 1.7 What must NOT be touched

- Catering flows and data of Kasturi Indah / Signature Solution: events, quotation requests, customer invoices, payments received, Event P&L, AutoCount invoice numbers, the 675 recipes and 1,221 ingredients of the catering companies, package menus, kitchen plan.
- Existing RLS gates and helper functions (`user_company_ids`, `user_module_company_ids`, `user_is_module_editor`): extend by adding, never by editing.
- `monthly_sales` as the verified sales figure from AutoCount, and the Monthly Breakdown seed data.
- Company Expenses as the daily food-purchase record (until a phase explicitly replaces it for a stated month).
- The supplier payment voucher flow, the AutoCount invoice number fields, JDT / Daiman customer rules.
- The `ActionResult` / `runAction` pattern, the 4-language rule, the fast-RLS rule (`company_id IN (SELECT user_company_ids())`).
- Any change to a shared function (`recordStockMovement`, `updateProductionOrderStatus`, `restaurantRedirect`) needs its own approval, because catering uses them.

---

## 2. Gap analysis against the master prompt

Legend: **Have** = works now, **Part** = exists but incomplete, **None** = missing. Size: S ≤ 2 days, M 3–6 days, L 7–12 days, XL > 12 days of build (including tests).

| Module | Status | Reuse | Gap | Size |
|---|---|---|---|---|
| A Management Dashboard | Part | Monthly Breakdown, Business Overview, Reports hub | Daily / weekly figures, payment methods, AOV, food cost %, stock value, low stock, pending approvals, waste; drill-down; empty states | M (after sales data) |
| B Sales & POS | None | `monthly_sales` | Daily sales by channel and payment method; later orders, tables, split bill, refunds, shift | S–M (daily entry/import), XL (full POS) |
| C Kitchen Display | None | | Tickets, stations, statuses, realtime | L (needs POS) |
| D Menu | None for restaurant | `menus` is catering | Restaurant menu items (code, price, station, availability), margin | M |
| E Recipes | Part | `recipes`, review, approval | Portion yield, waste %, version history, costing | M |
| F Inventory | Part (catering, unused by O2) | `ingredients`, `stock_movements`, stock upload review | Units conversion, batches, expiry, location, min/max, reserved, atomic ledger, stock count | L |
| G Seafood stock | None | | Lot receiving: weight, grade, temperature, cleaning yield | M |
| H Waste and variance | In progress by another session (info-only log) | `wastage_log` | Approval, photo, value, link to stock, variance report | S–M |
| I Stock Requisition | Part (good) | `kitchen_purchase_requests` | Available stock and pending delivery, no self-approval, link to PO | S–M |
| J Purchasing and PO | Part | `purchase_orders`, quotes | Approval, receive status, revision, partial delivery | M |
| K Suppliers | Part | `suppliers`, prices, quotes | Price history, performance, delivery reliability | S–M |
| L Goods Received | None | | GRN linked to PO, partial receiving, stock-in only on confirm | M–L |
| M Finance and expenses | Part (good) | expenses, supplier invoices, petty cash, payments | Draft→approve flow on expenses, DB duplicate guard, revenue by channel | S–M |
| N Reports and P&L | Part | Monthly Costing / Breakdown, export | Daily / weekly, by menu and category, valuation, variance, documented rules | M |
| O Cash reconciliation | None | | Cash session per shift, expected vs counted | S–M |
| P Staff and roles | Part | `user_company_access`, modules, sections | 9 restaurant roles, action-level permissions in DB | M |
| Sync / audit | Part | `task_audit_log`, `recordAudit` | Idempotency keys, atomic RPCs, DB-trigger audit with JSON before / after, sync status | M (foundation) |
| AI management assistant | Part | `src/lib/assistant` | Restaurant tools (read-only), "insufficient data" rule | S–M |

---

## 3. Proposed architecture

Principles: **extend the CMS, scope everything to O2 Life, reuse tables first, make money and stock changes only through database functions.**

```
                       (Next.js app, restaurant view of O2 Life only)
 Daily sales entry / import / later POS ───────────────┐
 Kitchen Request (kitchen_purchase_requests) ──┐       │
 Recipe + menu item (recipes, rst_menu_items)   │       │
                                                ▼       ▼
        Purchaser quotes → Approval → PO (purchase_orders) → GRN (rst_goods_receipts)
                                                                 │ confirm
                                                                 ▼
                          ONE stock ledger  stock_movements  ◄── sales consumption / waste / count / return
                                                                 │
                                       ┌─────────────────────────┤
                                       ▼                         ▼
                              Supplier invoice + payable   COGS / stock value / variance
                                       │                         │
                                       └──────────► Finance, P&L, Dashboard ◄── Sales (daily / monthly)
                                                         ▲
                                       audit_events (DB triggers, JSON before / after) on every table above
```

Layers:

1. **Database is the authority.** Multi-step operations (post a stock movement, confirm a GRN, close a shift, post sales consumption, reverse a record) are Postgres functions (`security definer`, `search_path` fixed) that run in one transaction, lock the row they change (`for update`), check the caller's restaurant role and company, and are idempotent through a unique `idempotency_key`. The app calls them through `runAction`.
2. **Scoping.** Every new table has `company_id` and the fast policy `company_id IN (SELECT user_company_ids())` plus a RESTRICTIVE gate by module or restaurant role. A function `is_restaurant_company(company_id)` (true only for O2 Life, from a new boolean `companies.is_restaurant`, additive) is used in the new functions and in a CHECK trigger so a restaurant row can never be written for a catering company.
3. **UI.** New pages live under the restaurant view only (new section keys, hidden for other companies), reuse the existing components (tables, filters, phone cards, export buttons), large touch targets, status badges, confirmation dialogs, empty states. Existing screens stay; the restaurant view links to them.
4. **Realtime** (only if a built-in kitchen display is chosen): Supabase Realtime on the ticket table. Not needed for phases 1–6.
5. **Exports** reuse `src/lib/export` (CSV / Excel / PDF / print).
6. **Tests** per phase: SQL tests of the functions (duplicate calls, concurrent calls, reversals) and a checklist run on a staging copy before production.

---

## 4. Table plan

Rule: reuse first; additive columns on existing tables (all nullable or with defaults, so catering rows are untouched); new tables prefixed `rst_` and always carrying `company_id`.

### 4.1 Reuse with additive columns

| Table | Add |
|---|---|
| `companies` | `is_restaurant boolean not null default false` (true for O2 Life only) |
| `ingredients` | `purchase_unit`, `unit_conversion` (purchase unit → consumption unit), `max_level`, `reserved_qty`, `storage_location`, `storage_type` (fresh / frozen / dry / chilled), `track_expiry`, `is_seafood`, `avg_cost` |
| `stock_movements` | `reason_code` (goods_received, sales_consumption, kitchen_usage, spoilage, staff_meal, transfer, return_to_supplier, count, opening, reversal), `unit_cost`, `batch_id`, `balance_after`, `idempotency_key` (unique where not null), `reverses_id`, `recorded_at` (business time). Keeps the existing 4 `movement_type` values, so no constraint change. |
| `recipe_ingredients` | `waste_pct`, `net_quantity` note |
| `recipes` | `portion_yield`, `version_no`, `cost_per_portion` (cached) |
| `purchase_orders` | `receiving_status` (not_received / partial / received / closed), `approval_status`, `kitchen_request_id`, `revision_no`, `sent_at` |
| `purchase_order_items` | `ingredient_id`, `received_qty` (cached from GRN lines) |
| `supplier_invoices` | `goods_receipt_id` (optional link) |
| `wastage_log` (other session) | later: `ingredient_id`, `stock_movement_id`, `approved_by`, `status`, `unit_cost` |

### 4.2 New tables (phased)

| Phase | Table | Purpose |
|---|---|---|
| 1 | `rst_sales_daily` | One row per business day × channel (dine_in / takeaway / delivery / online) × payment method (cash / qr_duitnow / card / online_platform / other): gross, discount, refund, orders count, source (manual / import / pos), status (draft / confirmed / cancelled), unique key to stop duplicates. |
| 1 | `rst_cash_sessions` | Shift: opening cash, cash sales, expenses paid, refunds, withdrawals, expected closing, counted closing, variance, explanation, opened_by / closed_by, status. |
| 1 | `rst_staff_roles` | `(user_id, company_id, role)` for the 9 restaurant roles (see 5). |
| 1 | `audit_events` | Generic audit log filled by DB triggers: table, record id, action, before jsonb, after jsonb, actor, at. Insert-only. |
| 2 | `rst_menu_items` (+ `rst_menu_addons`) | Code, name, category (Fresh Seafood … Add-ons), selling price, recipe_id, station, prep minutes, is_available, active. Margin computed from recipe cost. |
| 2 | `rst_recipe_versions` | Snapshot of ingredients, quantities, yield and cost per portion each time a recipe is approved; past costs are never overwritten. |
| 3 | `rst_stock_batches` | Batch no, ingredient, supplier, received qty, remaining qty, unit cost, expiry, GRN line. |
| 3 | `rst_stock_counts` (+ lines) | Physical count sessions, expected vs counted, approved adjustment (posts `count` movements). |
| 4 | `rst_goods_receipts` (+ lines) | GRN: PO link, delivery date, per line ordered / delivered / accepted / rejected / short / damaged, actual price, batch, expiry, photo ids. Confirm posts stock. |
| 5 | `rst_seafood_lots` | Lot: type, supplier, received weight, price per kg, grade, fresh / frozen, temperature, cleaned weight, yield %, freshness date, GRN line. |
| 6 | `rst_sync_jobs` | Outbox for side effects (for example "post sales consumption for 22 Nov"): status Pending / Processing / Synced / Failed / Requires Review, attempts, last error, idempotency key. |
| 7 (only if chosen) | `rst_orders`, `rst_order_items`, `rst_order_payments`, `rst_order_events`, `rst_tables`, `rst_stations`, `rst_kds_tickets` | Built-in POS and kitchen display. |

All new tables: RLS on, fast company policy, RESTRICTIVE gate, `created_at / updated_at timestamptz`, soft delete (`voided_at`, `voided_by`, `void_reason`) instead of DELETE, `updated_at` trigger (`set_updated_at`), audit trigger.

---

## 5. Permission matrix

### 5.1 How the 9 roles map onto what exists

| Master-prompt role | Maps to | Notes |
|---|---|---|
| Owner | `user_company_access.role = super_admin` | Already exists (Ms. Nabilah, directors). |
| Admin | `company_admin` for O2 Life | Already exists. |
| Manager | `dept_manager` (+ `rst_staff_roles = manager`) | Approves requisitions, POs, voids, refunds, stock adjustments. |
| Cashier | `staff` + `rst_staff_roles = cashier` | Sales entry, cash session of own shift. |
| Chef | `staff` + `kitchen` module + `rst_staff_roles = chef` | Recipe review, requisition review, waste approval (first level). |
| Kitchen Staff | `staff` + `kitchen` module + `rst_staff_roles = kitchen_staff` | Requisition draft, waste log, stock usage. |
| Purchasing | `staff` + `supplier-procurement` module + `rst_staff_roles = purchasing` | Quotes, PO, supplier invoices (not approval). |
| Storekeeper | `staff` + `kitchen` module + `rst_staff_roles = storekeeper` | GRN, stock count, stock movements. |
| Finance | `staff` + `finance-admin` module + `rst_staff_roles = finance` | Expenses, payments, reports (no stock edits). |

`allowed_modules` / `allowed_sections` keep deciding what appears in the side bar. `rst_staff_roles` decides **what an action may do**, enforced inside the database functions and the RESTRICTIVE gates through `rst_has_role(company_id, roles[])`. A person can hold several restaurant roles.

### 5.2 Matrix (R = read, C = create, E = edit own draft, A = approve, X = cancel / void with reason, — = none)

| Area | Owner / Admin | Manager | Cashier | Chef | Kitchen Staff | Purchasing | Storekeeper | Finance |
|---|---|---|---|---|---|---|---|---|
| Dashboard / reports | R | R | R (own shift) | R (kitchen) | — | R (purchasing) | R (stock) | R |
| Daily sales / shift | R C E X | R C A X | C E (own) | — | — | — | — | R |
| Menu / prices | R C E | R C E | R | R | R | R | R | R |
| Recipes | R C E A | R C E A | — | R C E A (first level) | R | R | R | R |
| Stock movements | R C X | R C A X | — | R C | R C (usage / waste) | R | R C X | R |
| Stock count / adjustment | A | A | — | C | C | — | C | R |
| Requisition | R A | R A | — | R review | R C E | R | R | R |
| PO | R A | R A | — | R | — | R C E | R | R |
| GRN | R | R | — | R | — | R | R C E | R |
| Supplier invoice | R C A | R | — | — | — | R C E | R | R C A |
| Expenses / petty cash | R C A X | R C | — | — | — | — | — | R C A |
| Payments to suppliers | R A | — | — | — | — | — | — | R C |
| Waste | R A | R A | — | R A (first level) | R C | — | R C | R |
| Users and roles | R C E | — | — | — | — | — | — | — |

Separation of duties (enforced by trigger, configurable by Owner): the person who creates a requisition, PO, adjustment or expense cannot approve the same record.

---

## 6. Synchronisation and transaction lifecycle

### 6.1 Rules

1. **One entry, referenced everywhere.** A fact is stored once (a sale day row, a GRN line, a stock movement). Everything else reads or aggregates it (dashboard, P&L, valuation).
2. **Atomic functions.** `rst_post_stock_movement`, `rst_confirm_goods_receipt`, `rst_close_cash_session`, `rst_post_sales_consumption(day)`, `rst_reverse(record)` each run in one transaction and lock the ingredient row, so two simultaneous calls cannot lose an update or oversell.
3. **Idempotency.** Every posting call carries an `idempotency_key` (for example `grn:<id>:line:<id>`, `sales-consumption:<company>:<date>`, `count:<id>:<ingredient>`). A second call with the same key returns the first result and changes nothing. Double clicks, retries and page refreshes are therefore safe.
4. **No silent deletion.** Completed records are never deleted or edited in place. Cancel = new reversal row (`reverses_id`, opposite quantity or amount) with a reason; correction = reversal + new entry; both keep the original visible. Drafts may be deleted by their creator.
5. **Controlled adjustment.** Editing a completed figure (for example a counted quantity) goes through an adjustment that needs a reason and an approver, and writes before / after to `audit_events`.
6. **Audit in the database.** Triggers on the restaurant tables write `audit_events` (JSON before / after, actor `auth.uid()`, time). The app cannot skip it.
7. **Never claim success on failure.** Actions return `ActionResult`; the screen shows a toast only after `ok: true`. Side effects that run later use `rst_sync_jobs`: Pending → Processing → Synced, or Failed (with the error, retry button) or Requires Review (a human decision). The screen shows the real status.
8. **Time.** `timestamptz` everywhere; the business day is `(now() at time zone 'Asia/Kuala_Lumpur')::date`; a day can be closed by the Manager.

### 6.2 Lifecycle of the main records

- **Sales day**: Draft → Confirmed (Manager can lock the day) → Cancelled (reversal row, reason). Phase 7 adds Order: Pending → Confirmed → Preparing → Ready → Served → Completed, Void / Cancelled / Refunded with authorisation.
- **Requisition** (existing `kitchen_purchase_requests`): Draft → Submitted → Under review (Chef / Purchaser) → Pending approval → Approved → Purchased → Completed; Rejected / Revision required. New: suggested quantity = requested − available usable stock − pending delivery.
- **PO**: Draft → Pending approval → Approved → Sent → (GRN) Partially received → Fully received → Closed; Cancelled. Stored with the existing `status` values plus the additive `approval_status` and `receiving_status`.
- **GRN**: Draft → Confirmed (posts stock-in at the actual price) → Cancelled (reversal movements). Stock is never changed by the PO, only by a confirmed GRN.
- **Stock**: every change is a `stock_movements` row with `reason_code`. Balance = sum of movements; `ingredients.current_stock_qty` is updated inside the same function and a nightly check compares both.
- **Reservation vs deduction**: take-away and dine-in sales **deduct** when the day's sales are posted (phase 6: theoretical consumption = quantity sold × approved recipe); **reserve** is used only for pre-orders (phase 7). Chosen to keep the first versions simple.
- **Refund / void**: reverses the revenue row and, if consumption was already posted, posts a `reversal` movement (food already cooked counts as waste, not as a stock return, unless the Manager says otherwise).
- **Supplier invoice and payable**: invoice links to PO / GRN; payment follows the existing voucher flow; an invoice is never counted as cost when GRN or expenses already counted the same purchase (see 7.2).

---

## 7. Calculation rules (assumptions are marked A)

All amounts in RM, before SST / service charge unless a line says otherwise (A1: the AutoCount sales keyed today are before tax; keep that).

### 7.1 Revenue

- Net Revenue = Gross sales − discounts − refunds (A2: voided sales are not revenue). Shown by channel and by payment method.
- Average order value = Net Revenue ÷ number of orders (needs the orders count; shown as "insufficient data" when not recorded).

### 7.2 Food cost / COGS: two modes, never added together

The restaurant today records food when it is **bought** (Company Expenses by day), with no stock in the system. Counting both purchases and stock consumption would count the food twice.

- **Purchase mode (current, default).** Food cost of a period = food categories of Company Expenses in that period (`RAW_ITEM_CATEGORIES`). Used for every month before an opening stock count exists. This is what Monthly Breakdown does today.
- **Inventory mode (from the first approved opening stock count date, A3).** COGS = opening stock value + purchases received (confirmed GRN at actual price, or the food-category expenses of the same purchases, **one source only per period**) − closing stock value. A stock count at each month end gives the closing value.
- Switch date is stored per company (`companies.inventory_mode_from`); reports show which mode a month used.
- Supplier invoices are used for supplier payables and price history, not added to food cost when the same purchase is already in expenses or in a GRN (A4: duplicate guard by supplier + invoice number).
- Cost method: weighted average cost per ingredient (A5); batch cost is kept for seafood lots (see 7.4).

### 7.3 Recipe, menu and food cost %

- Ingredient cost in a recipe line = net quantity ÷ (1 − waste %) × current average cost of the consumption unit (unit converted from the purchase unit).
- Cost per portion = Σ line costs ÷ portion yield. Margin per serving = selling price − cost per portion; item food cost % = cost ÷ selling price (both before tax).
- Each approval stores a `rst_recipe_versions` snapshot; old sales keep the cost of the version in force that day.
- **Theoretical consumption** = quantity sold × approved recipe. **Actual consumption** = opening + received − closing − recorded waste. **Variance** = actual − theoretical; unexplained variance is the part not covered by recorded waste.
- Food cost % (period) = COGS ÷ Net Revenue. Bara target for raw item cost: 38% of sales (existing limit in the Monthly Breakdown) (A6).

### 7.4 Seafood yield

- Yield % = cleaned weight ÷ received weight × 100.
- Usable cost per kg = price per kg ÷ yield % (e.g. RM30/kg at 70% yield = RM42.86 per usable kg).
- Cleaning loss is recorded as its own reason and is **not** spoilage. Spoilage / expired is separate.
- Lot cost is kept per batch so the Chef can see which delivery had a poor yield.

### 7.5 Waste

- Waste cost = quantity × average (or lot) cost at the date. Reported by item, reason, day, week, month, and as % of Net Revenue.
- Until inventory mode starts, waste stays **information only** (as the wastage-log session decided), because the food was already expensed when bought. In inventory mode waste is part of COGS, shown separately, **not added on top**.

### 7.6 Profit and cash

- Gross Profit = Net Revenue − COGS.
- Operating Profit = Gross Profit − operating expenses (labour from payroll, utilities, rent, contribution and other expenses; food and stock purchases are excluded from operating expenses).
- Net profit follows the existing Monthly Breakdown definition (limits: labour 30%, utilities 8%, contribution 4%, net 20%).
- Cash reconciliation per shift: expected closing = opening cash + cash sales − cash expenses − refunds paid in cash − withdrawals; variance = counted − expected; a non-zero variance needs a written reason from the closer and the Manager.
- Stock value = Σ quantity on hand × average cost. Low stock = quantity ≤ reorder level; critical = ≤ 50% of reorder level (A7).
- No figure is invented: a missing input shows RM0.00 or "insufficient data" with the reason.

---

## 8. Risk areas

| Risk | Why | Control |
|---|---|---|
| Breaking catering | Shared tables and functions | Additive columns only; new `rst_` tables; `is_restaurant_company()` checks; no edits to shared functions without separate approval; regression check of catering pages before every deploy |
| Double counting food cost | Expenses + invoices + GRN + consumption | One source per period (7.2), mode switch date, reports show the mode |
| Stock errors | Non-atomic `recordStockMovement`, rounding, units | Atomic RPC, idempotency keys, unit conversion table, nightly ledger-vs-balance check |
| Setup effort | O2 has no ingredients or recipes today | Start from its own purchase history (daily expenses, supplier invoices) and an Excel import; never copy catering recipes into O2 without the Chef's approval |
| Staff adoption | Kitchen staff and older users | One screen per job, large buttons, 4 languages, phone cards already exist, training sheet per role |
| POS reliability | Internet outage, hardware, payments | Do not build POS first; if built, offline plan is a prerequisite (decision (a)) |
| Security | Staff can write stock through the API today | Restrictive gates and role checks in the new functions; later (separate approval) add gates to the old kitchen tables |
| Data quality | Daily expenses have no supplier link | Optional supplier field going forward; no back-filling by guess (fill blanks, never overwrite) |
| Concurrency on the repo | Several sessions edit | Explicit staging, small commits per phase |
| Cost of changes in production | One Vercel project, direct to production | Test on a copy of the data first; one phase per deploy; rollback = revert commit, migrations are additive so data stays |

---

## 9. Phased roadmap

**Smallest useful first increment (recommended): Phase 1, daily sales by payment method + cash session + restaurant dashboard v1.** It needs no stock set-up, uses only data the restaurant has today (daily sales slips / POS end-of-day report), and immediately gives today / yesterday / week / month sales, payment split, cash difference, and food cost % using the existing daily expenses. Nothing in it can disturb catering.

| Phase | Content | New / changed | Size | Depends on |
|---|---|---|---|---|
| 0 | This audit and plan | docs only | done | |
| 1 | Daily sales entry and Excel import (by day, channel, payment method), cash sessions per shift, restaurant roles table, audit events, Dashboard v1 (RM0.00 / empty states; food cost % from Company Expenses; drill-down to rows). **Phase 1 does not change `monthly_sales` or any existing report**: the dashboard reads daily rows only and shows, beside them, a reconciliation with the AutoCount monthly total (difference, never a sum), so nothing can be counted twice. A rule to let daily rows replace the monthly figure in the old reports is a separate decision for later. | `rst_sales_daily`, `rst_cash_sessions`, `rst_staff_roles`, `audit_events`, `companies.is_restaurant`; new pages in the restaurant view | M (4–6 days) | decision (a), (d) |
| 2 | Restaurant menu (categories, price, station) + recipes with portion yield, waste %, versions and cost per portion; margin report | `rst_menu_items`, `rst_menu_addons`, `rst_recipe_versions`, recipe columns | M (4–6 days) | Chef provides recipes |
| 3 | Stock core: ingredient set-up for O2 (units, conversion, min / max, location), atomic stock movement function, opening stock count, stock count workflow, wastage log linked to stock (with the other session), low-stock notices | ingredient and ledger columns, `rst_stock_batches`, `rst_stock_counts`, RPCs | L (8–12 days) | decision (b); phase 2 helps |
| 4 | Purchasing chain: requisition shows available stock and pending delivery, approval without self-approval, PO approval, **GRN with partial receiving**, stock-in only on confirm, supplier invoice linked to GRN, duplicate guard in the database, supplier price history | `rst_goods_receipts` (+lines), PO columns | L (8–12 days) | phase 3 |
| 5 | Seafood receiving: lot weight, grade, temperature, cleaning yield, cost on usable weight | `rst_seafood_lots` | S–M (2–4 days) | phase 4 |
| 6 | Sales → stock consumption by recipe (posted per day through a sync job), variance report, inventory-mode P&L (food cost %, gross / operating profit, stock valuation, waste cost), sync status screen | `rst_sync_jobs`, report pages | M–L (6–9 days) | phases 2–4 |
| 7 | Built-in POS + kitchen display (orders, tables, split bill, void, refund, shifts, tickets per station) **only if decided** | `rst_orders…`, `rst_kds_tickets` | XL (4–8 weeks) | decision (a) |
| 8 | AI assistant tools for the owner (daily summary, food cost, waste, stock warnings, supplier price changes, unusual expenses, cash differences; "insufficient data" rule; read-only), user guide, deployment checklist, backup and rollback notes | assistant tools, docs | S–M (3–5 days) | data from earlier phases |

Order differs from the master prompt (Menu, Recipe, Inventory, POS, KDS first) on purpose: O2 has no ingredients, recipes or stock today, so a stock-first order would take weeks before anything is useful, while sales and cash figures can start the day the phase is approved.

Each phase ends with: migration (additive), code, translations in 4 languages, tests (duplicate calls, cancel, reversal, concurrency, permissions), a check that catering pages are unchanged, commit with explicit paths, deploy by push, and a short user guide. The next phase starts only after approval.

---

## 9a. Phase 1 status (approved 22 Nov 2026: "Fasa 1 dahulu")

**Built:** migration `20261122000020_restaurant_phase1.sql` (applied to the database), module key `restaurant`, pages under `/restaurant` (Dashboard, Daily Sales, Cash Sessions, Staff Roles), side-bar entry "Restaurant" (restaurant view only), 4-language strings.

- Database: `companies.is_restaurant` (true for O2 Life only), `rst_staff_roles`, `rst_sales_daily`, `rst_cash_sessions`, `audit_events`; functions `rst_is_restaurant`, `rst_has_role`, `rst_close_cash_session`, `rst_reopen_cash_session`, `rst_audit`. RLS: fast company rule + RESTRICTIVE gate on the `restaurant` module; writes need a restaurant role (Cashier / Manager / Finance, Admins always). Guard triggers: a line is inserted as a draft; a confirmed line cannot be edited, only cancelled by a Manager / Admin with a reason; no delete of confirmed lines or of cash sessions; closing the cash is one atomic function and is idempotent.
- Database tests run before release (rolled back, nothing left in the tables): duplicate line refused, catering company refused, discount above sales refused, edit of confirmed refused, cancel without reason refused, delete of confirmed refused, cash close with a difference needs a reason, a draft cash line blocks closing, second close returns the first result, direct reopen blocked, reopen only by the function, audit rows written, a person with no restaurant role cannot insert or see rows.
- Not in this increment (still to do inside phase 1): **Excel / CSV import of daily sales** (waits for the sample file or report of the system the restaurant uses today, decision (a)); the audit trail screen (the data is already collected); CSV / PDF export buttons on the three screens (the page tools of the side bar still print).
- Assumptions used: channels Dine-in / Takeaway / Delivery / Online; payment methods Cash / QR-DuitNow / Card / Online platform / Other; shifts 1 to 3 on the screens (the database allows 1 to 9); one line per day, shift, channel and payment method; sales amount is the bill value before discount; Owner assigns restaurant roles in Staff Roles and switches the Restaurant module on in Settings for staff whose module list is limited.

## 10. Decisions only Ms. Nabilah can make (with recommendation)

(a) **How do sales get into the system?** Built-in POS + kitchen display, or import from the POS / system the restaurant uses now, or manual daily entry from the end-of-day report. **Recommend:** manual / Excel import of daily sales first (phase 1); decide on a built-in POS only after seeing the phase 1 dashboard. Need to know: what does the restaurant use now, and can it export Excel / PDF? About "eHorse": the master prompt itself names **e-HORS (WinX Catering)**; please confirm whether "eHorse" is that system, whether Bara already uses it, and whether it exports Excel / PDF.

(b) **Stock in / stock out for Bara: in the CMS or in eHorse?** **Recommend:** decide after (a). Until she says so, the Stock tab stays visible for O2 Life (nothing hidden). If eHorse keeps the stock, the CMS only needs the purchasing, finance and dashboard parts and imports stock figures.

(c) **First phase to build.** **Recommend:** phase 1 (daily sales, cash session, dashboard v1).

(d) **Who has which role.** She names the people for Owner, Admin, Manager, Cashier, Chef, Kitchen Staff, Purchasing, Storekeeper, Finance. Also: may the Manager approve their own requests (recommend: no), and who approves waste and stock adjustments.

Other questions: Does the price on the menu include SST / service charge? Which payment methods does Bara accept (cash, DuitNow QR, card, GrabFood / ShopeeFood …)? How many shifts a day and who counts the cash? Does she want food cost kept on purchases (as now) until the first month-end stock count?

## 11. Reference benchmark: e-HORS / WinX (read 22 Nov 2026)

Ms. Nabilah asked for the official sites to be studied as a **workflow benchmark only** (no branding, assets or code copied).

**Pages actually read (all loaded, readable text):** `ehors-tech.com` (WinX), `ehors.com`, `ehors.com/pos/`, `ehors.com/venue-catering/`, and four sub-pages `ehors.com/food-and-beverage/`, `/purchasing/`, `/inventory-management/`, `/accounting/`.
**Not read / not visible:** the module diagrams on the `ehors.com` home page are images (not readable); the pages for front office, housekeeping, sales & marketing, service centre, HR and the hotel / resort / theme-park pages were not opened (not relevant to a single restaurant). The sites do **not** describe a kitchen display system, kitchen ticket routing, a management dashboard, roles / permissions in detail, or any offline mode, so those parts of the master prompt cannot be benchmarked against them and stay designed from Bara's own needs. Everything below is the vendor's own marketing description, not verified behaviour.

**Concepts worth adapting (written in our own words and our own tables):**

| Reference concept | How it connects modules | Adaptation for Bara | Phase |
|---|---|---|---|
| Recipes as a bill of materials, **nested sub-recipes**, costed at item level; theoretical cost compared with actual cost from sales and goods received | Menu → recipe → ingredient cost → variance | Sub-recipes for sambal, marinade, sauces made once and used in many dishes (`rst_recipe_components`); theoretical vs actual is already rule 7.3 | 2, 6 |
| "Replace item" updates every recipe that uses an ingredient | Inventory → recipes | A controlled "replace ingredient" action (creates new recipe versions, never edits history) | 2 |
| Stock quantity and value update in real time from goods received, usage, returns, transfers, corrections, stock takes; valuation by last or average price | One ledger feeds stock value | Same single ledger (`stock_movements` + `reason_code`); weighted average (A5), last price shown beside it | 3 |
| Purchase advice from minimum stock, minimum order, **available stock and outstanding requests** | Inventory → purchasing | Matches our net-quantity rule: requested − available usable stock − pending delivery; add **minimum order quantity** per supplier item | 4 |
| **Market-list buying** (templates per kitchen / location) beside standard purchasing | Kitchen → purchaser | Bara buys fresh seafood and vegetables **daily**: a daily market-list template (usual items and quantities, edited each morning) feeding the same requisition → PO → GRN chain | 4 |
| Approvals configurable from 1 to 3 levels | Purchasing control | Approval levels per company setting (default 1: Manager; optional Chef then Manager), no self-approval | 4 |
| Goods received in stages; returns as negative PO; received goods **reconciled with the supplier invoice** | Purchasing → inventory → payables | GRN partial receiving; return-to-supplier as a reversal movement + credit note link; GRN ↔ invoice matching screen | 4 |
| Revenue, purchases, stock movements and payment methods post to the ledger automatically, no manual journals | Everything → accounting | No general ledger is built (AutoCount stays the accounts); instead each source posts once to our own tables and the reports read them. Optional export for AutoCount later | 6 |
| POS: table sections with revenue reports, split / join bill, time-slot menus, mobile waiter app, hardware-independent, browser-based | POS → kitchen, stock, finance | Reinforces keeping the POS decision (a) separate; a browser POS on tablet / phone is feasible, offline behaviour must be designed by us (not described by the reference) | 7 |
| Real-time operation, no night audit | Whole system | Day-close by the Manager is optional and never blocks sales | 1, 6 |

Nothing in the reference changes the recommended first increment: daily sales, cash and dashboard (phase 1) do not depend on any of the above.

## 12. Assumptions made (documented, to be corrected if wrong)

A1 sales are before tax; A2 voids and refunds are not revenue; A3 inventory mode starts at the first approved opening count; A4 duplicate invoice = same supplier + number; A5 weighted average cost; A6 raw item cost target 38% of sales (existing Bara limit); A7 critical stock = half the reorder level; business day and shifts follow Malaysia time; no restaurant data is copied from the catering companies; no fake data is inserted at any time.
