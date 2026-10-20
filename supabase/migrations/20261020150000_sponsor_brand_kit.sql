create table if not exists public.sponsor_brand_kit_files (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sponsor_accounts (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  label text not null check (length(trim(label)) between 1 and 100),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sponsor_brand_kit_files_account_created_idx
  on public.sponsor_brand_kit_files (account_id, created_at desc);

alter table public.sponsor_brand_kit_files enable row level security;
revoke all on public.sponsor_brand_kit_files from anon, authenticated;
grant all on public.sponsor_brand_kit_files to service_role;
