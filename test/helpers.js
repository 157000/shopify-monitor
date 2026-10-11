import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, migrate } from '../src/db.js';
import { createHttpClient } from '../src/http/politeFetch.js';

process.env.TGI_SILENT = '1';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? null;

/**
 * Negozio finto in locale: simula robots.txt, Shopify, WooCommerce e una pagina HTML.
 * Lo stato è mutabile per simulare i cambiamenti tra una raccolta e l'altra.
 */
export async function startFakeStore(initial = {}) {
    const state = {
        robots: 'User-agent: *\nDisallow: /checkout\n',
        robotsStatus: 200,
        meta: { name: 'Negozio di prova', currency: 'EUR' },
        shopifyProducts: [],
        wooProducts: [],
        pageHtml: '<html><head><title>Home</title></head><body><main><h1>Benvenuti</h1></main></body></html>',
        requests: [],
        failNext: [],          // [{ path, status, headers }]
        ...initial,
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        state.requests.push({ path: url.pathname + url.search, userAgent: req.headers['user-agent'] });

        const failure = state.failNext.findIndex((f) => url.pathname === f.path);
        if (failure !== -1) {
            const [f] = state.failNext.splice(failure, 1);
            res.writeHead(f.status, f.headers ?? {});
            res.end('errore simulato');
            return;
        }

        const json = (body, headers = {}) => {
            res.writeHead(200, { 'content-type': 'application/json', ...headers });
            res.end(JSON.stringify(body));
        };

        if (url.pathname === '/robots.txt') {
            res.writeHead(state.robotsStatus, { 'content-type': 'text/plain' });
            res.end(state.robots);
        } else if (url.pathname === '/meta.json') {
            json(state.meta);
        } else if (url.pathname === '/products.json') {
            const limit = Number(url.searchParams.get('limit') ?? 30);
            const page = Number(url.searchParams.get('page') ?? 1);
            json({ products: state.shopifyProducts.slice((page - 1) * limit, page * limit) });
        } else if (url.pathname === '/wp-json/wc/store/v1/products') {
            const perPage = Number(url.searchParams.get('per_page') ?? 10);
            const page = Number(url.searchParams.get('page') ?? 1);
            const totalPages = Math.max(1, Math.ceil(state.wooProducts.length / perPage));
            json(state.wooProducts.slice((page - 1) * perPage, page * perPage), { 'x-wp-totalpages': String(totalPages) });
        } else if (url.pathname === '/' || url.pathname === '/regali') {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(state.pageHtml);
        } else {
            res.writeHead(404);
            res.end('not found');
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return {
        state,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

export function testHttpClient(overrides = {}) {
    return createHttpClient({
        userAgent: 'TenutaGrieciIntelligence/test',
        delayPerHostMs: 0,
        timeoutMs: 5000,
        maxRetries: 2,
        maxRetryAfterMs: 2000,
        ...overrides,
    });
}

export async function freshDb() {
    const db = createDb(TEST_DATABASE_URL);
    await db.query('DROP SCHEMA IF EXISTS public CASCADE');
    await db.query('CREATE SCHEMA public');
    await migrate(db, path.join(ROOT, 'db', 'migrations'));
    return db;
}

export function shopifyProduct({ id, title, handle, price, compareAt = null, available = true, variants, body = '', tags = [] }) {
    return {
        id,
        title,
        handle: handle ?? `prodotto-${id}`,
        body_html: body,
        published_at: '2026-09-01T10:00:00+02:00',
        created_at: '2026-09-01T10:00:00+02:00',
        updated_at: new Date().toISOString(),
        vendor: 'Frantoio Esempio',
        product_type: 'Olio extravergine',
        tags,
        variants: variants ?? [{
            id: id * 10, title: 'Default Title', sku: `SKU-${id}`, available, price, compare_at_price: compareAt,
        }],
        images: [{ id: id * 100, src: `https://cdn.example.com/${id}.jpg` }],
        options: [],
    };
}

export function testSettings(overrides = {}) {
    return {
        collect: { maxPages: 5, suspiciousDropRatio: 0.5 },
        ai: { classifyModel: 'claude-haiku-5-5', strategyModel: 'claude-opus-5-5', classifyBatchLimit: 50, monthlyBudgetUsd: 20, maxInputChars: 12000 },
        health: { staleHours: 48, failureThreshold: 3 },
        paths: { reportsDir: path.join(ROOT, 'reports', 'test') },
        alertWebhookUrl: null,
        ...overrides,
    };
}
