-- Create user_instructions table
create table if not exists public.user_instructions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.user_instructions enable row level security;

create policy "Users can view own instructions"
  on public.user_instructions for select
  using (auth.uid() = user_id);

create policy "Users can insert own instructions"
  on public.user_instructions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own instructions"
  on public.user_instructions for update
  using (auth.uid() = user_id);

create policy "Users can delete own instructions"
  on public.user_instructions for delete
  using (auth.uid() = user_id);

-- Index
create index idx_user_instructions_user_id on public.user_instructions(user_id);
