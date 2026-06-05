create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index ai_messages_user_idx on public.ai_messages(user_id, created_at);

grant select, insert, delete on public.ai_messages to authenticated;
grant all on public.ai_messages to service_role;

alter table public.ai_messages enable row level security;

create policy "ai_messages_select_own" on public.ai_messages
  for select to authenticated using (user_id = auth.uid());
create policy "ai_messages_insert_own" on public.ai_messages
  for insert to authenticated with check (user_id = auth.uid());
create policy "ai_messages_delete_own" on public.ai_messages
  for delete to authenticated using (user_id = auth.uid());