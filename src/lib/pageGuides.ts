/**
 * The step by step guide of every page (opened by the Tutorial button at the top of every page). The guide of a page is its own
 * explanation first, then the steps that apply to the kind of page. Written in English; the pages translate the text like all other text.
 * The longest matching start of the address wins; a page without its own guide gets the general one.
 */

type Feature = "company" | "search" | "new" | "edit" | "export";

const COMMON: Record<Feature, string> = {
  company: "Choose the company at the top of the left menu. All Companies shows every company together.",
  search: "Type in the search box and press Search to find a record.",
  new: "Press the button that starts with + at the top right (for example + New Supplier) to add a record, fill in the form and save it.",
  edit: "Press Edit on a record to change it, then Save or Cancel. Delete asks first, and you can press Undo straight after.",
  export: "Use Export Excel to download the list, or Print to print it.",
};

const DISPLAY = "Press A A A at the top to make all the text bigger, and change the language beside it. More choices are in Settings.";

type Guide = { prefix: string; title: string; steps: string[]; features?: Feature[] };

const TABS = {
  catering: "Use the tabs under the page title to move between: Events, Event Calendar, Quotation Requests, Quotations and Customers.",
  kitchen: "Use the tabs under the page title to move between: Production Schedule, Recipes, Package Menu, Stock, Purchase Requests and Daily Report.",
  procurement: "Use the tabs under the page title to move between: Suppliers, Items & Prices, Ingredient Matching, Purchase Orders, Invoices and Payments.",
  operation: "Use the tabs under the page title to move between: Deliveries, Driver Dashboard, Drivers Information, Vehicles, Maintenance and Attendance (Clock In / Out).",
  finance: "Use the tabs under the page title to move between: Monthly Costing, Event P&L, Customer Invoices, Payment Proofs, Outstanding Payment, Payment Dashboard, Payment Checklist, Supplier Payment, Rental Payment, Utilities Payment and Procurement Payments.",
  spending: "Use the tabs under the page title to move between: Petty Cash, My Claims, Company Expenses and Budgets. The How to claim button explains how to claim what you paid with your own money.",
  marketing: "Use the tabs under the page title to move between: Campaigns, Content Calendar, Leads, Customers, Promotions, Expenses and Reports.",
};

// the more exact addresses first; the matching also takes the longest start of the address
const GUIDES: Guide[] = [
  { prefix: "/", title: "Main Dashboard", steps: ["The Main Dashboard shows the figures of the company chosen on the left: revenue, expenses, costing, what is still to be paid, upcoming events and alerts.", "Press a card or an alert to open the page behind it."], features: ["company"] },
  { prefix: "/profile", title: "My Profile", steps: ["My Profile shows your own staff details, your documents, your leave and your overtime.", "To change a detail, ask Madam Penny or Nabilah: only they can change staff details."] },
  { prefix: "/priority-centre", title: "Priority Centre", steps: ["The Priority Centre (My Tasks) shows your own tasks, reminders and notifications. Nobody else sees your tasks.", "Press Add my task (or Assign Task) to make a task, choose its date and priority, and save it.", "Press the tick or the status of a task when you finish it."] },
  { prefix: "/bulletin", title: "Bulletin Board", steps: ["The Bulletin Board shows the news of the company and the work, for every staff member.", "Read the newest posts at the top."] },
  { prefix: "/catering/calendar", title: "Event Calendar", steps: ["The Event Calendar shows every event by month, week, day or as an upcoming list. Each date shows the customer, the pax and the meals.", "Press a date to open that day with the full details of every event.", "Use the arrows to go to the next or the last month, and Today to come back.", "Use Hide tentative or Show tentative to hide or show the events that are not confirmed yet."], features: ["company"] },
  { prefix: "/catering/quotation-requests", title: "Quotation Requests", steps: ["Quotation Requests are the requests sent by the sales agents through the quotation form.", "Open a request, check the event and the menu, then approve it so the quotation can be made."], features: ["company"] },
  { prefix: "/catering/quotations", title: "Quotations", steps: ["Quotations lists the quotations of the events with their status: draft, sent, accepted or rejected.", "Open a quotation to see it, print it or change its status."], features: ["company", "search"] },
  { prefix: "/catering/customers", title: "Customers", steps: ["Customers lists the customers of the company with their contact and address.", "Open a customer to see or change the details."], features: ["company", "search", "new"] },
  { prefix: "/catering/new", title: "New Event", steps: ["Fill in the customer, the event name, the date and the pax.", "Choose the meal type and the service type, and write the menu.", "Press save to add the event to the calendar."] },
  { prefix: "/catering", title: "Catering Events", steps: [TABS.catering, "Events lists every catering event with its date, pax and status. Open an event to see and change its details.", "Use + New Event to add an event."], features: ["company", "search", "edit"] },
  { prefix: "/kitchen/recipes", title: "Recipes", steps: ["Recipes lists the dishes with their ingredients.", "Open a recipe to see or change it."], features: ["company", "search", "new"] },
  { prefix: "/kitchen/packages", title: "Package Menu", steps: ["Package Menu lists the menu packages that can be sold, with the items of each package.", "Open a package to see or change its items."], features: ["company", "new"] },
  { prefix: "/kitchen/stock", title: "Stock", steps: ["Stock shows the ingredients, how much is left and when to buy more.", "Open an ingredient to see its movements and change it."], features: ["company", "search", "new"] },
  { prefix: "/kitchen/purchase-requests", title: "Purchase Requests", steps: ["Purchase Requests are the things the kitchen asks the office to buy.", "Press + New to make a request: choose the item and the quantity, and save it."], features: ["company"] },
  { prefix: "/kitchen/reports", title: "Daily Report", steps: ["Daily Report shows the report of the kitchen for a day.", "Choose the date to see another day."], features: ["company"] },
  { prefix: "/kitchen", title: "Kitchen", steps: [TABS.kitchen, "Production Schedule shows what the kitchen must prepare for the coming events."], features: ["company"] },
  { prefix: "/supplier-procurement/items", title: "Items & Prices", steps: ["Items & Prices lists what is bought from the suppliers, with the price.", "Open an item to see or change its price."], features: ["company", "search", "new"] },
  { prefix: "/supplier-procurement/ingredient-matching", title: "Ingredient Matching", steps: ["Ingredient Matching joins the items of the suppliers to the ingredients of the kitchen.", "Choose the matching ingredient for each item and save."], features: ["company"] },
  { prefix: "/supplier-procurement/orders", title: "Purchase Orders", steps: ["Purchase Orders lists the orders sent to the suppliers.", "Press + New to make an order: choose the supplier, add the items and save it."], features: ["company", "edit"] },
  { prefix: "/supplier-procurement/invoices", title: "Supplier Invoices", steps: ["Invoices lists the invoices of the suppliers with the due date and the status.", "Press + New to add an invoice exactly as it is printed, or upload the invoice to be read."], features: ["company", "search", "edit"] },
  { prefix: "/supplier-procurement/payments", title: "Procurement Payments", steps: ["Payments shows what is paid and what is still to be paid to the suppliers.", "Open an invoice to record its payment with the date and the reference."], features: ["company"] },
  { prefix: "/supplier-procurement", title: "Suppliers", steps: [TABS.procurement, "Suppliers lists the suppliers with their contact and payment terms.", "Use Import Excel/CSV to add many suppliers at once."], features: ["company", "search", "new", "edit"] },
  { prefix: "/driver-logistics/vehicles", title: "Vehicles", steps: ["Vehicles lists the vehicles of the company.", "Open a vehicle to see its details and its maintenance."], features: ["company", "new"] },
  { prefix: "/driver-logistics/maintenance", title: "Maintenance", steps: ["Maintenance lists the service and repair records of the vehicles.", "Press + New to add a record and write the date of the next service."], features: ["company"] },
  { prefix: "/driver-logistics/drivers", title: "Drivers Information", steps: ["Drivers Information lists the drivers. A driver who works for several companies shows All companies or the companies he works for.", "Open a driver to see or change the details."], features: ["new"] },
  { prefix: "/driver-logistics/attendance", title: "Attendance (Clock In / Out)", steps: ["Attendance shows when the drivers and the event staff clocked in and out.", "Choose the date to see another day."], features: ["company"] },
  { prefix: "/driver-logistics/new", title: "New Delivery", steps: ["Choose the company and the catering event of the customer who ordered.", "Choose the time, the location and the vehicle, write the items, and press Create Delivery."] },
  { prefix: "/driver-logistics", title: "Operation Management", steps: [TABS.operation, "Deliveries lists the deliveries with their status. Open one to change its status or add the proof of delivery."], features: ["company", "new"] },
  { prefix: "/admin", title: "Admin & Finance", steps: [TABS.finance, "Monthly Costing shows the cost of the month by module and category. Press a module name to open the records behind it."], features: ["company"] },
  { prefix: "/finance/payments", title: "Payment Dashboard", steps: ["The Payment Dashboard shows the payments that are due, overdue and paid.", "Open a payment to record that it is paid."], features: ["company"] },
  { prefix: "/finance/payment-proofs", title: "Payment Proofs", steps: ["Payment Proofs lists the payments sent by the sales agents through the customer payment form.", "Check the receipt, then approve it to record the payment, or reject it."], features: ["company"] },
  { prefix: "/finance/invoices", title: "Customer Invoices", steps: ["Customer Invoices lists the invoices of the customers with their status.", "Press + New to make an invoice. Open an invoice to record a payment."], features: ["company", "search", "edit"] },
  { prefix: "/finance/outstanding", title: "Outstanding Payment", steps: ["Outstanding Payment shows what the customers still have to pay, with the days overdue.", "Open an invoice to see its payments."], features: ["company", "export"] },
  { prefix: "/finance/event-pnl", title: "Event P&L", steps: ["Event P&L shows the revenue and the cost of each event.", "Open an event to see its costs, and use Export to download it."], features: ["company", "search"] },
  { prefix: "/finance", title: "Admin & Finance", steps: [TABS.finance, "Open a payment to record it, with the date and the reference."], features: ["company"] },
  { prefix: "/spending/petty-cash", title: "Petty Cash", steps: [TABS.spending, "Choose the name and the position at the top to see one person's petty cash. Only Madam Penny and Nabilah can see everyone's.", "In New entry, choose Received, Spent or Claimant, fill in the details and save. The How to use this form box explains each type.", "Press Edit on a record to change it. Delete asks first, and you can press Undo straight after."], features: ["export"] },
  { prefix: "/spending/my-claims", title: "My Claims", steps: [TABS.spending, "Fill in the date, the amount, who you claim from, the category and what you bought, attach the receipt and press Send claim.", "Your claim shows below as Pending Payment, then Paid with the date and the Reference ID. You can Edit or Delete it while it is not paid."] },
  { prefix: "/spending/expenses", title: "Company Expenses", steps: [TABS.spending, "Company Expenses lists what the company spent, with the category, the department and the amount.", "Press + New Expense to add one."], features: ["company", "search", "edit"] },
  { prefix: "/spending/budgets", title: "Budgets", steps: [TABS.spending, "Budgets shows the budget of each category and how much is already spent.", "Press + New Budget to set one."], features: ["company", "edit"] },
  { prefix: "/spending", title: "Company Spending", steps: [TABS.spending], features: ["company"] },
  { prefix: "/hr/overtime", title: "Overtime (OT)", steps: ["Overtime lists the OT forms of the staff with their status.", "Press OT Form to submit your own overtime: the hours are worked out from the start and end time."], features: ["company"] },
  { prefix: "/hr/leave", title: "Leave Requests", steps: ["Leave Requests lists the leave of the staff with its status.", "Madam Penny, Nabilah and the company admins approve or reject a leave here."], features: ["company"] },
  { prefix: "/hr/documents", title: "Licences & Documents", steps: ["Licences & Documents lists the licences and documents of the company with their expiry date.", "Upload a document and write its expiry date so you are reminded before it expires."], features: ["company"] },
  { prefix: "/hr", title: "Employee Database", steps: ["The Employee Database lists the staff. A person who works for several companies is listed once with all the companies.", "Press a name to see every detail, the documents, the warning letters, the leave and the edit history of that person.", "Use the buttons at the top for the Birthday Calendar, Payroll Centre, Leave Requests, Overtime, Licences & Documents and to import staff."], features: ["company", "search"] },
  { prefix: "/payroll-centre", title: "Payroll Centre", steps: ["The Payroll Centre shows the payroll records of the staff for the month.", "Choose the month, then open a record to see it or mark it as paid."], features: ["company"] },
  { prefix: "/marketing", title: "Marketing", steps: [TABS.marketing, "Open a record to see or change it."], features: ["company", "new", "edit"] },
  { prefix: "/reports", title: "Reports", steps: ["Choose a report from the list.", "Choose the year and the month, or two dates, and the department or category, then press Apply Filters.", "Use Export Excel to download the report, or Print to print it. In Monthly Costing, press a module name to open its records."], features: ["company"] },
  { prefix: "/ai-assistant", title: "AI Assistant", steps: ["Type your question in the box and send it. The assistant answers short and step by step.", "You can attach a photo or a file for it to read."] },
  { prefix: "/settings", title: "Settings", steps: ["Display: choose the font and the font size (10 to 25) for every page. It is kept on this computer or phone.", "Only a Super Admin can add, change or remove team members and their access."] },
];

const GENERAL: Guide = { prefix: "", title: "This page", steps: ["Use the left menu to open a section, and the tabs under the page title to move inside it."], features: ["company", "search", "new", "edit"] };

export const GUIDE_INTRO = "Tutorial (step by step)";

/** The guide of the page at this address: its own explanation, then the steps that fit the kind of page, then the display tip. */
export function guideFor(pathname: string): { title: string; steps: string[] } {
  const guide =
    GUIDES.filter((g) => (g.prefix === "/" ? pathname === "/" : pathname === g.prefix || pathname.startsWith(`${g.prefix}/`))).sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? GENERAL;
  const features = guide.features ?? [];
  const order: Feature[] = ["company", "search", "new", "edit", "export"];
  const steps = [...guide.steps, ...order.filter((f) => features.includes(f)).map((f) => COMMON[f]), DISPLAY];
  return { title: guide.title, steps: Array.from(new Set(steps)) };
}
