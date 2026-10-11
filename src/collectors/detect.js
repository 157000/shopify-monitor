/**
 * Individua quale raccoglitore usare per il sito di un marchio, provando gli endpoint pubblici noti.
 * Ogni tentativo passa dal client HTTP, quindi rispetta robots.txt.
 */
export async function detectPlatform(websiteUrl, http) {
    const base = new URL(websiteUrl).origin;
    const attempts = [];

    try {
        const { json } = await http.getJson(`${base}/products.json?limit=1`);
        if (Array.isArray(json?.products)) return { kind: 'shopify', url: base, attempts };
        attempts.push('products.json: risposta senza array "products"');
    } catch (err) {
        attempts.push(`products.json: ${err.message}`);
    }

    try {
        const { json } = await http.getJson(`${base}/wp-json/wc/store/v1/products?per_page=1`);
        if (Array.isArray(json)) return { kind: 'woocommerce', url: base, attempts };
        attempts.push('WooCommerce Store API: risposta non riconosciuta');
    } catch (err) {
        attempts.push(`WooCommerce Store API: ${err.message}`);
    }

    try {
        await http.get(websiteUrl, { accept: 'text/html' });
        return { kind: 'web_page', url: websiteUrl, attempts };
    } catch (err) {
        attempts.push(`homepage: ${err.message}`);
    }
    return { kind: null, url: websiteUrl, attempts };
}
