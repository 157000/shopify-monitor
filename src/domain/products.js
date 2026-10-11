import { htmlToText, stableHash, toCents } from './text.js';
import { parseVolume, pricePerLiterCents } from './volume.js';

/**
 * Modello prodotto comune a tutte le piattaforme. Contiene solo dati osservati o derivati
 * in modo deterministico; nessuna interpretazione.
 */

const DEFAULT_VARIANT_TITLES = new Set(['default title', 'default', '']);

function variantVolume(variantTitle, productTitle, variantCount) {
    const meaningfulTitle = variantTitle && !DEFAULT_VARIANT_TITLES.has(variantTitle.trim().toLowerCase());
    if (meaningfulTitle) {
        const parsed = parseVolume(variantTitle);
        if (parsed.ml) return parsed;
        if (variantCount > 1) {
            // Con più varianti, il volume nel titolo del prodotto potrebbe non valere per questa variante
            // (es. "Confezione da 3"): meglio non stimare.
            return { ml: null, note: `variante "${variantTitle}" senza volume esplicito` };
        }
    }
    return parseVolume(productTitle);
}

/** Completa i campi derivati (prezzi min/max, sconti, disponibilità, formato d'ingresso). */
export function finalizeProduct(product) {
    const variants = product.variants.map((variant) => {
        const volume = variantVolume(variant.title, product.title, product.variants.length);
        return {
            ...variant,
            volumeMl: volume.ml,
            volumeNote: volume.note,
            pricePerLiterCents: pricePerLiterCents(variant.priceCents, volume.ml),
        };
    });

    const priced = variants.filter((v) => v.priceCents !== null);
    const prices = priced.map((v) => v.priceCents);
    const discounts = priced
        .filter((v) => v.compareAtCents !== null && v.compareAtCents > v.priceCents)
        .map((v) => ((v.compareAtCents - v.priceCents) / v.compareAtCents) * 100);
    const availability = variants.map((v) => v.available).filter((a) => typeof a === 'boolean');

    // Formato d'ingresso: la variante più economica con volume riconosciuto.
    const entry = priced
        .filter((v) => v.volumeMl)
        .sort((a, b) => a.priceCents - b.priceCents)[0];

    return {
        ...product,
        tags: [...new Set(product.tags.map((t) => t.trim()).filter(Boolean))].sort(),
        variants,
        minPriceCents: product.minPriceCents ?? (prices.length ? Math.min(...prices) : null),
        maxPriceCents: product.maxPriceCents ?? (prices.length ? Math.max(...prices) : null),
        onSale: discounts.length > 0,
        maxDiscountPct: discounts.length ? Math.round(Math.max(...discounts) * 100) / 100 : null,
        available: availability.length ? availability.some(Boolean) : null,
        volumeMl: entry?.volumeMl ?? null,
        pricePerLiterCents: entry?.pricePerLiterCents ?? null,
        volumeNote: entry ? entry.volumeNote : (variants[0]?.volumeNote ?? 'nessuna variante con prezzo'),
    };
}

/**
 * Hash del solo contenuto osservato. Esclude i timestamp della piattaforma (cambiano a ogni movimento
 * di magazzino) e i campi derivati (un miglioramento del parser non deve generare nuove fotografie).
 */
export function productContentHash(product) {
    return stableHash({
        externalId: product.externalId,
        handle: product.handle,
        title: product.title,
        url: product.url,
        productType: product.productType,
        vendor: product.vendor,
        tags: product.tags,
        descriptionText: product.descriptionText,
        publishedAt: product.publishedAt,
        imageUrl: product.imageUrl,
        imageCount: product.imageCount,
        currency: product.currency,
        minPriceCents: product.minPriceCents,
        maxPriceCents: product.maxPriceCents,
        variants: product.variants.map((v) => ({
            externalId: v.externalId,
            title: v.title,
            sku: v.sku,
            priceCents: v.priceCents,
            compareAtCents: v.compareAtCents,
            available: v.available,
        })),
    });
}

export function normalizeShopifyProduct(p, baseUrl, currency) {
    const tags = Array.isArray(p.tags) ? p.tags : String(p.tags ?? '').split(',');
    const variants = (p.variants ?? []).map((v) => ({
        externalId: String(v.id),
        title: v.title ?? '',
        sku: v.sku || null,
        priceCents: toCents(v.price),
        compareAtCents: toCents(v.compare_at_price),
        available: typeof v.available === 'boolean' ? v.available : null,
    }));

    return finalizeProduct({
        externalId: String(p.id),
        handle: p.handle ?? null,
        title: String(p.title ?? '').trim(),
        url: p.handle ? `${baseUrl}/products/${p.handle}` : baseUrl,
        productType: p.product_type || null,
        vendor: p.vendor || null,
        tags,
        descriptionText: htmlToText(p.body_html),
        publishedAt: p.published_at ?? null,
        imageUrl: p.images?.[0]?.src ?? null,
        imageCount: p.images?.length ?? 0,
        currency: currency ?? null,
        variants,
        raw: p,
    });
}

function wooAmountToCents(amount, minorUnit) {
    if (amount === null || amount === undefined || amount === '') return null;
    const value = Number(amount);
    if (!Number.isFinite(value)) return null;
    const unit = Number.isInteger(minorUnit) ? minorUnit : 2;
    return Math.round(value * 10 ** (2 - unit));
}

/**
 * WooCommerce Store API (/wp-json/wc/store/v1/products).
 * Limite noto: per i prodotti variabili restituisce l'intervallo di prezzo, non il prezzo di ogni variante.
 */
export function normalizeWooProduct(p) {
    const prices = p.prices ?? {};
    const minor = prices.currency_minor_unit;
    const price = wooAmountToCents(prices.price, minor);
    const regular = wooAmountToCents(prices.regular_price, minor);
    const range = prices.price_range;

    const variants = [{
        externalId: String(p.id),
        title: range ? 'intervallo di prezzo (prodotto variabile)' : '',
        sku: p.sku || null,
        priceCents: price,
        compareAtCents: regular !== null && price !== null && regular > price ? regular : null,
        available: typeof p.is_in_stock === 'boolean' ? p.is_in_stock : null,
    }];

    const description = [htmlToText(p.short_description), htmlToText(p.description)].filter(Boolean).join('\n\n');

    return finalizeProduct({
        externalId: String(p.id),
        handle: p.slug ?? null,
        title: htmlToText(p.name),
        url: p.permalink ?? null,
        productType: (p.categories ?? []).map((c) => htmlToText(c.name)).join(' / ') || null,
        vendor: null,
        tags: (p.tags ?? []).map((t) => htmlToText(t.name)),
        descriptionText: description,
        publishedAt: null,
        imageUrl: p.images?.[0]?.src ?? null,
        imageCount: p.images?.length ?? 0,
        currency: prices.currency_code ?? null,
        variants,
        minPriceCents: range ? wooAmountToCents(range.min_amount, minor) : undefined,
        maxPriceCents: range ? wooAmountToCents(range.max_amount, minor) : undefined,
        raw: p,
    });
}
