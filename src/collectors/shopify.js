import { normalizeShopifyProduct } from '../domain/products.js';

const PAGE_SIZE = 250;

/**
 * Catalogo pubblico di un negozio Shopify (/products.json), lo stesso endpoint usato dal monitor originale.
 *
 * La valuta non è inclusa in products.json. Ordine di preferenza:
 *  1. valuta dichiarata nel file dei marchi (verificata da una persona);
 *  2. campo "currency" di /meta.json — endpoint diffuso ma NON documentato ufficialmente da Shopify,
 *     quindi trattato come tentativo;
 *  3. altrimenti la valuta resta "non verificata" e il report lo segnala.
 * Con Shopify Markets il prezzo può dipendere dal paese del visitatore: il dato registrato è quello
 * servito al sistema di raccolta.
 */
export async function collectShopify(source, http, { maxPages }) {
    const base = new URL(source.url).origin;
    const warnings = [];

    let currency = source.currency_declared ?? null;
    if (!currency) {
        try {
            const meta = await http.getJson(`${base}/meta.json`);
            if (typeof meta.json?.currency === 'string') currency = meta.json.currency;
            else warnings.push('meta.json senza campo "currency": valuta non verificata');
        } catch (err) {
            warnings.push(`meta.json non disponibile (${err.message}): valuta non verificata`);
        }
    }

    const rawProducts = [];
    let complete = true;
    for (let page = 1; page <= maxPages; page++) {
        const { json } = await http.getJson(`${base}/products.json?limit=${PAGE_SIZE}&page=${page}`);
        if (!Array.isArray(json?.products)) {
            throw new Error('Formato inatteso: products.json non contiene l\'array "products" (possibile cambio di schema)');
        }
        rawProducts.push(...json.products);
        if (json.products.length < PAGE_SIZE) break;
        if (page === maxPages) {
            complete = false;
            warnings.push(`Catalogo troncato a ${maxPages} pagine: rimozioni non valutate`);
        }
    }

    const items = rawProducts.map((p) => normalizeShopifyProduct(p, base, currency));
    return { items, complete, currency, warnings };
}
