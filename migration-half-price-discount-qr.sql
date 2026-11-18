-- RUN THIS IN SUPABASE DASHBOARD > SQL EDITOR
-- This adds support for:
-- 1. Half & Full portion pricing in menu items
-- 2. Total order discount with custom note in settings
-- 3. UPI ID & Payment QR code in settings

alter table public.menu_items add column if not exists half_price numeric(10,2);
alter table public.restaurant_settings add column if not exists discount_percent numeric(5,2) default 0;
alter table public.restaurant_settings add column if not exists discount_note text default '';
alter table public.restaurant_settings add column if not exists upi_id text default '';
alter table public.restaurant_settings add column if not exists qr_image_url text default '';
