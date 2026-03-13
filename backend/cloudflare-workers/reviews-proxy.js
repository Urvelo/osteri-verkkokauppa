/**
 * Cloudflare Worker — AliExpress Reviews Proxy
 * Deploy this at: https://workers.cloudflare.com/
 * Free tier: 100 000 requests/day
 *
 * URL: https://reviews-proxy.<your-subdomain>.workers.dev?productId=12345&page=1&pageSize=20
 */

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const page      = url.searchParams.get("page")     || "1";
    const pageSize  = url.searchParams.get("pageSize") || "20";

    if (!productId) {
      return new Response(JSON.stringify({ error: "productId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const targetUrl = `https://feedback.aliexpress.com/pc/searchEvaluation.do?productId=${productId}&page=${page}&pageSize=${pageSize}&lang=en_US`;

    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `https://www.aliexpress.com/item/${productId}.html`,
        "Accept": "application/json, text/plain, */*",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "s-maxage=300", // 5 min cache
      },
    });
  },
};
