-- =================================================================
-- MIGRATION: ADD IMAGE_URL TO CATEGORIES TABLE
-- Run this single statement in Supabase Dashboard > SQL Editor
-- This enables custom category images for landing page category cards
-- =================================================================

alter table public.categories add column if not exists image_url text;
