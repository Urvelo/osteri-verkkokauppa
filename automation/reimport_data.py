"""
Re-import all product and review data from static files to Supabase.
Also fixes missing columns in product_images, product_skus, reviews, review_images.
"""
import json, re, sys, os, time
import requests

SB_URL = 'https://libmjqruagyogsgnumjy.supabase.co'
SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYm1qcXJ1YWd5b2dzZ251bWp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIzNDQ4MSwiZXhwIjoyMDg4ODEwNDgxfQ.QGYcnYfo-QfBj42JytrpkV3qAZIyeAYfE4ev_Y4vvfA'

HEADERS = {
    'apikey': SB_KEY,
    'Authorization': f'Bearer {SB_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ------------- SQL: Add missing columns via RPC (or raw) --------
ADD_COLUMNS_SQL = """
-- See scripts/fix_tables_schema.sql for the SQL to run in Supabase Dashboard
"""


def parse_js_file(filepath, varname):
    """Parse a JS file that defines a const/var variable as JSON-like data."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    # Remove the const/var/let declaration to get the JSON
    # Find the assignment: const PRODUCTS = [...] or const REVIEWS = {...]
    pattern = rf'(?:const|var|let)\s+{varname}\s*=\s*'
    match = re.search(pattern, content)
    if not match:
        raise ValueError(f'Could not find {varname} in {filepath}')
    json_start = match.end()
    # The rest should be valid JSON (possibly with trailing semicolons)
    json_str = content[json_start:].rstrip().rstrip(';').strip()
    return json.loads(json_str)


def sb_post(table, data):
    """Insert data into a Supabase table."""
    r = requests.post(
        f'{SB_URL}/rest/v1/{table}',
        headers=HEADERS,
        json=data
    )
    if r.status_code not in (200, 201):
        print(f'  ERROR inserting into {table}: {r.status_code} {r.text[:300]}')
        return None
    return r.json()


def sb_rpc(fn_name, params=None):
    """Call a Supabase RPC function."""
    r = requests.post(
        f'{SB_URL}/rest/v1/rpc/{fn_name}',
        headers=HEADERS,
        json=params or {}
    )
    return r


def main():
    # ---- Step 1: Run SQL to add missing columns ----
    print("Step 1: Adding missing columns to tables...")
    print("  NOTE: You need to run the following SQL in Supabase Dashboard SQL Editor:")
    print("  (The script will attempt RPC, but if it fails, copy the SQL)")
    
    # Try running SQL via Supabase Management API
    # Actually, we can't run raw SQL via REST API. We'll need to handle this differently.
    # Let's check if columns already exist by trying to insert a test row
    
    # Check if product_images has the needed columns
    test = requests.get(
        f'{SB_URL}/rest/v1/product_images?select=product_id,image_url&limit=0',
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'}
    )
    if test.status_code != 200:
        print("\n  *** COLUMNS MISSING! ***")
        print("  Please run the following SQL in Supabase Dashboard SQL Editor,")
        print("  then run this script again.\n")
        print(ADD_COLUMNS_SQL)
        return False
    
    print("  Columns OK!")
    
    # ---- Step 2: Parse static files ----
    print("\nStep 2: Parsing static data files...")
    products_path = os.path.join(ROOT, 'products.js')
    reviews_path = os.path.join(ROOT, 'reviews.js')
    
    products = parse_js_file(products_path, 'PRODUCTS')
    reviews = parse_js_file(reviews_path, 'REVIEWS')
    print(f"  Found {len(products)} products")
    review_count = sum(len(v) for v in reviews.values())
    print(f"  Found {review_count} reviews across {len(reviews)} products")
    
    # ---- Step 3: Clear existing data (in order due to foreign keys) ----
    print("\nStep 3: Clearing existing data...")
    for table in ['review_images', 'reviews', 'product_skus', 'product_images', 'products']:
        r = requests.delete(
            f'{SB_URL}/rest/v1/{table}?id=not.is.null',
            headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'}
        )
        print(f"  Cleared {table}: {r.status_code}")
    
    # ---- Step 4: Import products ----
    print("\nStep 4: Importing products...")
    for p in products:
        row = {
            'id': int(p['id']),
            'title': p.get('title', ''),
            'title_fi': p.get('title_fi', ''),
            'sale_price': float(p.get('salePrice', 0)),
            'original_price': float(p.get('originalPrice', 0)),
            'currency': p.get('currency', 'EUR'),
            'discount': p.get('discount', ''),
            'image': p.get('image', ''),
            'url': p.get('url', ''),
            'orders': int(p.get('orders', 0)),
            'score': float(p.get('score', 0)),
            'evaluate_rate': p.get('evaluateRate', ''),
            'category_id': p.get('categoryId', ''),
            'description': p.get('description', ''),
            'evaluation_count': str(p.get('evaluationCount', '0')),
            'sales_count': str(p.get('salesCount', '0')),
            'status': 'active',
            'show_discount': bool(p.get('show_discount', False)),
            'show_original_price': bool(p.get('show_original_price', False)),
            'show_sales': bool(p.get('show_sales', False)),
            'show_rating': p.get('show_rating', True)
        }
        result = sb_post('products', row)
        if result:
            print(f"  + Product {p['id']}: {p.get('title', '')[:40]}...")
        else:
            print(f"  ! FAILED: {p['id']}")
            continue
        
        # Product images (gallery)
        gallery_imgs = p.get('images', [])
        if gallery_imgs:
            img_rows = []
            for idx, img_url in enumerate(gallery_imgs):
                img_rows.append({
                    'product_id': int(p['id']),
                    'image_url': img_url,
                    'is_description_image': False,
                    'sort_order': idx
                })
            sb_post('product_images', img_rows)
        
        # Description images
        desc_imgs = p.get('descriptionImages', [])
        if desc_imgs:
            desc_rows = []
            for idx, img_url in enumerate(desc_imgs):
                desc_rows.append({
                    'product_id': int(p['id']),
                    'image_url': img_url,
                    'is_description_image': True,
                    'sort_order': idx
                })
            sb_post('product_images', desc_rows)
        
        # SKUs
        skus = p.get('skus', [])
        if skus:
            sku_rows = []
            for s in skus:
                sku_rows.append({
                    'product_id': int(p['id']),
                    'name': s.get('name', ''),
                    'price': float(s.get('price', 0)),
                    'original_price': float(s.get('originalPrice', 0)),
                    'stock': int(s.get('stock', 0)),
                    'image': s.get('image', '')
                })
            sb_post('product_skus', sku_rows)
    
    # ---- Step 5: Import reviews ----
    print("\nStep 5: Importing reviews...")
    total_reviews = 0
    total_review_imgs = 0
    for product_id, rev_list in reviews.items():
        for rv in rev_list:
            rev_row = {
                'product_id': int(product_id),
                'reviewer_name': rv.get('name', ''),
                'country': rv.get('country', ''),
                'rating': int(rv.get('rating', 5)),
                'comment': rv.get('comment', ''),
                'review_date': rv.get('date', '')
            }
            result = sb_post('reviews', rev_row)
            if result and isinstance(result, list) and len(result) > 0:
                total_reviews += 1
                # Review images
                review_id = result[0]['id']
                imgs = rv.get('images', [])
                if imgs:
                    img_rows = []
                    for idx, img_url in enumerate(imgs):
                        img_rows.append({
                            'review_id': review_id,
                            'image_url': img_url,
                            'sort_order': idx
                        })
                    sb_post('review_images', img_rows)
                    total_review_imgs += len(imgs)
    
    print(f"  Imported {total_reviews} reviews with {total_review_imgs} images")
    
    # ---- Done ----
    print("\n=== IMPORT COMPLETE ===")
    print(f"Products: {len(products)}")
    print(f"Reviews: {total_reviews}")
    print(f"Review images: {total_review_imgs}")
    return True


if __name__ == '__main__':
    success = main()
    if not success:
        print("\nPlease fix the issues above and re-run this script.")
        sys.exit(1)
