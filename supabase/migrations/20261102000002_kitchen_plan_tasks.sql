-- Kitchen cooking plan: one row for each dish of an event day, with when it is cooked, by whom, and how far it is.
create table public.kitchen_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  catering_event_id uuid not null references public.catering_events(id) on delete cascade,
  catering_event_day_id uuid references public.catering_event_days(id) on delete cascade,
  sort_order integer not null default 0,
  dish_name text not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  pax integer not null check (pax >= 1),
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  duration_is_estimate boolean not null default true,
  start_at timestamptz not null,
  end_at timestamptz not null,
  assigned_to text,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index kitchen_plan_tasks_event_idx on public.kitchen_plan_tasks (catering_event_id, catering_event_day_id);
create index kitchen_plan_tasks_company_idx on public.kitchen_plan_tasks (company_id);
alter table public.kitchen_plan_tasks enable row level security;
create policy kitchen_plan_tasks_read on public.kitchen_plan_tasks for select to authenticated using (public.user_has_company_access(company_id));
create policy kitchen_plan_tasks_insert on public.kitchen_plan_tasks for insert to authenticated with check (public.user_has_company_access(company_id));
create policy kitchen_plan_tasks_update on public.kitchen_plan_tasks for update to authenticated using (public.user_has_company_access(company_id)) with check (public.user_has_company_access(company_id));
create policy kitchen_plan_tasks_delete on public.kitchen_plan_tasks for delete to authenticated using (public.user_has_company_access(company_id));
