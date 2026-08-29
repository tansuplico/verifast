-- 0001_init_schema.sql

create type folder_category as enum ('academic', 'financial', 'identification', 'forms');
create type reminder_type as enum ('submission', 'renewal', 'expiration');
create type reminder_status as enum ('pending', 'completed', 'dismissed');
create type document_request_status as enum ('requested', 'processing', 'ready', 'released');
create type academic_info_category as enum ('curriculum', 'announcement', 'activity');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, student_id text, program text, avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category folder_category not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, category)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  name text not null,
  file_path text not null,
  mime_type text, file_size bigint, thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_id_idx on public.documents(user_id);
create index documents_folder_id_idx on public.documents(folder_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  title text not null, description text,
  type reminder_type not null,
  due_date date not null,
  status reminder_status not null default 'pending',
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_user_id_due_date_idx on public.reminders(user_id, due_date);

create table public.document_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null, office text,
  status document_request_status not null default 'requested',
  requested_date date not null default current_date,
  expected_release_date date, released_date date, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_requests_user_id_idx on public.document_requests(user_id);

create table public.academic_info (
  id uuid primary key default gen_random_uuid(),
  category academic_info_category not null,
  title text not null, content text, source text,
  is_pinned boolean not null default false,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index academic_info_category_idx on public.academic_info(category);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text, stripe_subscription_id text,
  status subscription_status not null default 'trialing',
  trial_ends_at timestamptz, current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.reminders enable row level security;
alter table public.document_requests enable row level security;
alter table public.academic_info enable row level security;
alter table public.subscriptions enable row level security;

create policy "Users manage own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users manage own folders" on public.folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own documents" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own reminders" on public.reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own document_requests" on public.document_requests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Academic info readable by authenticated users" on public.academic_info for select using (auth.role() = 'authenticated');
create policy "Users view own subscription" on public.subscriptions for select using (auth.uid() = user_id);
-- Subscriptions writes happen ONLY via Stripe webhook using the service role key (bypasses RLS).

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  insert into public.folders (user_id, category, name) values
    (new.id, 'academic', 'Academic'), (new.id, 'financial', 'Financial'),
    (new.id, 'identification', 'Identification'), (new.id, 'forms', 'Forms');
  insert into public.subscriptions (user_id, status, trial_ends_at)
    values (new.id, 'trialing', now() + interval '45 days');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();