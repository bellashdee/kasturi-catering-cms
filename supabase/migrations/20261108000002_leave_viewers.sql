-- Who may look at the leave applications of other staff: Mr. Faidz, Ms. Penny, Mr. Ismaizal, Hannah, Mr. Redza, Mr. Atiq, Ms. Nabilah and Mr. Saiful
-- (Ms. Syaza too, as a leave editor). It is its own list, apart from the OT form list, which stays as it was (staff_leave_ot_viewers).
create table if not exists public.leave_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.leave_viewers enable row level security;
drop policy if exists leave_viewers_own on public.leave_viewers;
create policy leave_viewers_own on public.leave_viewers for select to authenticated using (user_id = auth.uid());

insert into public.leave_viewers (user_id, note)
select v.id::uuid, v.note
from (values
  ('2e4c967b-713c-4fad-b21c-9f2899d31e44', 'Mr. Faidz'),
  ('2e6cc396-a0f7-406b-82ad-bc1241c33ef0', 'Ms. Penny'),
  ('88d03d77-a795-4a9e-bae7-b64290c384cd', 'Mr. Ismaizal'),
  ('31d31a43-385c-415f-9b79-94e1b1a88151', 'Hannah'),
  ('264c2671-9e46-4ecc-8fab-494bc9703a13', 'Mr. Redza'),
  ('d08bc8b7-ddd8-4cad-8d90-8c33fe6dbb44', 'Mr. Atiq'),
  ('296343b8-f5a1-4226-9d0c-41c75c99bf2a', 'Ms. Nabilah'),
  ('9f51fcc9-7c1b-4ca4-8f09-dc290d6f8a2d', 'Mr. Saiful')
) as v(id, note)
where exists (select 1 from auth.users u where u.id = v.id::uuid)
on conflict (user_id) do nothing;

create or replace function public.user_can_view_staff_leave()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leave_viewers where user_id = auth.uid());
$$;
revoke execute on function public.user_can_view_staff_leave() from public, anon;
grant execute on function public.user_can_view_staff_leave() to authenticated;

drop policy if exists leave_requests_viewers on public.leave_requests;
create policy leave_requests_viewers on public.leave_requests for select to authenticated
  using (public.user_can_view_staff_leave() and company_id in (select public.user_company_ids()));
