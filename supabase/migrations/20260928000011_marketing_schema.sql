alter table campaigns
  add column objective text,
  add column channel text not null default 'other' check (channel in ('social_media','advertising','print','event','email','other'));

alter table customers
  add column email text;

create table content_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram','tiktok','x','linkedin','website','other')),
  content_type text not null check (content_type in ('post','story','reel','video','blog','ad','other')),
  title text not null,
  scheduled_date date,
  status text not null default 'idea' check (status in ('idea','draft','scheduled','published','cancelled')),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  name text not null,
  phone text,
  email text,
  source text not null default 'other' check (source in ('referral','social_media','advertising','walk_in','website','other')),
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','lost')),
  notes text,
  converted_customer_id uuid references customers(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  title text not null,
  code text,
  discount_type text not null default 'percentage' check (discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled','active','expired','cancelled')),
  created_at timestamptz not null default now()
);

create table marketing_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  category text not null default 'other' check (category in ('advertising','print','event','influencer','content_production','other')),
  description text not null,
  amount numeric(12,2) not null,
  expense_date date not null,
  document_id uuid references documents(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table campaign_performance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  report_date date not null,
  impressions integer,
  clicks integer,
  leads_generated integer,
  conversions integer,
  spend numeric(12,2),
  document_id uuid references documents(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
