import * as cheerio from 'cheerio';
import { normalizeWhitespace, stableHash } from '../domain/text.js';

const PRICE_PATTERN = /(?:€\s?\d{1,4}(?:[.,]\d{2})?|\d{1,4}(?:[.,]\d{2})?\s?€|EUR\s?\d{1,4}(?:[.,]\d{2})?)/g;

/** Estrae da una pagina HTML gli elementi utili al confronto nel tempo. */
export function extractPage(html) {
    const $ = cheerio.load(html);
    const title = normalizeWhitespace($('title').first().text()) || null;
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
    const headings = $('h1, h2, h3')
        .map((_, el) => normalizeWhitespace($(el).text()))
        .get()
        .filter(Boolean)
        .slice(0, 60);

    // Si tiene l'header: barre promozionali ("spedizione gratuita sopra...") sono spesso lì.
    $('script, style, noscript, template, svg, iframe, nav, footer').remove();
    const root = $('body');
    root.find('br').replaceWith('\n');
    root.find('p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article, button').each((_, el) => {
        $(el).append('\n');
    });
    const textContent = normalizeWhitespace(root.text())
        .split('\n')
        .filter((line, index, lines) => lines.indexOf(line) === index) // righe ripetute (menu, badge) una sola volta
        .join('\n');

    const priceMentions = [...new Set(textContent.match(PRICE_PATTERN) ?? [])].slice(0, 50);
    return { title, metaDescription, headings, textContent, priceMentions };
}

export function pageContentHash(page) {
    return stableHash({ title: page.title, metaDescription: page.metaDescription, textContent: page.textContent });
}

export async function collectWebPage(source, http) {
    const res = await http.get(source.url, { accept: 'text/html,application/xhtml+xml' });
    const page = extractPage(res.body);
    const warnings = page.textContent.length < 200
        ? ['Testo estratto molto breve: la pagina potrebbe essere generata via JavaScript']
        : [];
    return { page: { ...page, httpStatus: res.status }, warnings };
}
