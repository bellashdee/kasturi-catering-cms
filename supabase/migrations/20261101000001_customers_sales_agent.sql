-- The sales agent of each customer: the "Sales Agent" of the AutoCount debtor details (Kasturi Indah), so sales can be traced to the agent
-- through the customer. Filled from the Debtor Full Detail report of 1 Nov 2026 (ZILA, HANNAH, ISMAIZAL, ZAINAB, MARD, AZLAN; 20 debtors have none).
alter table public.customers add column if not exists sales_agent text;

-- the update of the 176 debtors that have an agent was run on the database with the debtor list of the report (account code -> agent name):
--   update public.customers c set sales_agent = v.agent from (values ('300-0001','Ms. Hannah'), ...) as v(code, agent)
--   where c.company_id = '<Kasturi Indah>' and c.account_code like '%' || v.code || ' (KI)%';
