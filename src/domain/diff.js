import { formatMoney } from './text.js';

/**
 * Confronto tra due fotografie dello stesso prodotto (o della stessa pagina).
 * Produce eventi descrittivi: sono dati osservati, non giudizi.
 */

function pct(before, after) {
    if (!before) return null;
    return Math.round(((after - before) / before) * 1000) / 10;
}

const pctFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

function signed(value) {
    return `${value > 0 ? '+' : ''}${pctFormat.format(value)}`;
}

function variantLabel(product, variant) {
    return product.variants.length > 1 && variant.title ? `${product.title} – ${variant.title}` : product.title;
}

/**
 * @param {object} prev  prodotto normalizzato precedente
 * @param {object} next  prodotto normalizzato attuale
 * @returns {Array<{type, summary, before, after}>}
 */
export function diffProducts(prev, next) {
    const events = [];
    const currency = next.currency ?? prev.currency;

    const prevVariants = new Map(prev.variants.map((v) => [v.externalId, v]));
    const nextVariants = new Map(next.variants.map((v) => [v.externalId, v]));

    for (const [id, nv] of nextVariants) {
        const pv = prevVariants.get(id);
        if (!pv) {
            events.push({
                type: 'variante_aggiunta',
                summary: `Nuova variante: ${variantLabel(next, nv)} a ${formatMoney(nv.priceCents, currency)}`,
                before: null,
                after: { variant: nv },
            });
            continue;
        }
        if (pv.priceCents !== null && nv.priceCents !== null && pv.priceCents !== nv.priceCents) {
            const change = pct(pv.priceCents, nv.priceCents);
            events.push({
                type: 'prezzo_variato',
                summary: `Prezzo variato: ${variantLabel(next, nv)}: ${formatMoney(pv.priceCents, currency)} → ${formatMoney(nv.priceCents, currency)}${change !== null ? ` (${signed(change)}%)` : ''}`,
                before: { variantId: id, priceCents: pv.priceCents, compareAtCents: pv.compareAtCents },
                after: { variantId: id, priceCents: nv.priceCents, compareAtCents: nv.compareAtCents, changePct: change },
            });
        }
    }
    for (const [id, pv] of prevVariants) {
        if (!nextVariants.has(id)) {
            events.push({
                type: 'variante_rimossa',
                summary: `Variante non più presente: ${variantLabel(prev, pv)}`,
                before: { variant: pv },
                after: null,
            });
        }
    }

    if (!prev.onSale && next.onSale) {
        events.push({
            type: 'sconto_iniziato',
            summary: `Sconto avviato su ${next.title}${next.maxDiscountPct ? ` (fino a -${pctFormat.format(next.maxDiscountPct)}% sul prezzo barrato)` : ''}`,
            before: { onSale: false },
            after: { onSale: true, maxDiscountPct: next.maxDiscountPct },
        });
    } else if (prev.onSale && !next.onSale) {
        events.push({
            type: 'sconto_terminato',
            summary: `Sconto terminato su ${next.title}`,
            before: { onSale: true, maxDiscountPct: prev.maxDiscountPct },
            after: { onSale: false },
        });
    } else if (prev.onSale && next.onSale && prev.maxDiscountPct !== next.maxDiscountPct) {
        events.push({
            type: 'sconto_modificato',
            summary: `Sconto modificato su ${next.title}: -${pctFormat.format(prev.maxDiscountPct)}% → -${pctFormat.format(next.maxDiscountPct)}%`,
            before: { maxDiscountPct: prev.maxDiscountPct },
            after: { maxDiscountPct: next.maxDiscountPct },
        });
    }

    if (prev.available === true && next.available === false) {
        events.push({ type: 'esaurito', summary: `Esaurito: ${next.title}`, before: { available: true }, after: { available: false } });
    } else if (prev.available === false && next.available === true) {
        events.push({ type: 'tornato_disponibile', summary: `Di nuovo disponibile: ${next.title}`, before: { available: false }, after: { available: true } });
    }

    const changedFields = [];
    if (prev.title !== next.title) changedFields.push('titolo');
    if (prev.descriptionText !== next.descriptionText) changedFields.push('descrizione');
    if (prev.productType !== next.productType) changedFields.push('categoria');
    const addedTags = next.tags.filter((t) => !prev.tags.includes(t));
    const removedTags = prev.tags.filter((t) => !next.tags.includes(t));
    if (addedTags.length || removedTags.length) changedFields.push('tag');
    if (changedFields.length) {
        events.push({
            type: 'testo_modificato',
            summary: `Comunicazione modificata su ${next.title}: ${changedFields.join(', ')}`
                + (prev.title !== next.title ? ` (titolo precedente: "${prev.title}")` : ''),
            before: { title: prev.title, productType: prev.productType, removedTags },
            after: { title: next.title, productType: next.productType, addedTags, fields: changedFields },
        });
    }

    return events;
}

/** Differenze riga per riga tra due testi di pagina (insiemi di righe, non diff posizionale). */
export function diffPages(prev, next, { maxLines = 15 } = {}) {
    const prevLines = new Set(prev.textContent.split('\n').map((l) => l.trim()).filter(Boolean));
    const nextLines = new Set(next.textContent.split('\n').map((l) => l.trim()).filter(Boolean));
    const added = [...nextLines].filter((l) => !prevLines.has(l));
    const removed = [...prevLines].filter((l) => !nextLines.has(l));
    const changes = [];
    if (prev.title !== next.title) changes.push('titolo');
    if (prev.metaDescription !== next.metaDescription) changes.push('meta description');
    if (added.length || removed.length) changes.push(`testo (+${added.length} / -${removed.length} righe)`);
    if (!changes.length) return null;
    return {
        type: 'pagina_modificata',
        summary: `Pagina modificata: ${changes.join(', ')}`,
        before: { title: prev.title, metaDescription: prev.metaDescription, removedLines: removed.slice(0, maxLines) },
        after: { title: next.title, metaDescription: next.metaDescription, addedLines: added.slice(0, maxLines) },
    };
}
