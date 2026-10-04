import type { ModuleKey } from "@/lib/constants";

export type KBEntry = {
  id: string;
  module: ModuleKey | "general";
  type: "tutorial" | "faq" | "definition" | "troubleshooting" | "getting-started";
  title: string;
  /** Words/phrases that should match this entry when a user asks a question. */
  keywords: string[];
  content: string;
};

/**
 * The AI Assistant's knowledge base. This is the ONLY source of truth it draws
 * tutorials, definitions, and troubleshooting guidance from — see
 * src/lib/assistant/systemPrompt.ts, which instructs the model never to answer
 * from general knowledge alone. Module owners should keep their module's
 * entries up to date the same way they maintain their module's code (see
 * CONTRIBUTING.md).
 */
export const KNOWLEDGE_BASE: KBEntry[] = [
  // ---------------------------------------------------------------------
  // GETTING STARTED
  // ---------------------------------------------------------------------
  {
    id: "gs-01-dashboard",
    module: "general",
    type: "getting-started",
    title: "Understanding the Main Dashboard",
    keywords: ["dashboard", "main dashboard", "overview", "home", "kpi"],
    content:
      "The Main Dashboard is the home screen after logging in. It shows real, database-driven KPI cards (Revenue MTD, Expenses, Monthly Costing, Supplier Outstanding, Customer Outstanding, Upcoming Events, Pending Payments, Pending Approvals) plus per-module summaries (Supplier Payments, Customer Outstanding, Catering Events, Kitchen Production, Driver Deliveries, HR, Marketing) and an Alerts panel. Every figure changes based on which company is selected in the sidebar.",
  },
  {
    id: "gs-02-company-selector",
    module: "general",
    type: "getting-started",
    title: "Selecting a Company",
    keywords: ["company selector", "switch company", "all companies", "signature solution", "kasturi indah", "o2 life"],
    content:
      "At the top of the sidebar is the company selector: 'All Companies' or one of Signature Solution, Kasturi Indah, O2 Life. Whatever you pick filters every KPI, table, chart, and report on every page — it's not just cosmetic, every query is scoped to the selected company. You'll only ever see companies you've been granted access to.",
  },
  {
    id: "gs-03-adding-staff",
    module: "hr",
    type: "getting-started",
    title: "Adding Staff",
    keywords: ["add staff", "add employee", "new employee", "hire"],
    content:
      "📌 How to Add a Staff Member\n1. Go to HR.\n2. Click + Add Employee.\n3. Fill in name, department, position, and salary details (or use Upload Document / Import Excel if you have a staff list file).\n4. Review the information.\n5. Click Confirm & Save.\n\n💡 Tip: You can also add certificates (food handling, work permit, training) from the employee's own profile page afterwards.",
  },
  {
    id: "gs-04-catering-event",
    module: "catering",
    type: "getting-started",
    title: "Creating a Catering Event",
    keywords: ["create catering event", "new event", "add event", "catering booking"],
    content:
      "📌 How to Create a Catering Event\n1. Go to Catering.\n2. Click + New Event.\n3. Enter the customer, event date/time, location, pax count, and menu description.\n4. Click Confirm & Save.\n5. From the event's page you can then add a quotation, assign staff/equipment, and schedule a delivery.\n\n💡 Tip: Creating the event doesn't automatically create a quotation or invoice — those are separate steps from the event's own page.",
  },
  {
    id: "gs-05-kitchen-production",
    module: "kitchen",
    type: "getting-started",
    title: "Adding Kitchen Production",
    keywords: ["kitchen production", "production order", "add production"],
    content:
      "📌 How to Add a Production Order\n1. Go to Kitchen.\n2. Click + New Production Order.\n3. Choose the recipe and quantity/pax needed (linked to a catering event if applicable).\n4. Click Confirm & Save.\n5. Update its status (Planned → In Progress → Completed) as the kitchen works through it.\n\n💡 Tip: Ingredient stock levels are checked against recipes — if something's short, raise a Purchase Request from the same module.",
  },
  {
    id: "gs-06-assign-driver",
    module: "driver-logistics",
    type: "getting-started",
    title: "Assigning a Driver",
    keywords: ["assign driver", "delivery", "driver logistics", "vehicle assignment"],
    content:
      "📌 How to Assign a Driver to a Delivery\n1. Go to Operation Management.\n2. Click + New Delivery (or open it from the catering event's page).\n3. Select the driver, vehicle, scheduled time, and destination.\n4. Click Confirm & Save.\n5. Update the delivery's status as it progresses (Scheduled → In Transit → Delivered).\n\n💡 Tip: Only drivers marked 'Available' show up as assignable — check the Driver Availability list if someone you expect isn't listed.",
  },
  {
    id: "gs-07-add-supplier",
    module: "supplier-procurement",
    type: "getting-started",
    title: "Adding a Supplier",
    keywords: ["add supplier", "new supplier", "supplier procurement"],
    content:
      "📌 How to Add a Supplier\n1. Go to Supplier & Procurement.\n2. Click + Add Supplier (or use Import Excel/CSV if you have a supplier list file).\n3. Enter the supplier's name, contact details, and category.\n4. Click Confirm & Save.\n\n💡 Tip: You can mark a supplier Active, Inactive, or Blacklisted — blacklisted suppliers are flagged when creating a new purchase order.",
  },
  {
    id: "gs-08-upload-supplier-invoice",
    module: "supplier-procurement",
    type: "getting-started",
    title: "Uploading a Supplier Invoice",
    keywords: ["upload supplier invoice", "supplier invoice", "add invoice", "upload invoice", "create supplier invoice"],
    content:
      "📌 How to Upload a Supplier Invoice\n1. Go to Supplier & Procurement.\n2. Select Supplier Invoice.\n3. Click + Add Invoice.\n4. Choose Manual Entry or Upload Document (PDF, photo, or screenshot).\n5. If uploading, wait for AI extraction to fill the fields — or fill them in yourself if extraction isn't available.\n6. Review the extracted information.\n7. Correct anything that is wrong.\n8. Click Confirm & Save.\n\n💡 Tip: Always check the invoice number and amount before saving — the system also flags likely duplicate invoice numbers from the same supplier.",
  },
  {
    id: "gs-09-request-payment",
    module: "supplier-procurement",
    type: "getting-started",
    title: "Requesting Payment",
    keywords: ["request payment", "supplier payment", "pay supplier", "payment request"],
    content:
      "📌 How to Request a Supplier Payment\n1. Go to Supplier & Procurement → Supplier Invoice, and open the invoice you want to pay (it must not already be Paid).\n2. Click Request Payment.\n3. Confirm the amount and payment method.\n4. Submit — this creates a payment request that goes through the normal approval workflow.\n5. A Company Admin or authorized approver reviews it on the Payment Dashboard and approves or rejects it.\n6. Once approved, it's marked Paid and the invoice status updates automatically.\n\n💡 Tip: I can explain this process, but I can't submit or approve payments myself — that always has to happen through the actual buttons in the app, by someone with the right permission.",
  },
  {
    id: "gs-10-check-outstanding-payments",
    module: "supplier-procurement",
    type: "getting-started",
    title: "Checking Outstanding Payments",
    keywords: ["outstanding payments", "unpaid invoices", "check overdue payments", "payment dashboard"],
    content:
      "📌 How to Check Outstanding Payments\n1. Go to Supplier & Procurement → Payment Dashboard for a live summary of what's owed, overdue, due today, and due this week.\n2. Or go to Reports → Supplier Outstanding Report for a filterable, exportable list of every unpaid invoice.\n3. For customer-side money owed to you, use Reports → Customer Outstanding Report or the Main Dashboard's Customer Outstanding card.\n\n💡 Tip: Ask me directly — I can look up your current supplier/customer outstanding totals and overdue counts for the companies you have access to.",
  },
  {
    id: "gs-11-creating-reports",
    module: "reports",
    type: "getting-started",
    title: "Creating Reports",
    keywords: ["reports", "export report", "create report", "excel export", "pdf export"],
    content:
      "📌 How to Use Reports\n1. Go to Reports for the full list (Monthly Costing, Revenue, Expenses, Supplier/Customer Outstanding, Supplier Payments, Catering, Kitchen, Driver, HR, Marketing, Company Summary).\n2. Open the one you need and use the filter bar (Company, Month, Year, Department, Category, Status).\n3. Click Export Excel or Export CSV to download the filtered table, or use your browser's Print (Ctrl/Cmd+P) for a PDF-style copy.\n\n💡 Tip: Reports always reflect real database records for the selected company — nothing is hardcoded or estimated.",
  },
  {
    id: "gs-12-upload-excel",
    module: "general",
    type: "getting-started",
    title: "Uploading Excel Data",
    keywords: ["upload excel", "import excel", "csv import", "bulk import", "spreadsheet"],
    content:
      "📌 How to Bulk-Import Data from Excel/CSV\n1. Go to the module's list page (e.g. HR, Kitchen → Ingredients, Marketing → Leads, Supplier & Procurement).\n2. Click Import (usually next to the + Add button).\n3. Upload your .xlsx or .csv file.\n4. Map your file's columns to the system's fields.\n5. Review the preview — rows with problems are flagged before anything saves.\n6. Click Confirm & Save to import the reviewed rows.\n\n💡 Tip: Nothing is saved until you confirm the review step — you can always fix a column mapping or a flagged row before committing.",
  },

  // ---------------------------------------------------------------------
  // ADDITIONAL TUTORIALS
  // ---------------------------------------------------------------------
  {
    id: "tut-check-cert-expiry",
    module: "hr",
    type: "tutorial",
    title: "Checking staff certificate expiry",
    keywords: ["certificate expiry", "cert expiring", "work permit expiry", "food handling certificate"],
    content:
      "📌 How to Check Staff Certificate Expiry\n1. Open the employee's profile from HR to see their certificates and expiry dates directly.\n2. Or check the Main Dashboard's HR card, which shows a count of certificates expiring within 30 days.\n3. Ask me — I can look up exactly which certificates are expiring soon for the companies you have access to.",
  },
  {
    id: "tut-leave-overtime",
    module: "hr",
    type: "tutorial",
    title: "Submitting leave or overtime",
    keywords: ["leave request", "overtime", "apply leave", "submit overtime"],
    content:
      "📌 How to Submit a Leave or Overtime Request\n1. Go to HR, open the employee's profile.\n2. Click + New Leave Request (or + New Overtime).\n3. Fill in the dates/hours and reason.\n4. Click Confirm & Save — this creates an approval request.\n5. A manager approves or rejects it from the Leave/Overtime list; the status updates automatically once decided.",
  },
  {
    id: "tut-payroll",
    module: "hr",
    type: "tutorial",
    title: "Running payroll",
    keywords: ["payroll", "run payroll", "pay slip", "salary"],
    content:
      "📌 How to Create a Payroll Record\n1. Go to HR → Payroll.\n2. Click + New Payroll Record, choose the employee and pay period.\n3. Enter gross pay and deductions — net pay is calculated for you.\n4. Click Confirm & Save, then Mark Paid once payment is actually made.",
  },
  {
    id: "tut-marketing-campaign",
    module: "marketing",
    type: "tutorial",
    title: "Creating a marketing campaign",
    keywords: ["marketing campaign", "new campaign", "create campaign"],
    content:
      "📌 How to Create a Marketing Campaign\n1. Go to Marketing.\n2. Click + New Campaign.\n3. Enter the name, channel, budget, and start/end dates.\n4. Click Confirm & Save.\n5. Log leads, content, promotions, expenses, and performance data from the campaign's own page afterwards.",
  },
  {
    id: "tut-marketing-leads-import",
    module: "marketing",
    type: "tutorial",
    title: "Importing leads from Excel",
    keywords: ["import leads", "leads excel", "bulk leads"],
    content:
      "📌 How to Bulk-Import Leads\n1. Go to Marketing → Leads.\n2. Click Import.\n3. Upload your Excel/CSV file, map the columns, and review the preview.\n4. Click Confirm & Save.",
  },
  {
    id: "tut-kitchen-stock",
    module: "kitchen",
    type: "tutorial",
    title: "Adjusting ingredient stock",
    keywords: ["stock movement", "adjust stock", "ingredient stock", "stock count"],
    content:
      "📌 How to Log a Stock Movement\n1. Go to Kitchen → Stock.\n2. Click + New Movement (or Upload a stock count photo/sheet).\n3. Choose the ingredient, quantity, and whether it's stock in or stock out.\n4. Click Confirm & Save — the ingredient's on-hand quantity updates immediately.",
  },
  {
    id: "tut-driver-vehicle-maintenance",
    module: "driver-logistics",
    type: "tutorial",
    title: "Logging vehicle maintenance",
    keywords: ["vehicle maintenance", "service record", "workshop"],
    content:
      "📌 How to Log Vehicle Maintenance\n1. Go to Operation Management → Vehicles, open the vehicle.\n2. Click + New Maintenance Record (or Upload the workshop invoice).\n3. Enter or confirm the service date, cost, and next service date.\n4. Click Confirm & Save.",
  },
  {
    id: "tut-finance-expense",
    module: "finance-admin",
    type: "tutorial",
    title: "Logging a company expense",
    keywords: ["company expense", "log expense", "add expense", "utilities expense"],
    content:
      "📌 How to Log a Company Expense\n1. Go to Admin & Finance → Company Expenses.\n2. Click + Add Expense (or Upload Document — receipt/invoice photo or PDF).\n3. Choose the category and department, confirm the amount and date.\n4. Click Confirm & Save.",
  },
  {
    id: "tut-finance-customer-payment",
    module: "finance-admin",
    type: "tutorial",
    title: "Recording a customer payment",
    keywords: ["customer payment", "record payment", "receive payment"],
    content:
      "📌 How to Record a Customer Payment\n1. Go to Admin & Finance → Customer Invoices, open the invoice.\n2. Click Record Payment.\n3. Enter the amount and date received.\n4. Click Confirm & Save — the invoice's outstanding balance and status update automatically.",
  },
  {
    id: "tut-petty-cash",
    module: "finance-admin",
    type: "tutorial",
    title: "Logging a petty cash transaction",
    keywords: ["petty cash"],
    content:
      "📌 How to Log a Petty Cash Transaction\n1. Go to Admin & Finance → Petty Cash.\n2. Click + New Transaction.\n3. Choose in/out, enter the amount and reason.\n4. Click Confirm & Save.",
  },
  {
    id: "tut-duplicate-check",
    module: "supplier-procurement",
    type: "tutorial",
    title: "Checking for duplicate invoices",
    keywords: ["duplicate invoice", "check duplicate"],
    content:
      "📌 How Duplicate Invoice Checking Works\nWhen you save a supplier invoice, the system automatically checks for another invoice from the same supplier with the same invoice number. If one is found, you'll see a warning before it saves — review both invoices carefully; if it's genuinely a new invoice that happens to reuse a number, you can still proceed, but double-check with the supplier first.",
  },

  // ---------------------------------------------------------------------
  // DEFINITIONS
  // ---------------------------------------------------------------------
  {
    id: "def-pending-approval",
    module: "general",
    type: "definition",
    title: "Pending Approval",
    keywords: ["pending approval", "what is pending approval"],
    content:
      "'Pending Approval' means a request (leave, overtime, supplier payment, procurement request) has been submitted but a manager/admin hasn't approved or rejected it yet. It appears on the Main Dashboard's 'Pending Approvals' count and in the relevant module's list until someone with the right role decides on it.",
  },
  {
    id: "def-supplier-outstanding",
    module: "supplier-procurement",
    type: "definition",
    title: "Supplier Outstanding",
    keywords: ["supplier outstanding", "what is supplier outstanding"],
    content:
      "'Supplier Outstanding' is the total amount owed to suppliers across all invoices that are not yet marked Paid (draft, pending review, approved, overdue, or disputed). It's shown on the Main Dashboard and in the Supplier Outstanding Report, filtered to whichever company is selected.",
  },
  {
    id: "def-customer-outstanding",
    module: "finance-admin",
    type: "definition",
    title: "Customer Outstanding",
    keywords: ["customer outstanding", "what is customer outstanding"],
    content:
      "'Customer Outstanding' is the total amount customers still owe you across all invoices not yet fully paid. It's shown on the Main Dashboard and in the Customer Outstanding Report.",
  },
  {
    id: "def-monthly-costing",
    module: "finance-admin",
    type: "definition",
    title: "Monthly Costing",
    keywords: ["monthly costing", "what is monthly costing"],
    content:
      "'Monthly Costing' is the total operating cost recorded for the current calendar month for the selected company (event costing, ingredient costs, and related expenses). It's shown as a KPI on the Main Dashboard and under Admin & Finance → Monthly Costing.",
  },
  {
    id: "def-payment-status",
    module: "general",
    type: "definition",
    title: "Payment Status",
    keywords: ["payment status", "what does invoice status mean", "invoice status"],
    content:
      "Invoice status moves through: Draft → Pending Review → Approved → Paid (or Overdue if the due date passes unpaid, or Disputed if there's a problem with it). Supplier payment requests move through: Pending Approval → Approved — Ready to Pay → Paid (or Rejected).",
  },
  {
    id: "def-due-date",
    module: "general",
    type: "definition",
    title: "Due Date / Overdue",
    keywords: ["due date", "overdue", "what does overdue mean"],
    content:
      "The 'Due Date' is when an invoice payment is expected. An invoice becomes 'Overdue' once today's date passes its due date and it still isn't marked Paid — the system calculates this live, it isn't a separate field you set manually.",
  },

  // ---------------------------------------------------------------------
  // TROUBLESHOOTING
  // ---------------------------------------------------------------------
  {
    id: "ts-upload-failed",
    module: "general",
    type: "troubleshooting",
    title: "Upload failed",
    keywords: ["upload failed", "file won't upload", "upload error"],
    content:
      "Likely reasons: the file is too large, an unsupported file type, or a temporary network issue. Next steps: 1) Confirm the file is a PDF, JPG, PNG, or WEBP under the size limit. 2) Try again — a flaky connection is the most common cause. 3) If it keeps failing, try a smaller/clearer version of the file (e.g. a cropped photo instead of a huge one), or fall back to Manual Entry for that record.",
  },
  {
    id: "ts-excel-import-failed",
    module: "general",
    type: "troubleshooting",
    title: "Excel import failed",
    keywords: ["excel import failed", "csv import failed", "import error"],
    content:
      "Likely reasons: the file's column headers don't match what the importer expects, or a required column is missing entirely. Next steps: 1) Check the column-mapping step — make sure each of your spreadsheet's columns is mapped to the right system field. 2) Make sure required fields (usually name/date/amount) aren't blank in your file. 3) Fix the flagged rows in the review step before confirming, or fix them in your spreadsheet and re-upload.",
  },
  {
    id: "ts-missing-required-field",
    module: "general",
    type: "troubleshooting",
    title: "Missing required field",
    keywords: ["missing required field", "required field", "can't save", "cannot save"],
    content:
      "This means the form won't save until a specific field is filled in — required fields are usually marked and the form will highlight which one is empty or invalid. Next steps: scroll up to find the highlighted field, fill it in, and try saving again.",
  },
  {
    id: "ts-duplicate-invoice",
    module: "supplier-procurement",
    type: "troubleshooting",
    title: "Duplicate invoice warning",
    keywords: ["duplicate invoice warning", "invoice already exists"],
    content:
      "This means another invoice already exists from the same supplier with the same invoice number. Next steps: 1) Check whether this invoice was already entered by someone else. 2) If it's genuinely a different invoice, confirm the invoice number with the supplier — it may be a typo. 3) If it really is new, you can still proceed, but it's worth double-checking first to avoid paying twice.",
  },
  {
    id: "ts-permission-denied",
    module: "general",
    type: "troubleshooting",
    title: "Permission denied",
    keywords: ["permission denied", "access denied", "not authorized"],
    content:
      "This means your account's role doesn't allow that action (e.g. only a Company Admin or Super Admin can approve payments). Next steps: 1) Check with your Super Admin/Company Admin whether your role should have this permission. 2) If you believe this is a mistake, ask an admin to review your role and company access under Settings → Users & Roles.",
  },
  {
    id: "ts-cannot-access-company",
    module: "general",
    type: "troubleshooting",
    title: "Cannot access a company",
    keywords: ["cannot access company", "company not showing", "missing company"],
    content:
      "You only see companies you've been explicitly granted access to. Next steps: 1) Check the company selector — if a company isn't listed there, you don't currently have access to it. 2) Ask a Super Admin to grant you access to that company under Settings → Users & Roles.",
  },
  {
    id: "ts-extraction-failed",
    module: "general",
    type: "troubleshooting",
    title: "Document extraction failed",
    keywords: ["extraction failed", "ai extraction not working", "ocr failed"],
    content:
      "Likely reasons: the photo/PDF was unclear, the AI extraction feature isn't configured for this environment, or the document type wasn't recognized. Next steps: this never blocks you — the file is still saved and attached, you just fill in the review form manually instead of it being pre-filled. Try a clearer photo next time if legibility was the issue.",
  },
  {
    id: "ts-payment-cannot-submit",
    module: "supplier-procurement",
    type: "troubleshooting",
    title: "Payment cannot be submitted",
    keywords: ["payment cannot be submitted", "can't request payment", "payment button disabled"],
    content:
      "Likely reasons: the invoice is already marked Paid, or it already has a payment request pending approval. Next steps: check the invoice's current status first — if it's already Paid or already has a pending payment request, that's why the button is unavailable.",
  },
  {
    id: "ts-report-no-data",
    module: "reports",
    type: "troubleshooting",
    title: "Report has no data",
    keywords: ["report has no data", "empty report", "report shows nothing"],
    content:
      "Likely reasons: the selected company genuinely has no records for that month/filter combination, or the filters (Company, Month, Year, Department, Category, Status) are narrower than you meant. Next steps: 1) Try 'All Companies' and clear the other filters to confirm data exists somewhere. 2) Double check the month/year — reports default to the current month. This system never fabricates figures, so an empty report reflects the real database, not a bug, unless you'd genuinely expect records there.",
  },
];
