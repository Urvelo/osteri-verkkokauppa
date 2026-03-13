-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Adds visibility toggle columns to the products table

ALTER TABLE products ADD COLUMN IF NOT EXISTS show_discount BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_original_price BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_sales BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_rating BOOLEAN NOT NULL DEFAULT true;
