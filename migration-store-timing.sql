-- Migration: Add store timing and ordering status controls to restaurant_settings
alter table public.restaurant_settings
  add column if not exists open_time text default '11:00',
  add column if not exists close_time text default '23:00',
  add column if not exists store_status text default 'auto',
  add column if not exists closed_message text default 'Restaurant is closed right now. We accept orders from 11:00 AM to 11:00 PM.';

update public.restaurant_settings
set 
  open_time = coalesce(open_time, '11:00'),
  close_time = coalesce(close_time, '23:00'),
  store_status = coalesce(store_status, 'auto'),
  closed_message = coalesce(closed_message, 'Restaurant is closed right now. We accept orders from 11:00 AM to 11:00 PM.')
where id = 1;
