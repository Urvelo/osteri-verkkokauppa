#!/usr/bin/env python3
"""
Rosterikuppia.fi – AliExpress DS API Product Updater
=====================================================
Updates products.js with fresh stock levels, prices, and review data
from the AliExpress Dropshipping API.

Usage:
    python scripts/update_products.py [--force]

The script caches API responses to avoid excessive API calls.
By default, stock/prices are refreshed every 6 hours and reviews every 24 hours.
Use --force to bypass the cache.

Requirements:
    pip install requests
"""

import json
import os
import sys
import time
import hashlib
import hmac
import requests
from datetime import datetime
from pathlib import Path

# ── AliExpress DS API Configuration ──
APP_KEY = "528712"
APP_SECRET = "eTqgsTEd8LpB6dN4SQ4WFlKXxNkiihMs"
API_URL = "https://api-sg.aliexpress.com/sync"

# Cache configuration (seconds)
STOCK_CACHE_TTL = 6 * 3600    # 6 hours for stock/price data
REVIEW_CACHE_TTL = 24 * 3600  # 24 hours for reviews

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PRODUCTS_JS = PROJECT_ROOT / "products.js"
CACHE_DIR = SCRIPT_DIR / ".cache"
TOKEN_FILE = SCRIPT_DIR / "token.json"


def load_access_token():
    """Load the saved access token."""
    if TOKEN_FILE.exists():
        with open(TOKEN_FILE) as f:
            data = json.load(f)
            if data.get("expires_at", 0) > time.time():
                return data["access_token"]
            else:
                print("WARNING: Access token has expired! Please refresh it.")
                print("Run the OAuth flow to get a new token.")
                return data.get("access_token")  # Try anyway
    
    # Try the aliexpress-oauth directory
    oauth_dir = PROJECT_ROOT.parent / "aliexpress-oauth"
    for candidate in [oauth_dir / "token.json", oauth_dir / "tokens.json"]:
        if candidate.exists():
            with open(candidate) as f:
                data = json.load(f)
                return data.get("access_token", data.get("token", ""))
    
    print("ERROR: No access token found!")
    print("Please save your token to scripts/token.json:")
    print('  {"access_token": "YOUR_TOKEN", "expires_at": UNIX_TIMESTAMP}')
    sys.exit(1)


def sign_request(params, secret):
    """Generate HMAC-SHA256 signature for AliExpress API."""
    sorted_params = sorted(params.items())
    sign_str = ""
    for k, v in sorted_params:
        sign_str += f"{k}{v}"
    sign_str = secret + sign_str + secret
    return hmac.new(
        secret.encode("utf-8"),
        sign_str.encode("utf-8"),
        hashlib.sha256
    ).hexdigest().upper()


def api_call(method, params, access_token):
    """Make an AliExpress API call with proper signing."""
    system_params = {
        "app_key": APP_KEY,
        "method": method,
        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "sign_method": "sha256",
        "v": "2.0",
        "access_token": access_token,
        "format": "json",
    }
    all_params = {**system_params, **params}
    all_params["sign"] = sign_request(all_params, APP_SECRET)
    
    try:
        resp = requests.post(API_URL, data=all_params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        print(f"  API error: {e}")
        return None


def get_cache_path(cache_type, product_id):
    """Get the cache file path for a specific product and cache type."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{cache_type}_{product_id}.json"


def read_cache(cache_type, product_id, ttl):
    """Read cached data if still valid."""
    path = get_cache_path(cache_type, product_id)
    if not path.exists():
        return None
    try:
        with open(path) as f:
            data = json.load(f)
        if time.time() - data.get("_cached_at", 0) < ttl:
            return data.get("data")
    except (json.JSONDecodeError, KeyError):
        pass
    return None


def write_cache(cache_type, product_id, data):
    """Write data to cache."""
    path = get_cache_path(cache_type, product_id)
    with open(path, "w") as f:
        json.dump({"_cached_at": time.time(), "data": data}, f)


def fetch_product_info(product_id, access_token, force=False):
    """Fetch product stock and price info from AliExpress DS API."""
    if not force:
        cached = read_cache("stock", product_id, STOCK_CACHE_TTL)
        if cached:
            return cached
    
    result = api_call(
        "aliexpress.ds.product.get",
        {"product_id": product_id},
        access_token
    )
    
    if not result:
        return None
    
    # Extract the response data
    resp = result.get("aliexpress_ds_product_get_response", {})
    product_result = resp.get("result", {})
    
    if not product_result:
        print(f"  No data for product {product_id}")
        return None
    
    # Parse SKU info
    sku_list = []
    ae_skus = product_result.get("ae_item_sku_info_dtos", {}).get("ae_item_sku_info_d_t_o", [])
    for sku in ae_skus:
        sku_data = {
            "id": sku.get("id", ""),
            "stock": int(sku.get("s_k_u_available_stock", 0)),
            "price": sku.get("offer_sale_price", ""),
            "originalPrice": sku.get("offer_bulk_sale_price", sku.get("sku_price", "")),
        }
        # Get SKU attributes (variant name)
        attrs = sku.get("ae_sku_property_dtos", {}).get("ae_sku_property_d_t_o", [])
        name_parts = []
        image = ""
        for attr in attrs:
            if attr.get("property_value_definition_name"):
                name_parts.append(attr["property_value_definition_name"])
            if attr.get("sku_image"):
                image = attr["sku_image"]
        if name_parts:
            sku_data["name"] = " / ".join(name_parts)
        if image:
            sku_data["image"] = image
        sku_list.append(sku_data)
    
    data = {
        "skus": sku_list,
        "orders": product_result.get("order_cnt", 0),
        "score": product_result.get("avg_evaluation_rating", ""),
        "evaluateRate": product_result.get("positive_feedback_rate", ""),
    }
    
    write_cache("stock", product_id, data)
    return data


def fetch_product_reviews(product_id, access_token, force=False):
    """Fetch product reviews from AliExpress API."""
    if not force:
        cached = read_cache("reviews", product_id, REVIEW_CACHE_TTL)
        if cached:
            return cached
    
    result = api_call(
        "aliexpress.ds.feedname.get",
        {
            "product_id": product_id,
            "page_size": "20",
            "current_page": "1",
        },
        access_token
    )
    
    if not result:
        # Reviews API might not be available – not critical
        return None
    
    resp = result.get("aliexpress_ds_feedname_get_response", {})
    data = resp.get("result", {})
    
    reviews = []
    review_list = data.get("product_reviews", {}).get("product_review", [])
    for rev in review_list[:10]:  # Keep max 10 reviews
        reviews.append({
            "buyer": rev.get("buyer_name", "Anonymous"),
            "country": rev.get("buyer_country", ""),
            "rating": rev.get("buyer_eval", 5),
            "text": rev.get("buyer_feedback", ""),
            "date": rev.get("eval_date_time", ""),
            "images": [
                img.get("image_path", "")
                for img in rev.get("images", {}).get("image_dto", [])
                if img.get("image_path")
            ][:3]
        })
    
    if reviews:
        write_cache("reviews", product_id, reviews)
    return reviews


def load_products_js():
    """Parse the products.js file and return the PRODUCTS array."""
    with open(PRODUCTS_JS, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Remove "const PRODUCTS = " prefix and trailing ";"
    json_str = content.strip()
    if json_str.startswith("const PRODUCTS = "):
        json_str = json_str[len("const PRODUCTS = "):]
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    
    return json.loads(json_str)


def save_products_js(products):
    """Write the products array back to products.js."""
    json_str = json.dumps(products, indent=2, ensure_ascii=False)
    content = f"const PRODUCTS = {json_str};\n"
    with open(PRODUCTS_JS, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    force = "--force" in sys.argv
    
    print("=" * 60)
    print("Rosterikuppia.fi – Product Data Updater")
    print("=" * 60)
    
    # Load access token
    access_token = load_access_token()
    print(f"Access token loaded ({access_token[:10]}...)")
    
    # Load current products
    products = load_products_js()
    print(f"Loaded {len(products)} products from products.js")
    
    updated_stock = 0
    updated_reviews = 0
    errors = 0
    
    for i, product in enumerate(products):
        pid = product["id"]
        print(f"\n[{i+1}/{len(products)}] {product.get('title_fi', product.get('title', pid))[:60]}...")
        
        # Fetch stock/price info
        info = fetch_product_info(pid, access_token, force)
        if info:
            # Update SKU stock and prices
            if info.get("skus"):
                api_skus = {str(s["id"]): s for s in info["skus"]}
                for sku in product.get("skus", []):
                    api_sku = api_skus.get(str(sku["id"]))
                    if api_sku:
                        old_stock = sku.get("stock", 0)
                        sku["stock"] = api_sku["stock"]
                        if api_sku.get("price"):
                            sku["price"] = api_sku["price"]
                        if api_sku.get("originalPrice"):
                            sku["originalPrice"] = api_sku["originalPrice"]
                        if old_stock != sku["stock"]:
                            print(f"  SKU {sku['id']}: stock {old_stock} -> {sku['stock']}")
            
            # Update order count and ratings
            if info.get("orders"):
                product["orders"] = info["orders"]
            if info.get("score"):
                product["score"] = str(info["score"])
            if info.get("evaluateRate"):
                product["evaluateRate"] = str(info["evaluateRate"])
            
            updated_stock += 1
            print(f"  Stock/price updated ✓")
        else:
            errors += 1
            print(f"  Stock/price FAILED ✗")
        
        # Fetch reviews
        reviews = fetch_product_reviews(pid, access_token, force)
        if reviews:
            product["reviews"] = reviews
            updated_reviews += 1
            print(f"  Reviews: {len(reviews)} fetched ✓")
        
        # Rate limiting: 1 second between products
        if i < len(products) - 1:
            time.sleep(1)
    
    # Save updated products
    print(f"\n{'=' * 60}")
    print(f"Updated stock/prices: {updated_stock}/{len(products)}")
    print(f"Updated reviews: {updated_reviews}/{len(products)}")
    print(f"Errors: {errors}")
    
    save_products_js(products)
    print(f"\nSaved to {PRODUCTS_JS}")
    print("Done! ✓")


if __name__ == "__main__":
    main()
