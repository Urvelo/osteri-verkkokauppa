/**
 * AliExpress DS API client – runs directly in the browser.
 * Keys are baked into the admin bundle which is OTP-protected.
 * Only the admin (you) can access this code.
 */

const AE_APP_KEY = import.meta.env.VITE_AE_APP_KEY || ''
const AE_APP_SECRET = import.meta.env.VITE_AE_APP_SECRET || ''
const AE_ACCESS_TOKEN = import.meta.env.VITE_AE_ACCESS_TOKEN || ''
const AE_API_URL = 'https://api-sg.aliexpress.com/sync'

/**
 * Fix mojibake / double-encoded UTF-8 text.
 */
function fixMojibake(text) {
  if (!text) return text
  try {
    if (/\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]/.test(text)) {
      const bytes = new Uint8Array([...text].map(c => c.charCodeAt(0) & 0xFF))
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (decoded && !decoded.includes('\uFFFD')) return decoded
    }
  } catch { /* not double-encoded */ }
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function cleanAeText(text) {
  if (!text) return ''
  let cleaned = fixMojibake(String(text))
  cleaned = cleaned.normalize('NFC')
  cleaned = cleaned.replace(/\u00A0/g, ' ')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  return cleaned
}

/**
 * HMAC-SHA256 sign request (IOP protocol, Web Crypto API).
 */
async function signRequest(params, secret) {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
  const signStr = sorted.map(([k, v]) => `${k}${v}`).join('')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signStr))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * Call AliExpress DS API method.
 */
async function aeApiCall(method, params = {}) {
  if (!AE_ACCESS_TOKEN) throw new Error('AliExpress access token puuttuu (.env)')

  const systemParams = {
    app_key: AE_APP_KEY,
    method,
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    access_token: AE_ACCESS_TOKEN,
  }

  const allParams = { ...systemParams, ...params }
  allParams.sign = await signRequest(allParams, AE_APP_SECRET)

  const body = new URLSearchParams(allParams)
  const resp = await fetch(AE_API_URL, { method: 'POST', body })
  if (!resp.ok) throw new Error(`AE API HTTP ${resp.status}`)
  const json = await resp.json()

  // Log raw response in development to help debug field names
  console.debug('[AE API]', method, json)

  return json
}

/**
 * Fetch a single product by AliExpress product ID.
 * Returns a normalized product object with all data.
 */
export async function fetchAliExpressProduct(productId) {
  const result = await aeApiCall('aliexpress.ds.product.get', {
    product_id: productId,
    ship_to_country: 'FI',
    target_currency: 'EUR',
    target_language: 'en',
  })

  if (result.error_response) {
    throw new Error(result.error_response.msg || result.error_response.code || 'Product not found')
  }

  const wrapper = result.aliexpress_ds_product_get_response?.result || {}

  // Base product info is nested inside ae_item_base_info_dto
  const base = wrapper.ae_item_base_info_dto || {}

  // Parse SKUs
  const skus = []
  const aeSkus = wrapper.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || []
  for (const sku of aeSkus) {
    const attrs = sku.ae_sku_property_dtos?.ae_sku_property_d_t_o || []
    const nameParts = []
    let skuImage = ''
    const properties = {}
    for (const attr of attrs) {
      const propName = cleanAeText(attr.sku_property_name || '')
      const propValue = cleanAeText(attr.property_value_definition_name || attr.sku_property_value || '')
      if (propValue) {
        nameParts.push(propValue)
        if (propName) properties[propName] = propValue
      }
      if (attr.sku_image) skuImage = attr.sku_image
    }

    // Sale price: try multiple field names
    const salePrice = parseFloat(
      sku.offer_sale_price || sku.sku_sale_price || sku.sku_price || 0
    )
    // Original (bulk/retail) price
    const origPrice = parseFloat(
      sku.offer_bulk_sale_price || sku.sku_price || sku.sku_sale_price || 0
    )
    // Stock quantity: AliExpress DS API returns "sku_available_stock"
    const stock = parseInt(
      sku.sku_available_stock ?? sku.ipm_sku_stock ?? sku.s_k_u_available_stock ?? sku.sku_stock ?? 0, 10
    )

    skus.push({
      name: nameParts.join(' / '),
      price: salePrice,
      original_price: origPrice,
      stock,
      image: skuImage,
      properties,
    })
  }

  // Parse images
  const imgModule = wrapper.ae_multimedia_info_dto || {}
  const images = (imgModule.image_urls || '').split(';').filter(Boolean).map(s => s.trim())

  // Video
  const video = imgModule.ae_video_dtos?.ae_video_d_t_o?.[0]?.media_url || ''

  // Description HTML — strip pure-HTML <img> spam tags (AE returns lots of image tags)
  const rawDescription = base.detail || wrapper.detail || ''
  const cleanedDescription = fixMojibake(rawDescription)

  const minPrice = skus.length
    ? Math.min(...skus.filter(s => s.price > 0).map(s => s.price))
    : 0

  return {
    id: productId,
    title: cleanAeText(base.subject || base.product_name || ''),
    sale_price: minPrice,
    original_price: parseFloat(base.original_price || 0),
    image: images[0] || '',
    images,
    video,
    url: `https://www.aliexpress.com/item/${productId}.html`,
    orders: parseInt(base.order_count || base.order_cnt || 0, 10),
    score: parseFloat(base.avg_evaluation_rating || 0),
    evaluate_rate: String(base.positive_feedback_rate || ''),
    category_id: String(base.category_id || ''),
    description: cleanedDescription,
    evaluation_count: String(base.evaluation_count || 0),
    sales_count: String(base.order_count || base.order_cnt || 0),
    skus,
  }
}

/**
 * Fetch reviews for a product via the Firebase Cloud Function proxy.
 * The Cloud Function calls feedback.aliexpress.com server-side (no CORS issue).
 * Fetches up to maxPages pages (20 reviews per page).
 */
const REVIEWS_FUNCTION_URL = 'https://reviews-proxy.tobuhu07.workers.dev'

export async function fetchAliExpressReviews(productId, maxPages = 5) {
  const allReviews = []

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `${REVIEWS_FUNCTION_URL}?productId=${productId}&page=${page}&pageSize=20`
      const resp = await fetch(url)
      if (!resp.ok) {
        console.warn(`fetchReviews HTTP ${resp.status} on page ${page}`)
        break
      }
      const data = await resp.json()

      // Raw AliExpress format: { data: { evaViewList: [...], totalNum: N } }
      const evaList = data?.data?.evaViewList || []
      const totalNum = data?.data?.totalNum || 0

      if (evaList.length === 0 && page === 1) {
        console.warn('fetchReviews: no reviews in response', data)
        break
      }

      for (const r of evaList) {
        const evalScore = r.buyerEval ?? 100
        const rating = evalScore >= 80 ? 5 : evalScore >= 60 ? 4 : evalScore >= 40 ? 3 : evalScore >= 20 ? 2 : 1
        allReviews.push({
          reviewer_name: cleanAeText(r.buyerName || 'Buyer'),
          country: r.buyerCountry || '',
          rating,
          comment: cleanAeText(r.buyerFeedback || ''),
          review_date: r.evalDate || '',
          images: Array.isArray(r.images) ? r.images : [],
        })
      }

      // Stop if this was the last page
      const totalPages = Math.ceil(totalNum / 20)
      if (page >= totalPages || evaList.length < 20) break
    } catch (err) {
      console.warn(`Review fetch page ${page} failed:`, err.message)
      break
    }
  }

  return allReviews
}
