-- Fix missing columns in product_images, product_skus, reviews, review_images
-- Run this in Supabase Dashboard → SQL Editor → New query
-- products.id is BIGINT, so all foreign keys must also be BIGINT

-- product_images columns
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS is_description_image BOOLEAN DEFAULT FALSE;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- product_skus columns
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2);
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';

-- reviews columns
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_name TEXT DEFAULT '';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating INT DEFAULT 5;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT '';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS review_date TEXT DEFAULT '';

-- review_images columns
ALTER TABLE review_images ADD COLUMN IF NOT EXISTS review_id BIGINT REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE review_images ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE review_images ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- RLS policies (public read for storefront)
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read product_images" ON product_images;
  CREATE POLICY "Public read product_images" ON product_images FOR SELECT USING (true);
  DROP POLICY IF EXISTS "Public read product_skus" ON product_skus;
  CREATE POLICY "Public read product_skus" ON product_skus FOR SELECT USING (true);
  DROP POLICY IF EXISTS "Public read reviews" ON reviews;
  CREATE POLICY "Public read reviews" ON reviews FOR SELECT USING (true);
  DROP POLICY IF EXISTS "Public read review_images" ON review_images;
  CREATE POLICY "Public read review_images" ON review_images FOR SELECT USING (true);
END $$;
