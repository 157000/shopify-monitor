import { collectShopify } from '../collectors/shopify.js';
import { collectWooCommerce } from '../collectors/woocommerce.js';
import { collectWebPage, pageContentHash } from '../collectors/webPage.js';
import { diffPages, diffProducts } from '../domain/diff.js';
import { productContentHash } from '../domain/products.js';
import { RobotsDisallowedError } from '../http/politeFetch.js';
import { log } from '../log.js';
import { withRun } from '../runs.js';

export const COLLECTABLE_KINDS = ['shopify', 'woocommerce', 'web_page'];

export async function insertEvent(tx, e) {
    const row = await tx.one(
        `INSERT INTO events (run_id, brand_id, source_id, product_id, content_id, event_type, observed_at,
                             is_baseline, summary, before, after, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [e.runId ?? null, e.brandId, e.sourceId ?? null, e.productId ?? null, e.contentId ?? null, e.type,
            e.observedAt, e.isBaseline ?? false, e.summary,
            e.before ? JSON.stringify(e.before) : null, e.after ? JSON.stringify(e.after) : null, e.sourceUrl ?? null],
    );
    return row.id;
}

/** Ricostruisce dal database la forma normalizzata necessaria al confronto. */
function snapshotToProduct(row) {
    return {
        title: row.title,
        descriptionText: row.description_text ?? '',
        productType: row.product_type,
        tags: row.tags ?? [],
        currency: row.currency,
        variants: row.variants ?? [],
        onSale: row.on_sale,
        maxDiscountPct: row.max_discount_pct,
        available: row.available,
    };
}

async function insertProductSnapshot(tx, productId, runId, observedAt, item, hash) {
    const row = await tx.one(
        `INSERT INTO product_snapshots (product_id, run_id, observed_at, content_hash, title, description_text,
            product_type, vendor, tags, currency, min_price_cents, max_price_cents, on_sale, max_discount_pct,
            available, volume_ml, price_per_liter_cents, volume_note, variants, image_url, image_count,
            published_at, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING id`,
        [productId, runId, observedAt, hash, item.title, item.descriptionText, item.productType, item.vendor,
            item.tags, item.currency, item.minPriceCents, item.maxPriceCents, item.onSale, item.maxDiscountPct,
            item.available, item.volumeMl, item.pricePerLiterCents, item.volumeNote,
            JSON.stringify(item.variants), item.imageUrl, item.imageCount, item.publishedAt, JSON.stringify(item.raw)],
    );
    await tx.query('UPDATE products SET current_snapshot_id = $2 WHERE id = $1', [productId, row.id]);
    return row.id;
}

export async function persistProducts(db, { source, runId, observedAt, items, complete, suspiciousDropRatio }) {
    const isBaseline = source.last_success_at === null;
    const unique = new Map(items.map((item) => [item.externalId, item])); // la paginazione può restituire doppioni

    return db.transaction(async (tx) => {
        const { rows } = await tx.query(
            `SELECT p.id, p.external_id, p.removed_at, s.content_hash, s.title, s.description_text, s.product_type,
                    s.tags, s.currency, s.variants, s.on_sale, s.max_discount_pct, s.available
               FROM products p LEFT JOIN product_snapshots s ON s.id = p.current_snapshot_id
              WHERE p.source_id = $1`,
            [source.id],
        );
        const existing = new Map(rows.map((r) => [r.external_id, r]));
        const counters = { nuovi: 0, modificati: 0, invariati: 0, rimossi: 0, eventi: 0 };
        const warnings = [];
        const base = { runId, brandId: source.brand_id, sourceId: source.id, observedAt };

        for (const item of unique.values()) {
            const hash = productContentHash(item);
            const row = existing.get(item.externalId);

            if (!row) {
                const product = await tx.one(
                    `INSERT INTO products (source_id, brand_id, external_id, handle, url, first_seen_at, last_seen_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
                    [source.id, source.brand_id, item.externalId, item.handle, item.url, observedAt],
                );
                const snapshotId = await insertProductSnapshot(tx, product.id, runId, observedAt, item, hash);
                await insertEvent(tx, {
                    ...base, productId: product.id, type: 'nuovo_prodotto', isBaseline, sourceUrl: item.url,
                    summary: isBaseline ? `Prima rilevazione: ${item.title}` : `Nuovo prodotto: ${item.title}`,
                    after: { snapshotId, minPriceCents: item.minPriceCents, currency: item.currency },
                });
                counters.nuovi++;
                counters.eventi++;
                continue;
            }

            await tx.query(
                'UPDATE products SET last_seen_at = $2, removed_at = NULL, handle = $3, url = $4 WHERE id = $1',
                [row.id, observedAt, item.handle, item.url],
            );
            if (row.removed_at) {
                await insertEvent(tx, {
                    ...base, productId: row.id, type: 'prodotto_ripristinato', sourceUrl: item.url,
                    summary: `Di nuovo a catalogo: ${item.title}`,
                });
                counters.eventi++;
            }
            if (row.content_hash === hash) {
                counters.invariati++;
                continue;
            }
            const snapshotId = await insertProductSnapshot(tx, row.id, runId, observedAt, item, hash);
            for (const event of diffProducts(snapshotToProduct(row), item)) {
                await insertEvent(tx, {
                    ...base, productId: row.id, sourceUrl: item.url, type: event.type, summary: event.summary,
                    before: event.before, after: { ...event.after, snapshotId },
                });
                counters.eventi++;
            }
            counters.modificati++;
        }

        // Rimozioni: solo se il catalogo è stato letto per intero e il calo non è sospetto.
        const missing = rows.filter((r) => !r.removed_at && !unique.has(r.external_id));
        const activeBefore = rows.filter((r) => !r.removed_at).length;
        if (!complete) {
            warnings.push('Raccolta incompleta: rimozioni non valutate');
        } else if (activeBefore >= 5 && missing.length / activeBefore > suspiciousDropRatio) {
            warnings.push(`Calo anomalo del catalogo (${missing.length} su ${activeBefore} prodotti non trovati): `
                + 'rimozioni non registrate, verificare la fonte');
        } else {
            for (const r of missing) {
                await tx.query('UPDATE products SET removed_at = $2 WHERE id = $1', [r.id, observedAt]);
                await insertEvent(tx, {
                    ...base, productId: r.id, type: 'prodotto_rimosso', summary: `Non più a catalogo: ${r.title}`,
                    before: { title: r.title },
                });
                counters.rimossi++;
                counters.eventi++;
            }
        }
        return { counters, warnings, isBaseline };
    });
}

export async function persistPage(db, { source, runId, observedAt, page }) {
    const hash = pageContentHash(page);
    return db.transaction(async (tx) => {
        const last = await tx.one(
            'SELECT * FROM page_snapshots WHERE source_id = $1 ORDER BY observed_at DESC, id DESC LIMIT 1',
            [source.id],
        );
        if (last && last.content_hash === hash) return { changed: false, eventi: 0 };

        const snapshot = await tx.one(
            `INSERT INTO page_snapshots (source_id, run_id, observed_at, content_hash, http_status, title,
                                         meta_description, headings, text_content, price_mentions)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [source.id, runId, observedAt, hash, page.httpStatus ?? null, page.title, page.metaDescription,
                page.headings, page.textContent, page.priceMentions],
        );
        const base = { runId, brandId: source.brand_id, sourceId: source.id, observedAt, sourceUrl: source.url };
        if (!last) {
            await insertEvent(tx, {
                ...base, type: 'pagina_baseline', isBaseline: true,
                summary: `Prima rilevazione della pagina${page.title ? ` "${page.title}"` : ''}`,
                after: { snapshotId: snapshot.id },
            });
            return { changed: true, eventi: 1 };
        }
        const event = diffPages(
            { title: last.title, metaDescription: last.meta_description, textContent: last.text_content },
            page,
        );
        if (!event) return { changed: true, eventi: 0 };
        await insertEvent(tx, {
            ...base, type: event.type, summary: event.summary, before: { ...event.before, snapshotId: last.id },
            after: { ...event.after, snapshotId: snapshot.id },
        });
        return { changed: true, eventi: 1 };
    });
}

async function markSourceSuccess(db, source, { warnings, currency }) {
    await db.query(
        `UPDATE sources SET access_status = 'ok', last_attempt_at = now(), last_success_at = now(),
                consecutive_failures = 0, last_error = $2, currency = COALESCE($3, currency)
          WHERE id = $1`,
        [source.id, warnings.length ? warnings.join(' | ') : null, currency ?? null],
    );
}

async function markSourceFailure(db, source, err) {
    const status = err instanceof RobotsDisallowedError ? 'bloccato_robots' : 'errore';
    await db.query(
        `UPDATE sources SET access_status = $2, last_attempt_at = now(),
                consecutive_failures = consecutive_failures + 1, last_error = $3
          WHERE id = $1`,
        [source.id, status, String(err?.message ?? err).slice(0, 1000)],
    );
}

export async function selectDueSources(db, { brandSlug = null, sourceId = null, force = false } = {}) {
    const { rows } = await db.query(
        `SELECT s.*, b.slug AS brand_slug, b.name AS brand_name
           FROM sources s JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled AND b.active AND s.kind = ANY($1)
            AND ($2::text IS NULL OR b.slug = $2)
            AND ($3::int IS NULL OR s.id = $3)
            AND ($4 OR s.last_attempt_at IS NULL
                 OR s.last_attempt_at < now() - make_interval(hours => s.min_interval_hours))
          ORDER BY s.id`,
        [COLLECTABLE_KINDS, brandSlug, sourceId, force],
    );
    return rows;
}

export async function runCollect({ db, http, settings }, options = {}) {
    return withRun(db, 'collect', async (runId) => {
        const sources = await selectDueSources(db, options);
        const report = [];
        let failures = 0;

        for (const source of sources) {
            const observedAt = new Date();
            const label = `${source.brand_slug} · ${source.kind} · ${source.url}`;
            try {
                if (source.kind === 'web_page') {
                    const { page, warnings } = await collectWebPage(source, http);
                    const result = await persistPage(db, { source, runId, observedAt, page });
                    await markSourceSuccess(db, source, { warnings });
                    report.push({ sourceId: source.id, kind: source.kind, ...result, warnings });
                    log.info(`${label}: ${result.changed ? 'pagina cambiata' : 'nessun cambiamento'}`);
                } else {
                    const collector = source.kind === 'shopify' ? collectShopify : collectWooCommerce;
                    const collected = await collector(source, http, { maxPages: settings.collect.maxPages });
                    const result = await persistProducts(db, {
                        source, runId, observedAt, items: collected.items, complete: collected.complete,
                        suspiciousDropRatio: settings.collect.suspiciousDropRatio,
                    });
                    const warnings = [...collected.warnings, ...result.warnings];
                    await markSourceSuccess(db, source, { warnings, currency: collected.currency });
                    report.push({
                        sourceId: source.id, kind: source.kind, prodotti: collected.items.length,
                        baseline: result.isBaseline, ...result.counters, warnings,
                    });
                    log.info(`${label}: ${collected.items.length} prodotti, ${result.counters.eventi} eventi`
                        + (warnings.length ? ` — avvisi: ${warnings.join(' | ')}` : ''));
                }
            } catch (err) {
                failures++;
                await markSourceFailure(db, source, err);
                report.push({ sourceId: source.id, kind: source.kind, errore: String(err?.message ?? err) });
                log.warn(`${label}: ${err?.message ?? err}`);
            }
        }

        let status = 'ok';
        if (failures && failures === sources.length) status = 'errore';
        else if (failures) status = 'parziale';
        return { status, stats: { fonti: sources.length, fallite: failures, dettaglio: report } };
    });
}
