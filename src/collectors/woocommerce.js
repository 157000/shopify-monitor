import { normalizeWooProduct } from '../domain/products.js';

const PAGE_SIZE = 100;

/** Catalogo pubblico di un negozio WooCommerce tramite Store API (/wp-json/wc/store/v1/products). */
export async function collectWooCommerce(source, http, { maxPages }) {
    const base = new URL(source.url).origin;
    const warnings = [];
    const rawProducts = [];
    let complete = true;

    for (let page = 1; page <= maxPages; page++) {
        const res = await http.getJson(`${base}/wp-json/wc/store/v1/products?per_page=${PAGE_SIZE}&page=${page}`);
        if (!Array.isArray(res.json)) {
            throw new Error('Formato inatteso: lo Store API non ha restituito un array di prodotti (possibile cambio di schema)');
        }
        rawProducts.push(...res.json);
        const totalPages = Number(res.headers.get('x-wp-totalpages'));
        const done = Number.isFinite(totalPages) && totalPages > 0 ? page >= totalPages : res.json.length < PAGE_SIZE;
        if (done) break;
        if (page === maxPages) {
            complete = false;
            warnings.push(`Catalogo troncato a ${maxPages} pagine: rimozioni non valutate`);
        }
    }

    const items = rawProducts.map(normalizeWooProduct);
    const currencies = new Set(items.map((i) => i.currency).filter(Boolean));
    if (currencies.size > 1) warnings.push(`Più valute nel catalogo: ${[...currencies].join(', ')}`);
    if (source.currency_declared && currencies.size && !currencies.has(source.currency_declared)) {
        warnings.push(`Valuta dichiarata ${source.currency_declared} diversa da quella osservata (${[...currencies].join(', ')})`);
    }
    return { items, complete, currency: items.find((i) => i.currency)?.currency ?? null, warnings };
}
