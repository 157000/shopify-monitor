import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { detectPlatform } from '../src/collectors/detect.js';
import { extractPage } from '../src/collectors/webPage.js';
import { RobotsDisallowedError, parseRetryAfter } from '../src/http/politeFetch.js';
import { shopifyProduct, startFakeStore, testHttpClient } from './helpers.js';

describe('client HTTP rispettoso', () => {
    let store;
    before(async () => {
        store = await startFakeStore({ shopifyProducts: [shopifyProduct({ id: 1, title: 'Olio 500 ml', price: '20.00' })] });
    });
    after(() => store.close());

    it('si identifica con lo User-Agent configurato', async () => {
        const http = testHttpClient();
        await http.get(`${store.url}/`);
        assert.ok(store.state.requests.every((r) => r.userAgent === 'TenutaGrieciIntelligence/test'));
    });

    it('blocca i percorsi vietati da robots.txt', async () => {
        store.state.robots = 'User-agent: *\nDisallow: /products.json\n';
        const http = testHttpClient();
        await assert.rejects(http.getJson(`${store.url}/products.json`), RobotsDisallowedError);
        store.state.robots = 'User-agent: *\nDisallow: /checkout\n';
    });

    it('robots.txt assente (404) = nessuna restrizione; errore del server (500) = accesso negato', async () => {
        store.state.robotsStatus = 404;
        assert.equal(await testHttpClient().isAllowed(`${store.url}/products.json`), true);
        store.state.robotsStatus = 500;
        assert.equal(await testHttpClient().isAllowed(`${store.url}/products.json`), false);
        store.state.robotsStatus = 200;
    });

    it('su 429 rispetta Retry-After e riprova', async () => {
        store.state.failNext.push({ path: '/meta.json', status: 429, headers: { 'retry-after': '0' } });
        const { json } = await testHttpClient().getJson(`${store.url}/meta.json`);
        assert.equal(json.currency, 'EUR');
    });

    it('se il sito chiede un\'attesa troppo lunga rinuncia invece di insistere', async () => {
        store.state.failNext.push({ path: '/meta.json', status: 429, headers: { 'retry-after': '3600' } });
        await assert.rejects(testHttpClient().getJson(`${store.url}/meta.json`), /attendere/);
    });

    it('interpreta Retry-After in secondi o come data', () => {
        assert.equal(parseRetryAfter('5'), 5000);
        assert.equal(parseRetryAfter(null), null);
        assert.ok(parseRetryAfter(new Date(Date.now() + 10000).toUTCString()) > 0);
    });

    it('riconosce un negozio Shopify', async () => {
        const result = await detectPlatform(`${store.url}/`, testHttpClient());
        assert.equal(result.kind, 'shopify');
    });
});

describe('estrazione di pagine', () => {
    it('conserva header promozionali, toglie script e menu, trova i prezzi', () => {
        const page = extractPage(`<html><head><title> Regali </title><meta name="description" content="Idee regalo"></head>
            <body><header><div class="announcement">Spedizione gratuita sopra 60 €</div></header>
            <nav><a>Menu</a></nav><script>var x = 1;</script>
            <main><h1>Cofanetti</h1><p>Cofanetto Tre Oli a € 45,00</p></main><footer>Contatti</footer></body></html>`);
        assert.equal(page.title, 'Regali');
        assert.equal(page.metaDescription, 'Idee regalo');
        assert.deepEqual(page.headings, ['Cofanetti']);
        assert.match(page.textContent, /Spedizione gratuita sopra 60 €/);
        assert.doesNotMatch(page.textContent, /Menu|var x|Contatti/);
        assert.deepEqual(page.priceMentions, ['60 €', '€ 45,00']);
    });
});
