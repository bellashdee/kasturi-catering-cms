-- Only some holders may see everyone's petty cash (Ms. Penny and Ms. Nabilah); every other holder sees only their own
alter table public.operation_petty_cash_access add column if not exists can_see_all boolean not null default false;
update public.operation_petty_cash_access set can_see_all = true
 where user_id in ('2e6cc396-a0f7-406b-82ad-bc1241c33ef0', '296343b8-f5a1-4226-9d0c-41c75c99bf2a');
