-- =============================================
-- FIX RLS + ADD ADMIN + SCHEMA UPDATES
-- Run in Supabase Dashboard → SQL Editor
-- =============================================

-- ═══════════════════════════════════════════
-- A) ADD NEW ADMIN USER
-- ═══════════════════════════════════════════
INSERT INTO admins (email, role)
VALUES ('joelhumalajok@gmail.com', 'admin')
ON CONFLICT (email) DO NOTHING;

-- ═══════════════════════════════════════════
-- B) ADD ae_price COLUMN (AliExpress source price)
-- ═══════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'ae_price'
  ) THEN
    ALTER TABLE products ADD COLUMN ae_price NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- Also add ae_price to product_skus for per-variant AE prices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_skus' AND column_name = 'ae_price'
  ) THEN
    ALTER TABLE product_skus ADD COLUMN ae_price NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- ═══════════════════════════════════════════
-- C) FIX RLS POLICIES
-- ═══════════════════════════════════════════

-- 1) Make sure RLS is enabled on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 2) Drop ALL existing policies (safe cleanup)
DROP POLICY IF EXISTS "Public read products" ON products;
DROP POLICY IF EXISTS "Allow public read products" ON products;
DROP POLICY IF EXISTS "Admin insert products" ON products;
DROP POLICY IF EXISTS "Admin update products" ON products;
DROP POLICY IF EXISTS "Admin delete products" ON products;

DROP POLICY IF EXISTS "Public read product_images" ON product_images;
DROP POLICY IF EXISTS "Admin insert product_images" ON product_images;
DROP POLICY IF EXISTS "Admin update product_images" ON product_images;
DROP POLICY IF EXISTS "Admin delete product_images" ON product_images;

DROP POLICY IF EXISTS "Public read product_skus" ON product_skus;
DROP POLICY IF EXISTS "Admin insert product_skus" ON product_skus;
DROP POLICY IF EXISTS "Admin update product_skus" ON product_skus;
DROP POLICY IF EXISTS "Admin delete product_skus" ON product_skus;

DROP POLICY IF EXISTS "Public read reviews" ON reviews;
DROP POLICY IF EXISTS "Admin insert reviews" ON reviews;
DROP POLICY IF EXISTS "Admin update reviews" ON reviews;
DROP POLICY IF EXISTS "Admin delete reviews" ON reviews;

DROP POLICY IF EXISTS "Public read review_images" ON review_images;
DROP POLICY IF EXISTS "Admin insert review_images" ON review_images;
DROP POLICY IF EXISTS "Admin update review_images" ON review_images;
DROP POLICY IF EXISTS "Admin delete review_images" ON review_images;

DROP POLICY IF EXISTS "Admins can read admins" ON admins;

-- 3) Ensure is_admin() function exists
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE email = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Admins table policy (non-recursive)
CREATE POLICY "Admins can read admins" ON admins
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND email = auth.email()
  );

-- 5) PUBLIC SELECT (anyone can read)
CREATE POLICY "Public read products" ON products
  FOR SELECT USING (true);

CREATE POLICY "Public read product_images" ON product_images
  FOR SELECT USING (true);

CREATE POLICY "Public read product_skus" ON product_skus
  FOR SELECT USING (true);

CREATE POLICY "Public read reviews" ON reviews
  FOR SELECT USING (true);

CREATE POLICY "Public read review_images" ON review_images
  FOR SELECT USING (true);

-- 6) ADMIN INSERT
CREATE POLICY "Admin insert products" ON products
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admin insert product_images" ON product_images
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admin insert product_skus" ON product_skus
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admin insert reviews" ON reviews
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admin insert review_images" ON review_images
  FOR INSERT WITH CHECK (is_admin());

-- 7) ADMIN UPDATE
CREATE POLICY "Admin update products" ON products
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admin update product_images" ON product_images
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admin update product_skus" ON product_skus
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admin update reviews" ON reviews
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admin update review_images" ON review_images
  FOR UPDATE USING (is_admin());

-- 8) ADMIN DELETE
CREATE POLICY "Admin delete products" ON products
  FOR DELETE USING (is_admin());

CREATE POLICY "Admin delete product_images" ON product_images
  FOR DELETE USING (is_admin());

CREATE POLICY "Admin delete product_skus" ON product_skus
  FOR DELETE USING (is_admin());

CREATE POLICY "Admin delete reviews" ON reviews
  FOR DELETE USING (is_admin());

CREATE POLICY "Admin delete review_images" ON review_images
  FOR DELETE USING (is_admin());
