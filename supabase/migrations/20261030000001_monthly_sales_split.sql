-- Signature Solution records its monthly sales in two parts: catering events and daily sales.
-- Every other company keeps a single figure ('total'). The company's sales for the month is the sum of its rows.

alter table monthly_sales
  add column sales_type text not null default 'total' check (sales_type in ('total', 'catering', 'daily'));

alter table monthly_sales drop constraint monthly_sales_company_id_year_month_key;
alter table monthly_sales add constraint monthly_sales_company_period_type_key unique (company_id, year, month, sales_type);
