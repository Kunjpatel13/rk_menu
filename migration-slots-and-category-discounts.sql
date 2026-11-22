-- Migration: Time Slots & Category-wise Discounts
alter table public.restaurant_settings
  add column if not exists time_slots text default '[{"start":"10:30","end":"15:00"},{"start":"17:00","end":"23:00"}]',
  add column if not exists day_slots text default '{}',
  add column if not exists category_discounts text default '{}';

alter table public.categories
  add column if not exists discount_percent numeric(5,2) default 0;

alter table public.menu_items
  add column if not exists is_discountable boolean default true;

update public.restaurant_settings
set time_slots = coalesce(time_slots, '[{"start":"10:30","end":"15:00"},{"start":"17:00","end":"23:00"}]'),
    day_slots = coalesce(day_slots, '{}'),
    category_discounts = coalesce(category_discounts, '{}')
where id = 1;
