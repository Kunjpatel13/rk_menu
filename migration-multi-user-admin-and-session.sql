-- Migration: Allow All Supabase Auth Users to Access and Manage Restaurant Admin
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor)

-- 1. Ensure public.admin_users table has proper RLS policies for all authenticated users
alter table if exists public.admin_users enable row level security;

drop policy if exists "Admin can read own admin record" on public.admin_users;
create policy "Admin can read own admin record" on public.admin_users
for select to authenticated using (true);

drop policy if exists "Authenticated users can insert admin record" on public.admin_users;
create policy "Authenticated users can insert admin record" on public.admin_users
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can update admin record" on public.admin_users;
create policy "Authenticated users can update admin record" on public.admin_users
for update to authenticated using (user_id = (select auth.uid()));

-- 2. Update is_restaurant_admin() function so ANY authenticated user created in Supabase Auth is recognized as admin
create or replace function public.is_restaurant_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.role()) = 'authenticated';
$$;

revoke all on function public.is_restaurant_admin() from public;
grant execute on function public.is_restaurant_admin() to anon, authenticated;

-- 3. Auto-populate any existing Supabase Auth users into public.admin_users
insert into public.admin_users (user_id)
select id from auth.users
on conflict (user_id) do nothing;
