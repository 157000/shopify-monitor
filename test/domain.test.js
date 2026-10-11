import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffPages, diffProducts } from '../src/domain/diff.js';
import { normalizeShopifyProduct, normalizeWooProduct, productContentHash } from '../src/domain/products.js';
import { htmlToText, toCents } from '../src/domain/text.js';
import { parseVolume, pricePerLiterCents } from '../src/domain/volume.js';
import { shopifyProduct } from './helpers.js';

describe('volume', () => {
    const cases = [
        ['Olio EVO Coratina 500 ml', 500],
        ['Latta 3L', 3000],
        ['Bottiglia 0,75 l', 750],
        ['75cl', 750],
        ['Set regalo 3 x 250 ml', 750],
        ['3 bottiglie da 250ml', 750],
        ['250 ml x 6', 1500],
        ['Monocultivar 1 litro', 1000],
        ['16.9 fl oz', 500],
        ['Olio 100% italiano', null],
        ['Confezione 250 ml e 500 ml', null],
    ];
    for (const [text, expected] of cases) {
        it(`"${text}" → ${expected ?? 'nessun volume'}`, () => {
            assert.equal(parseVolume(text).ml, expected);
        });
    }

    it('spiega perché non stima un volume ambiguo', () => {
        assert.match(parseVolume('Formato 100ml + 250ml').note, /ambiguo/);
    });

    it('calcola il prezzo al litro in centesimi', () => {
        assert.equal(pricePerLiterCents(1800, 500), 3600);
        assert.equal(pricePerLiterCents(1800, null), null);
    });
});

describe('normalizzazione', () => {
    it('Shopify: prezzi, sconto, disponibilità e formato d\'ingresso', () => {
        const raw = shopifyProduct({
            id: 1,
            title: 'Olio Monocultivar',
            body: '<p>Raccolta <strong>a mano</strong>.</p><p>Frangitura entro 6 ore.</p>',
            tags: ['regalo', ' novità '],
            variants: [
                { id: 11, title: '500 ml', available: true, price: '24.00', compare_at_price: '30.00' },
                { id: 12, title: '250 ml', available: false, price: '14.00', compare_at_price: null },
            ],
        });
        const p = normalizeShopifyProduct(raw, 'https://negozio.example', 'EUR');
        assert.equal(p.url, 'https://negozio.example/products/prodotto-1');
        assert.equal(p.minPriceCents, 1400);
        assert.equal(p.maxPriceCents, 2400);
        assert.equal(p.onSale, true);
        assert.equal(p.maxDiscountPct, 20);
        assert.equal(p.available, true);
        assert.deepEqual(p.tags, ['novità', 'regalo']);
        assert.equal(p.descriptionText, 'Raccolta a mano.\nFrangitura entro 6 ore.');
        // formato d'ingresso = variante più economica con volume: 250 ml a 14 € → 56 €/L
        assert.equal(p.volumeMl, 250);
        assert.equal(p.pricePerLiterCents, 5600);
    });

    it('Shopify: con più varianti non applica il volume del titolo a una variante che non lo indica', () => {
        const raw = shopifyProduct({
            id: 2,
            title: 'Olio EVO 500 ml',
            variants: [
                { id: 21, title: 'Singola', available: true, price: '20.00' },
                { id: 22, title: 'Confezione da 3', available: true, price: '55.00' },
            ],
        });
        const p = normalizeShopifyProduct(raw, 'https://negozio.example', 'EUR');
        assert.equal(p.volumeMl, null);
        assert.equal(p.pricePerLiterCents, null);
    });

    it('l\'hash non cambia se cambia solo updated_at', () => {
        const a = shopifyProduct({ id: 3, title: 'Olio 1 L', price: '30.00' });
        const b = { ...a, updated_at: '2030-01-01T00:00:00Z' };
        assert.equal(
            productContentHash(normalizeShopifyProduct(a, 'https://x.example', 'EUR')),
            productContentHash(normalizeShopifyProduct(b, 'https://x.example', 'EUR')),
        );
    });

    it('WooCommerce: unità minori, prezzo barrato e categorie', () => {
        const p = normalizeWooProduct({
            id: 77,
            name: 'Olio Nuovo &#8211; 500ml',
            slug: 'olio-nuovo',
            permalink: 'https://woo.example/prodotto/olio-nuovo/',
            short_description: '<p>Prima spremitura.</p>',
            description: '',
            prices: { price: '1900', regular_price: '2200', sale_price: '1900', currency_code: 'EUR', currency_minor_unit: 2 },
            is_in_stock: true,
            categories: [{ id: 1, name: 'Olio' }],
            tags: [{ id: 2, name: 'Novello' }],
            images: [{ src: 'https://woo.example/img.jpg' }],
        });
        assert.equal(p.title, 'Olio Nuovo – 500ml');
        assert.equal(p.minPriceCents, 1900);
        assert.equal(p.onSale, true);
        assert.equal(p.currency, 'EUR');
        assert.equal(p.pricePerLiterCents, 3800);
        assert.deepEqual(p.tags, ['Novello']);
    });

    it('converte prezzi decimali e HTML in modo prevedibile', () => {
        assert.equal(toCents('12.5'), 1250);
        assert.equal(toCents('12,50'), 1250);
        assert.equal(toCents(null), null);
        assert.equal(htmlToText('<script>alert(1)</script><p>Ciao&nbsp;mondo</p>'), 'Ciao mondo');
    });
});

describe('confronto tra fotografie', () => {
    const base = (overrides = {}) => normalizeShopifyProduct(
        shopifyProduct({ id: 5, title: 'Olio Riserva 500 ml', price: '25.00', tags: ['olio'], ...overrides }),
        'https://x.example', 'EUR',
    );

    it('rileva variazione di prezzo con percentuale', () => {
        const events = diffProducts(base(), base({ price: '28.00' }));
        const priceEvent = events.find((e) => e.type === 'prezzo_variato');
        assert.ok(priceEvent);
        assert.equal(priceEvent.after.changePct, 12);
        assert.match(priceEvent.summary, /\+12%/);
    });

    it('rileva inizio sconto, esaurimento e modifiche di testo', () => {
        const events = diffProducts(
            base(),
            base({ price: '20.00', compareAt: '25.00', available: false, title: 'Olio Riserva 500 ml – Edizione limitata', tags: ['olio', 'regalo'] }),
        );
        const types = events.map((e) => e.type).sort();
        assert.deepEqual(types, ['esaurito', 'prezzo_variato', 'sconto_iniziato', 'testo_modificato']);
        const text = events.find((e) => e.type === 'testo_modificato');
        assert.deepEqual(text.after.addedTags, ['regalo']);
    });

    it('non produce eventi se nulla di rilevante è cambiato', () => {
        assert.deepEqual(diffProducts(base(), base()), []);
    });

    it('pagine: righe aggiunte e rimosse', () => {
        const ev = diffPages(
            { title: 'Home', metaDescription: null, textContent: 'Benvenuti\nSpedizione in 48 ore' },
            { title: 'Home', metaDescription: null, textContent: 'Benvenuti\nSpedizione gratuita sopra 60 €' },
        );
        assert.equal(ev.type, 'pagina_modificata');
        assert.deepEqual(ev.after.addedLines, ['Spedizione gratuita sopra 60 €']);
        assert.deepEqual(ev.before.removedLines, ['Spedizione in 48 ore']);
        assert.equal(diffPages({ title: 'A', metaDescription: null, textContent: 'x' }, { title: 'A', metaDescription: null, textContent: 'x' }), null);
    });
});
