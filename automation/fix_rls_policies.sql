-- =============================================
-- FIX ALL RLS POLICIES
-- Run in Supabase Dashboard → SQL Editor
-- =============================================

-- 1) Make sure RLS is enabled on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_images ENABLE ROW LEVEL SECURITY;

-- 2) Drop ALL existing policies (safe cleanup)
DROP POLICY IF EXISTS "Public read products" ON products;
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

-- 3) PUBLIC SELECT (anyone can read, including anon)
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

-- 4) ADMIN INSERT
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

-- 5) ADMIN UPDATE
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

-- 6) ADMIN DELETE
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
