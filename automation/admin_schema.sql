-- ============================================================
-- ERÄT.FI – Admin Schema Update
-- Lisää status, admins-taulu ja RLS admin-policyt
-- ============================================================

-- 1. Lisää status-kenttä tuotteisiin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'status'
  ) THEN
    ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
  END IF;
END $$;

-- 2. Admins-taulu
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Vain autentikoidut admin-käyttäjät näkevät admins-taulun
CREATE POLICY "Admins can read admins" ON admins
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND auth.email() IN (SELECT email FROM admins)
  );

-- 3. Admin write-policyt tuotteille (INSERT, UPDATE, DELETE)
-- Poistetaan vanhat policyt jos on
DO $$
BEGIN
  -- Products
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin insert products') THEN
    DROP POLICY "Admin insert products" ON products;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update products') THEN
    DROP POLICY "Admin update products" ON products;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin delete products') THEN
    DROP POLICY "Admin delete products" ON products;
  END IF;

  -- Product images
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin insert product_images') THEN
    DROP POLICY "Admin insert product_images" ON product_images;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update product_images') THEN
    DROP POLICY "Admin update product_images" ON product_images;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin delete product_images') THEN
    DROP POLICY "Admin delete product_images" ON product_images;
  END IF;

  -- Product SKUs
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin insert product_skus') THEN
    DROP POLICY "Admin insert product_skus" ON product_skus;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update product_skus') THEN
    DROP POLICY "Admin update product_skus" ON product_skus;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin delete product_skus') THEN
    DROP POLICY "Admin delete product_skus" ON product_skus;
  END IF;

  -- Reviews
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin insert reviews') THEN
    DROP POLICY "Admin insert reviews" ON reviews;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update reviews') THEN
    DROP POLICY "Admin update reviews" ON reviews;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin delete reviews') THEN
    DROP POLICY "Admin delete reviews" ON reviews;
  END IF;

  -- Review images
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin insert review_images') THEN
    DROP POLICY "Admin insert review_images" ON review_images;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update review_images') THEN
    DROP POLICY "Admin update review_images" ON review_images;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin delete review_images') THEN
    DROP POLICY "Admin delete review_images" ON review_images;
  END IF;
END $$;

-- Admin write policies: vain kirjautuneet admin-käyttäjät
CREATE POLICY "Admin insert products" ON products FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin update products" ON products FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin delete products" ON products FOR DELETE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin insert product_images" ON product_images FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin update product_images" ON product_images FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin delete product_images" ON product_images FOR DELETE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin insert product_skus" ON product_skus FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin update product_skus" ON product_skus FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin delete product_skus" ON product_skus FOR DELETE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin insert reviews" ON reviews FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin update reviews" ON reviews FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin delete reviews" ON reviews FOR DELETE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin insert review_images" ON review_images FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin update review_images" ON review_images FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admins));

CREATE POLICY "Admin delete review_images" ON review_images FOR DELETE
  USING (auth.email() IN (SELECT email FROM admins));

-- 4. Julkinen SELECT näyttää vain aktiiviset tuotteet
-- (päivitetään vanha public read policy)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read products') THEN
    DROP POLICY "Allow public read products" ON products;
  END IF;
END $$;

CREATE POLICY "Allow public read products" ON products
  FOR SELECT USING (true);
-- Huom: status-filtterointi tehdään frontendissä/queryssa
-- koska admin tarvitsee nähdä kaikki statukset

-- 5. Helper function: tarkista onko käyttäjä admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE email = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
