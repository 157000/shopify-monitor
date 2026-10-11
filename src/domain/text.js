import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

/** Converte HTML in testo leggibile, preservando le interruzioni di paragrafo. */
export function htmlToText(html) {
    if (!html) return '';
    const $ = cheerio.load(`<div id="__root">${html}</div>`);
    $('script, style, noscript, template, svg').remove();
    $('br').replaceWith('\n');
    $('p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article').each((_, el) => {
        $(el).append('\n');
    });
    return normalizeWhitespace($('#__root').text());
}

export function normalizeWhitespace(text) {
    return String(text ?? '')
        .replace(/ /g, ' ')
        .split('\n')
        .map((line) => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
        .filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== ''))
        .join('\n')
        .trim();
}

/** Hash stabile di un valore JSON (chiavi ordinate). */
export function stableHash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

/** Prezzo decimale in stringa ("12.50", "12,50") → centesimi interi. */
export function toCents(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!Number.isFinite(normalized)) return null;
    return Math.round(normalized * 100);
}

export function formatMoney(cents, currency) {
    if (cents === null || cents === undefined) return 'n.d.';
    const amount = cents / 100;
    if (!currency) {
        return `${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (valuta n.v.)`;
    }
    try {
        return amount.toLocaleString('it-IT', { style: 'currency', currency });
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

export function truncate(text, max) {
    if (!text || text.length <= max) return { text: text ?? '', truncated: false };
    return { text: text.slice(0, max), truncated: true };
}
