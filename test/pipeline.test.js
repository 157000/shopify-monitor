import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createAi } from '../src/ai/client.js';
import { runClassify } from '../src/ai/classify.js';
import { loadTaxonomy } from '../src/ai/taxonomy.js';
import { checkHealth } from '../src/health/check.js';
import { decideInsight } from '../src/insights.js';
import { loadBrandsFile, syncBrands } from '../src/pipeline/brands.js';
import { runCollect } from '../src/pipeline/collect.js';
import { importContent } from '../src/pipeline/importContent.js';
import { runWeeklyReport } from '../src/reports/weekly.js';
import {
    ROOT, TEST_DATABASE_URL, freshDb, shopifyProduct, startFakeStore, testHttpClient, testSettings,
} from './helpers.js';

const skip = TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL non impostata: test di integrazione saltati';

function wooProduct(id, name, price, regular = price) {
    return {
        id, name, slug: `p-${id}`, permalink: `https://woo.example/p-${id}/`,
        short_description: `<p>${name}: olio da olive raccolte a mano.</p>`, description: '',
        prices: { price: String(price), regular_price: String(regular), currency_code: 'EUR', currency_minor_unit: 2 },
        is_in_stock: true, categories: [{ name: 'Olio' }], tags: [], images: [],
    };
}

/** Client Anthropic finto: registra le richieste e risponde in modo deterministico. */
function fakeAnthropic(calls) {
    const usage = { input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    return {
        beta: {
            messages: {
                async parse(params) {
                    calls.push(params);
                    const text = params.messages[0].content;
                    if (params.model === 'claude-opus-5-5') {
                        const firstEvent = text.match(/"ref": "(E\d+)"/)[1];
                        return {
                            model: params.model, stop_reason: 'end_turn', usage,
                            parsed_output: {
                                opportunita: [{
                                    titolo: 'Confezioni regalo con narrazione del territorio',
                                    descrizione: 'Più marchi spingono cofanetti nel periodo natalizio.',
                                    perche_rilevante: 'Segnali di catalogo concreti.',
                                    coerenza_brand: 'Base di conoscenza non compilata: da verificare.',
                                    evidenze: [firstEvent, 'E999999'],
                                    informazioni_mancanti: ['Costo del packaging'],
                                }],
                                ipotesi: [
                                    {
                                        ipotesi: 'Un cofanetto con storia del frantoio aumenta il tasso di conversione nel periodo natalizio',
                                        evidenze: [firstEvent], pubblico: 'Chi fa un regalo', esperimento: 'Landing page dedicata per 3 settimane',
                                        formato: 'Landing + 2 post', kpi_primario: 'Tasso di conversione', criterio_successo: '+20% rispetto alla media',
                                        criterio_interruzione: 'Nessun ordine dopo 2 settimane', costo_stimato: 'basso: asset esistenti',
                                        rischio_brand: 'basso', punteggi: { evidenza: 3, coerenza: 4, potenziale_commerciale: 4, fattibilita: 5, differenziazione: 3 },
                                    },
                                    {
                                        ipotesi: 'Ipotesi senza evidenze reali', evidenze: ['E424242'], pubblico: '-', esperimento: '-', formato: '-',
                                        kpi_primario: '-', criterio_successo: '-', criterio_interruzione: '-', costo_stimato: '-', rischio_brand: '-',
                                        punteggi: { evidenza: 5, coerenza: 5, potenziale_commerciale: 5, fattibilita: 5, differenziazione: 5 },
                                    },
                                ],
                                avvertenze: ['Campione ridotto'],
                            },
                        };
                    }
                    const labels = [];
                    if (/raccolte a mano/i.test(text)) labels.push({ dimensione: 'tema', valore: 'processo_produttivo', evidenza: 'raccolte a mano', confidenza: 0.9 });
                    if (/cofanetto/i.test(text)) labels.push({ dimensione: 'formato', valore: 'confezione_regalo', evidenza: 'Cofanetto', confidenza: 0.95 });
                    labels.push({ dimensione: 'tema', valore: 'esclusivita_lusso', evidenza: 'edizione numerata a mano', confidenza: 0.9 }); // inventata
                    return {
                        model: params.model, stop_reason: 'end_turn', usage,
                        parsed_output: { etichette: labels, sintesi: 'Scheda prodotto di olio.', lingua: 'it', testo_insufficiente: false },
                    };
                },
            },
        },
    };
}

describe('pipeline completa (database reale)', { skip }, () => {
    let db;
    let shop;
    let woo;
    let tmpDir;
    const http = testHttpClient();
    const settings = testSettings({ paths: { reportsDir: path.join(os.tmpdir(), `tgi-report-${process.pid}`) } });
    const taxonomy = loadTaxonomy(path.join(ROOT, 'config', 'taxonomy.yaml'));
    const aiCalls = [];
    let ctx;

    before(async () => {
        db = await freshDb();
        shop = await startFakeStore({
            shopifyProducts: [
                shopifyProduct({ id: 1, title: 'Olio Riserva 500 ml', price: '24.00', body: '<p>Olive raccolte a mano.</p>' }),
                shopifyProduct({ id: 2, title: 'Cofanetto Tre Oli 3 x 250 ml', price: '60.00' }),
                shopifyProduct({ id: 3, title: 'Latta 3 L', price: '45.00' }),
                ...[4, 5, 6, 7].map((id) => shopifyProduct({ id, title: `Olio ${id} 750 ml`, price: '30.00' })),
            ],
            pageHtml: '<html><head><title>Regali</title></head><body><main><h1>Idee regalo</h1><p>Spedizione in 48 ore</p></main></body></html>',
        });
        woo = await startFakeStore({ wooProducts: [wooProduct(10, 'Olio Nuovo 500ml', 1900), wooProduct(11, 'Olio Bio 1 L', 3200)] });

        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tgi-'));
        const brandsFile = path.join(tmpDir, 'brands.yaml');
        fs.writeFileSync(brandsFile, `brands:
  - slug: frantoio-esempio
    name: Frantoio Esempio
    group: concorrente_diretto
    sources:
      - kind: shopify
        url: ${shop.url}
        terms_note: "Test"
      - kind: web_page
        url: ${shop.url}/regali
        label: Pagina regali
  - slug: oleificio-prova
    name: Oleificio Prova
    group: concorrente_diretto
    sources:
      - kind: woocommerce
        url: ${woo.url}
  - slug: cioccolato-esempio
    name: Cioccolato Esempio
    group: gastronomico_premium
`);
        await syncBrands(db, loadBrandsFile(brandsFile));
        ctx = {
            db, http, settings, taxonomy, knowledgeBase: '',
            ai: createAi({ db, pricing: { 'claude-haiku-5-5': { input: 0.1, output: 0.5 }, 'claude-opus-5-5': { input: 4, output: 20 } }, anthropic: fakeAnthropic(aiCalls) }),
        };
    });

    after(async () => {
        await db?.close();
        await shop?.close();
        await woo?.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.rmSync(settings.paths.reportsDir, { recursive: true, force: true });
    });

    it('prima raccolta: tutto registrato come baseline, nessuna falsa novità', async () => {
        const result = await runCollect(ctx, { force: true });
        assert.equal(result.status, 'ok');
        const products = await db.one('SELECT count(*)::int AS n FROM products');
        assert.equal(products.n, 9);
        const events = await db.one('SELECT count(*) FILTER (WHERE is_baseline)::int AS base, count(*) FILTER (WHERE NOT is_baseline)::int AS nuovi FROM events');
        assert.equal(events.nuovi, 0);
        assert.equal(events.base, 10); // 9 prodotti + 1 pagina
        const cofanetto = await db.one(`SELECT volume_ml, price_per_liter_cents, currency FROM product_snapshots WHERE title LIKE 'Cofanetto%'`);
        assert.deepEqual(cofanetto, { volume_ml: 750, price_per_liter_cents: 8000, currency: 'EUR' });
    });

    it('non ripete la raccolta prima dell\'intervallo minimo', async () => {
        const result = await runCollect(ctx, {});
        assert.equal(result.stats.fonti, 0);
    });

    it('seconda raccolta: prezzi, sconti, novità, rimozioni e pagina modificata', async () => {
        const products = shop.state.shopifyProducts;
        products[0].variants[0].price = '27.00';                     // +12,5%
        products[1].variants[0].price = '50.00';                     // sconto
        products[1].variants[0].compare_at_price = '60.00';
        products.splice(2, 1);                                        // latta rimossa
        products.push(shopifyProduct({ id: 8, title: 'Olio Nuovo 2026 500 ml', price: '22.00' }));
        shop.state.pageHtml = '<html><head><title>Regali</title></head><body><main><h1>Idee regalo</h1><p>Spedizione gratuita sopra 60 €</p></main></body></html>';
        woo.state.wooProducts[0].prices.price = '2100';

        const result = await runCollect(ctx, { force: true });
        assert.equal(result.status, 'ok');
        const { rows } = await db.query('SELECT event_type, summary FROM events WHERE NOT is_baseline ORDER BY id');
        const types = rows.map((r) => r.event_type).sort();
        assert.deepEqual(types, ['nuovo_prodotto', 'pagina_modificata', 'prezzo_variato', 'prezzo_variato', 'prezzo_variato', 'prodotto_rimosso', 'sconto_iniziato']);
        assert.ok(rows.some((r) => /24,00\s€ → 27,00\s€ \(\+12,5%\)/.test(r.summary)));
        const snapshots = await db.one('SELECT count(*)::int AS n FROM product_snapshots');
        assert.equal(snapshots.n, 9 + 1 + 3); // nuove fotografie solo per i prodotti cambiati
    });

    it('un calo improvviso del catalogo non viene scambiato per rimozioni', async () => {
        const saved = shop.state.shopifyProducts;
        shop.state.shopifyProducts = saved.slice(0, 1);
        await runCollect(ctx, { force: true, brandSlug: 'frantoio-esempio' });
        const removed = await db.one(`SELECT count(*)::int AS n FROM events WHERE event_type = 'prodotto_rimosso'`);
        assert.equal(removed.n, 1);
        const source = await db.one(`SELECT last_error FROM sources WHERE kind = 'shopify'`);
        assert.match(source.last_error, /Calo anomalo/);
        shop.state.shopifyProducts = saved;
    });

    it('una fonte vietata da robots.txt viene segnalata, non forzata', async () => {
        woo.state.robots = 'User-agent: *\nDisallow: /wp-json/\n';
        // client nuovo: robots.txt resta in cache 24 ore, come farebbe un crawler reale
        const result = await runCollect({ ...ctx, http: testHttpClient() }, { force: true, brandSlug: 'oleificio-prova' });
        assert.equal(result.status, 'errore');
        const source = await db.one(`SELECT access_status, consecutive_failures FROM sources WHERE kind = 'woocommerce'`);
        assert.deepEqual(source, { access_status: 'bloccato_robots', consecutive_failures: 1 });
        woo.state.robots = 'User-agent: *\nDisallow: /checkout\n';
    });

    it('importa contenuti e registra la fine di un\'inserzione', async () => {
        const first = await importContent(db, [{
            brand: 'frantoio-esempio', platform: 'meta_ads', external_ref: 'ad-1', format: 'inserzione',
            text: 'Il Cofanetto per un Natale autentico: olive raccolte a mano.', cta: 'Acquista',
            url: 'https://www.facebook.com/ads/library/?id=1', observed_at: '2026-10-01T09:00:00Z',
            collection_method: 'Meta Ad Library, consultazione manuale', active: true,
        }]);
        assert.equal(first.stats.nuovi, 1);
        const second = await importContent(db, [{
            brand: 'frantoio-esempio', platform: 'meta_ads', external_ref: 'ad-1', observed_at: '2026-10-08T09:00:00Z',
            collection_method: 'Meta Ad Library, consultazione manuale', active: false,
        }]);
        assert.equal(second.stats.aggiornati, 1);
        const ended = await db.one(`SELECT summary FROM events WHERE event_type = 'inserzione_non_piu_attiva'`);
        assert.match(ended.summary, /7 giorni/);
    });

    it('classificazione: evidenze verificate, nessuna chiamata ripetuta per lo stesso testo', async () => {
        const result = await runClassify(ctx, { limit: 100 });
        assert.equal(result.status, 'ok');
        assert.equal(result.stats.falliti, 0);
        const classifyCalls = aiCalls.filter((c) => c.model === 'claude-haiku-5-5');
        assert.equal(classifyCalls.length, result.stats.classificati);
        assert.ok(classifyCalls.every((c) => !c.fallbacks && !c.betas), 'Haiku non supporta il fallback lato server');
        assert.ok(classifyCalls.every((c) => c.output_config.effort === 'low'));

        const content = await db.one(`SELECT labels, rejected_labels FROM classifications WHERE entity_type = 'content'`);
        assert.deepEqual(content.labels.map((l) => l.valore).sort(), ['confezione_regalo', 'processo_produttivo']);
        assert.equal(content.rejected_labels[0].valore, 'esclusivita_lusso');

        // Cambia solo il prezzo: nuova fotografia, stesso testo → analisi riutilizzata.
        shop.state.shopifyProducts[0].variants[0].price = '29.00';
        await runCollect(ctx, { force: true, brandSlug: 'frantoio-esempio' });
        const callsBefore = aiCalls.length;
        const again = await runClassify(ctx, { limit: 100 });
        assert.equal(again.stats.riutilizzati, 1);
        assert.equal(aiCalls.length, callsBefore);
    });

    it('report settimanale: sette sezioni, fonti, ipotesi con evidenze valide salvate come insight', async () => {
        const result = await runWeeklyReport(ctx, { from: new Date(Date.now() - 30 * 86400000), to: new Date(Date.now() + 60000) });
        const md = result.markdown;
        for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.match(md, new RegExp(`### ${n}\\. `));
        assert.match(md, /Nuovo prodotto: Olio Nuovo 2026 500 ml/);
        assert.match(md, /\[fonte\]\(http:\/\/127\.0\.0\.1/);
        assert.match(md, /Posizionamento di prezzo osservato/);
        assert.match(md, /robots\.txt non consente/);
        assert.match(md, /Ipotesi "Ipotesi senza evidenze reali": nessun riferimento verificabile/);
        assert.doesNotMatch(md, /E999999/);
        assert.ok(fs.existsSync(result.filePath));

        const strategyCall = aiCalls.find((c) => c.model === 'claude-opus-5-5');
        assert.equal(strategyCall.fallbacks, 'default');
        assert.deepEqual(strategyCall.betas, ['server-side-fallback-2026-07-01']);
        assert.equal(strategyCall.output_config.effort, 'high');

        const insights = (await db.query(`SELECT id, details->>'tipo' AS tipo, evidence FROM insights ORDER BY id`)).rows;
        assert.deepEqual(insights.map((i) => i.tipo), ['opportunita', 'ipotesi_test']);
        assert.equal(insights[0].evidence.length, 1);

        const decisionId = await decideInsight(db, { id: insights[1].id, status: 'approvata', note: 'Test a novembre', decidedBy: 'test' });
        const decision = await db.one('SELECT level, parent_id, created_by FROM insights WHERE id = $1', [decisionId]);
        assert.deepEqual(decision, { level: 'decisione', parent_id: insights[1].id, created_by: 'umano' });
        await assert.rejects(decideInsight(db, { id: insights[0].id, status: 'approvata', note: '' }), /nota/);
    });

    it('report senza AI: le sezioni deterministiche restano disponibili', async () => {
        const result = await runWeeklyReport(ctx, { useAi: false });
        assert.match(result.markdown, /Sezione non generata: analisi AI esclusa/);
        assert.match(result.markdown, /### 2\. Nuovi prodotti e offerte osservati/);
    });

    it('controllo di salute: fonti bloccate, costi registrati', async () => {
        const health = await checkHealth(db, settings);
        assert.ok(health.issues.some((i) => i.check === 'fonti' && /robots/.test(i.message)));
        assert.ok(health.issues.some((i) => i.check === 'governance'));
        assert.ok(health.spendMonthUsd > 0);
        const usage = await db.one('SELECT count(*)::int AS n FROM ai_usage');
        assert.equal(usage.n, aiCalls.length);
    });
});
