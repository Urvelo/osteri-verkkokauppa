-- ============================================================
-- FIX: Infinite recursion in RLS policies
-- Kaikki policyt vaihtavat käyttämään is_admin() SECURITY DEFINER -funktiota
-- joka ohittaa RLS:n eikä aiheuta rekursiota.
--
-- AJA TÄMÄ: Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/libmjqruagyogsgnumjy/sql/new
-- ============================================================

-- 1. Varmista is_admin() funktio on olemassa (SECURITY DEFINER ohittaa RLS)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE email = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Admins-taulu: poista KAIKKI SELECT-policyt ja luo uusi
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admins' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON admins', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Admins can read admins" ON admins
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 3. Products: poista vanhat admin-policyt ja luo uudet
DROP POLICY IF EXISTS "Admin insert products" ON products;
CREATE POLICY "Admin insert products" ON products FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin update products" ON products;
CREATE POLICY "Admin update products" ON products FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admin delete products" ON products;
CREATE POLICY "Admin delete products" ON products FOR DELETE
  USING (is_admin());

-- 4. Product images
DROP POLICY IF EXISTS "Admin insert product_images" ON product_images;
CREATE POLICY "Admin insert product_images" ON product_images FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin update product_images" ON product_images;
CREATE POLICY "Admin update product_images" ON product_images FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admin delete product_images" ON product_images;
CREATE POLICY "Admin delete product_images" ON product_images FOR DELETE
  USING (is_admin());

-- 5. Product SKUs
DROP POLICY IF EXISTS "Admin insert product_skus" ON product_skus;
CREATE POLICY "Admin insert product_skus" ON product_skus FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin update product_skus" ON product_skus;
CREATE POLICY "Admin update product_skus" ON product_skus FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admin delete product_skus" ON product_skus;
CREATE POLICY "Admin delete product_skus" ON product_skus FOR DELETE
  USING (is_admin());

-- 6. Reviews
DROP POLICY IF EXISTS "Admin insert reviews" ON reviews;
CREATE POLICY "Admin insert reviews" ON reviews FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin update reviews" ON reviews;
CREATE POLICY "Admin update reviews" ON reviews FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admin delete reviews" ON reviews;
CREATE POLICY "Admin delete reviews" ON reviews FOR DELETE
  USING (is_admin());

-- 7. Review images
DROP POLICY IF EXISTS "Admin insert review_images" ON review_images;
CREATE POLICY "Admin insert review_images" ON review_images FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin update review_images" ON review_images;
CREATE POLICY "Admin update review_images" ON review_images FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admin delete review_images" ON review_images;
CREATE POLICY "Admin delete review_images" ON review_images FOR DELETE
  USING (is_admin());
